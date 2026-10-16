import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { clinicaAdminDoChamador, cronForbidden, cronOrUserOk, cronSecretOk } from '../_shared/cronAuth.ts'
import { corsPadrao } from '../_shared/cors.ts';
import { consumoNotificacoes } from '../_shared/limitesClinica.ts';
import { checkNotificationSendLimits } from '../_shared/notificationRateLimit.ts';
import { canaisDeLembrete, dentroDaJanelaDeContato } from '../_shared/notificationDeliveryPolicy.ts';
import { sendBrandedBrevoRequest } from '../_shared/brevoEmail.ts';
import { normalizeWhatsAppPhone, notificationHtml } from '../_shared/patientJourneyDelivery.ts';

// Atribuído em cada request (reflete a origem permitida). Helpers
// top-level (json/reply) capturam esta variável por closure.
let corsHeaders: Record<string, string> = {};

interface NotificationItem {
  id: string; tipo: string; destinatario_email: string | null
  destinatario_telefone: string | null; destinatario_nome: string | null
  assunto: string | null; conteudo: string; tentativas: number
  max_tentativas: number; clinica_id: string | null
  destinatario_id: string | null; dados_extras?: Record<string, unknown>

}

Deno.serve(async (req) => {
  corsHeaders = { ...corsPadrao(req),};
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!cronOrUserOk(req)) return cronForbidden(corsHeaders)
  const startTime = Date.now()

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const chamadaDoCron = req.headers.has('x-cron-secret') && cronSecretOk(req)
    const clinicaId = chamadaDoCron ? null : await clinicaAdminDoChamador(req, supabase)
    if (!chamadaDoCron && !clinicaId) return cronForbidden(corsHeaders)

    const { data: pendentes, error } = await supabase.rpc('reivindicar_notificacoes', {
      p_limite: 50, p_clinica_id: clinicaId,
    })
    if (error) throw new Error(`Erro ao reservar fila: ${error.message}`)
    if (!pendentes?.length) return new Response(JSON.stringify({ success: true, processados: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

    let successCount = 0; let errorCount = 0
    const falhar = async (notif: NotificationItem, mensagem: string, retryable = true) => {
      const terminal = !retryable || notif.tentativas >= notif.max_tentativas
      const minutos = Math.min(60, 5 * 2 ** Math.max(0, notif.tentativas - 1))
      await supabase.from('notification_queue').update({
        status: terminal ? 'erro' : 'pendente', erro_mensagem: mensagem.slice(0, 1000),
        ultimo_erro_em: new Date().toISOString(), iniciado_em: null,
        ...(!terminal ? { agendado_para: new Date(Date.now() + minutos * 60_000).toISOString() } : {}),
      }).eq('id', notif.id)
    }
    const adiarPorLimite = async (notif: NotificationItem, mensagem: string) => {
      const { error } = await supabase.from('notification_queue').update({
        status: 'pendente',
        tentativas: Math.max(0, notif.tentativas - 1),
        agendado_para: new Date(Date.now() + 60_000).toISOString(),
        erro_mensagem: mensagem,
        ultimo_erro_em: new Date().toISOString(),
        iniciado_em: null,
      }).eq('id', notif.id).eq('status', 'enviando')
      if (error) throw error
    }
    const marcarIncerto = async (notif: NotificationItem, mensagem: string) => {
      await supabase.from('notification_queue').update({
        status: 'incerto', erro_mensagem: mensagem.slice(0, 1000),
        ultimo_erro_em: new Date().toISOString(), iniciado_em: null,
      }).eq('id', notif.id).eq('status', 'enviando')
    }
    // Limite mensal de envios por clínica (Limites e Consumo). Contado uma vez
    // por clínica nesta execução e incrementado a cada envio bem-sucedido.
    const consumo = new Map<string, { usados: number; limite: number }>()
    const concluir = async (id: string, clinica: string | null) => {
      if (clinica && consumo.has(clinica)) consumo.get(clinica)!.usados++
      return supabase.from('notification_queue').update({
        status: 'enviado', enviado_em: new Date().toISOString(), iniciado_em: null, erro_mensagem: null,
      }).eq('id', id)
    }

    for (const notif of pendentes as NotificationItem[]) {
      let envioExternoIniciado = false
      try {
        if (notif.dados_extras?.journey === true) {
          const { data: valid, error: validationError } = await supabase.rpc('validar_notificacao_jornada', { p_id: notif.id })
          if (validationError) throw new Error('Falha ao validar a origem da notificação')
          if (!valid) continue
        }
        if (notif.clinica_id) {
          if (!consumo.has(notif.clinica_id)) consumo.set(notif.clinica_id, await consumoNotificacoes(supabase, notif.clinica_id))
          const c = consumo.get(notif.clinica_id)!
          if (c.usados >= c.limite) {
            await falhar(notif, `Limite mensal de ${c.limite} notificações da clínica atingido. Fale com o suporte para ampliar.`, false)
            errorCount++
            continue
          }
        }
        let destination = notif.tipo === 'whatsapp'
          ? notif.destinatario_telefone
          : notif.tipo === 'email' ? notif.destinatario_email : null
        const dadosExtras = notif.dados_extras || {}
        const lembreteDeConsulta = dadosExtras.tipo_notificacao === 'confirmacao_agendamento'
          || ['24h', '24h_whatsapp', '2h', '2h_whatsapp'].includes(String(dadosExtras.tipo_lembrete || ''))
        if (lembreteDeConsulta) {
          if (!notif.destinatario_id || !notif.clinica_id) throw new Error('Não foi possível confirmar as preferências do destinatário.')
          const { data: paciente, error: patientError } = await supabase.from('pacientes')
            .select('email, telefone, preferencia_canal_lembrete, horario_contato_inicio, horario_contato_fim, fuso_horario_contato')
            .eq('id', notif.destinatario_id).eq('clinica_id', notif.clinica_id).maybeSingle()
          if (patientError || !paciente) throw new Error('Não foi possível confirmar as preferências do destinatário.')
          if (typeof dadosExtras.agendamento_id === 'string') {
            const { data: agendamento, error: appointmentError } = await supabase.from('agendamentos')
              .select('data, hora_inicio, status')
              .eq('id', dadosExtras.agendamento_id).eq('clinica_id', notif.clinica_id).maybeSingle()
            if (appointmentError) throw new Error('Não foi possível validar a consulta do lembrete.')
            const agoraClinica = new Intl.DateTimeFormat('sv-SE', {
              timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
            }).format(new Date()).replace(' ', 'T')
            const horaConsulta = agendamento?.hora_inicio ? String(agendamento.hora_inicio).slice(0, 5) : ''
            const consultaAindaFutura = agendamento
              && ['agendado', 'confirmado'].includes(agendamento.status)
              && /^\d{4}-\d{2}-\d{2}$/.test(String(agendamento.data))
              && /^([01]\d|2[0-3]):[0-5]\d$/.test(horaConsulta)
              && `${agendamento.data}T${horaConsulta}` > agoraClinica
            if (!consultaAindaFutura) {
              const { error: cancelError } = await supabase.from('notification_queue').update({
                status: 'cancelado', erro_mensagem: 'A consulta não está mais elegível para lembrete.', iniciado_em: null,
              }).eq('id', notif.id).eq('status', 'enviando')
              if (cancelError) throw cancelError
              errorCount++
              continue
            }
          }
          const canaisPermitidos = canaisDeLembrete(paciente.preferencia_canal_lembrete, !!paciente.email, !!paciente.telefone)
          const permitido = notif.tipo === 'whatsapp' ? canaisPermitidos.whatsapp
            : notif.tipo === 'email' ? canaisPermitidos.email : false
          if (!permitido) {
            const { error: cancelError } = await supabase.from('notification_queue').update({
              status: 'cancelado', erro_mensagem: 'Preferência do paciente não permite este canal.', iniciado_em: null,
            }).eq('id', notif.id).eq('status', 'enviando')
            if (cancelError) throw cancelError
            errorCount++
            continue
          }
          if (notif.tipo === 'whatsapp') {
            notif.destinatario_telefone = paciente.telefone
            destination = paciente.telefone
          }
          if (notif.tipo === 'email') {
            notif.destinatario_email = paciente.email
            destination = paciente.email
          }
          if (!dentroDaJanelaDeContato(new Date(), paciente.horario_contato_inicio, paciente.horario_contato_fim, paciente.fuso_horario_contato)) {
            const { error: deferError } = await supabase.from('notification_queue').update({
              status: 'pendente', tentativas: Math.max(0, notif.tentativas - 1),
              agendado_para: new Date(Date.now() + 60 * 60_000).toISOString(),
              erro_mensagem: 'Fora da janela de contato do paciente; nova tentativa agendada.',
              ultimo_erro_em: new Date().toISOString(), iniciado_em: null,
            }).eq('id', notif.id).eq('status', 'enviando')
            if (deferError) throw deferError
            errorCount++
            continue
          }
        }
        if (destination) {
          const rateLimit = await checkNotificationSendLimits(supabase, {
            clinicId: notif.clinica_id,
            channel: notif.tipo,
            destination,
            hashSecret: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
          })
          if (rateLimit) {
            const detail = rateLimit === 'clinic'
              ? 'Limite de envios por minuto da clínica atingido; envio reagendado.'
              : 'Intervalo mínimo para este número ainda não foi atingido; envio reagendado.'
            await adiarPorLimite(notif, detail)
            errorCount++
            continue
          }
        }
        if (notif.tipo === 'email' && notif.destinatario_email) {
          const key = Deno.env.get('BREVO_API_KEY')
          if (!key) throw new Error('BREVO_API_KEY não configurada')
          envioExternoIniciado = true
          const res = await sendBrandedBrevoRequest({
            method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ sender: { name: 'EloLab Clínica', email: 'noreply@elolab.com.br' },
              to: [{ email: notif.destinatario_email, name: notif.destinatario_nome || '' }],
              subject: notif.assunto || 'Notificação EloLab', htmlContent: notificationHtml(notif.conteudo, notif.dados_extras?.journey === true) }),
          })
          if (!res.ok) {
            if (res.status >= 500) await marcarIncerto(notif, `Brevo HTTP ${res.status}; confira o provedor antes de repetir`)
            else await falhar(notif, `Brevo HTTP ${res.status}`)
            errorCount++; continue
          }
          const { error: completionError } = await concluir(notif.id, notif.clinica_id)
          if (completionError) { await marcarIncerto(notif, 'Brevo aceitou o envio, mas o status local não foi confirmado'); errorCount++; continue }
          successCount++
        } else if (notif.tipo === 'whatsapp' && notif.destinatario_telefone) {
          const url = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/+$/, '')
          const key = Deno.env.get('EVOLUTION_API_KEY')
          if (!url || !key) throw new Error('EVOLUTION_API_URL/KEY não configurados')
          const { data: session } = await supabase.from('whatsapp_sessions').select('instance_name')
            .eq('status', 'connected').eq('clinica_id', notif.clinica_id).limit(1).maybeSingle()
          if (!session?.instance_name) throw new Error('Nenhuma sessão WhatsApp conectada')
          const number = normalizeWhatsAppPhone(notif.destinatario_telefone)
          envioExternoIniciado = true
          const res = await fetch(`${url}/message/sendText/${session.instance_name}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key },
            body: JSON.stringify({ number, text: notif.conteudo }),
          })
          if (!res.ok) {
            if (res.status >= 500) await marcarIncerto(notif, `Evolution HTTP ${res.status}; confira o provedor antes de repetir`)
            else await falhar(notif, `Evolution ${res.status}: ${(await res.text()).slice(0, 700)}`)
            errorCount++; continue
          }
          const { error: completionError } = await concluir(notif.id, notif.clinica_id)
          if (completionError) { await marcarIncerto(notif, 'WhatsApp aceitou o envio, mas o status local não foi confirmado'); errorCount++; continue }
          successCount++
        } else {
          await falhar(notif, `Canal "${notif.tipo}" sem destinatário válido ou não suportado`, false); errorCount++
        }
      } catch (err) {
        if (envioExternoIniciado) await marcarIncerto(notif, `Resultado do provedor incerto: ${String(err)}`)
        else await falhar(notif, String(err))
        errorCount++
      }
    }

    const duration = Date.now() - startTime
    await supabase.from('automation_logs').insert({ tipo: 'fila_notificacao', nome: 'Processamento de Fila de Notificações',
      status: errorCount === 0 ? 'sucesso' : successCount === 0 ? 'erro' : 'parcial',
      registros_processados: pendentes.length, registros_sucesso: successCount, registros_erro: errorCount,
      duracao_ms: duration, executado_por: chamadaDoCron ? 'cron' : 'usuario', clinica_id: clinicaId })
    return new Response(JSON.stringify({ success: true, stats: { processados: pendentes.length, sucesso: successCount, erros: errorCount, duracao_ms: duration } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
