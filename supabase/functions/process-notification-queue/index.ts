import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { clinicaDoChamador, cronForbidden, cronOrUserOk, cronSecretOk } from '../_shared/cronAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

interface NotificationItem {
  id: string; tipo: string; destinatario_email: string | null
  destinatario_telefone: string | null; destinatario_nome: string | null
  assunto: string | null; conteudo: string; tentativas: number
  max_tentativas: number; clinica_id: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!cronOrUserOk(req)) return cronForbidden(corsHeaders)
  const startTime = Date.now()

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const chamadaDoCron = req.headers.has('x-cron-secret') && cronSecretOk(req)
    const clinicaId = chamadaDoCron ? null : await clinicaDoChamador(req, supabase)
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
    const concluir = async (id: string) => supabase.from('notification_queue').update({
      status: 'enviado', enviado_em: new Date().toISOString(), iniciado_em: null, erro_mensagem: null,
    }).eq('id', id)

    for (const notif of pendentes as NotificationItem[]) {
      try {
        if (notif.tipo === 'email' && notif.destinatario_email) {
          const key = Deno.env.get('BREVO_API_KEY')
          if (!key) throw new Error('BREVO_API_KEY não configurada')
          const res = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST', headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ sender: { name: 'EloLab Clínica', email: 'noreply@elolab.com.br' },
              to: [{ email: notif.destinatario_email, name: notif.destinatario_nome || '' }],
              subject: notif.assunto || 'Notificação EloLab', htmlContent: notif.conteudo.replace(/\n/g, '<br>') }),
          })
          if (!res.ok) { await falhar(notif, `Brevo ${res.status}: ${(await res.text()).slice(0, 700)}`); errorCount++; continue }
          await concluir(notif.id); successCount++
        } else if (notif.tipo === 'whatsapp' && notif.destinatario_telefone) {
          const url = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/+$/, '')
          const key = Deno.env.get('EVOLUTION_API_KEY')
          if (!url || !key) throw new Error('EVOLUTION_API_URL/KEY não configurados')
          const { data: session } = await supabase.from('whatsapp_sessions').select('instance_name')
            .eq('status', 'connected').eq('clinica_id', notif.clinica_id).limit(1).maybeSingle()
          if (!session?.instance_name) throw new Error('Nenhuma sessão WhatsApp conectada')
          const digits = notif.destinatario_telefone.replace(/\D/g, '')
          const res = await fetch(`${url}/message/sendText/${session.instance_name}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key },
            body: JSON.stringify({ number: digits.length >= 10 ? digits : `55${digits}`, text: notif.conteudo }),
          })
          if (!res.ok) { await falhar(notif, `Evolution ${res.status}: ${(await res.text()).slice(0, 700)}`); errorCount++; continue }
          await concluir(notif.id); successCount++
        } else {
          await falhar(notif, `Canal "${notif.tipo}" sem destinatário válido ou não suportado`, false); errorCount++
        }
      } catch (err) { await falhar(notif, String(err)); errorCount++ }
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
