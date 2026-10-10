import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cronOrUserOk, cronForbidden, cronSecretOk, clinicaDoChamador } from '../_shared/cronAuth.ts';
import { corsPadrao } from '../_shared/cors.ts';
import { sendBrevoEmail as sendSharedBrevoEmail } from '../_shared/brevoEmail.ts';

// Atribuído em cada request (reflete a origem permitida). Helpers
// top-level (json/reply) capturam esta variável por closure.
let corsHeaders: Record<string, string> = {};

interface Agendamento {
  id: string
  data: string
  hora_inicio: string
  status: string
  tipo: string | null
  paciente_id: string
  medico_id: string
  clinica_id: string
  pacientes: {
    nome: string
    email: string | null
    telefone: string | null
  }
  medicos: {
    crm: string
    nome: string | null
    especialidade: string | null
  }
}

Deno.serve(async (req) => {
  corsHeaders = { ...corsPadrao(req),};
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // O agendador (com o segredo) ou um usuário logado. A chave anon não basta.
  if (!cronOrUserOk(req)) return cronForbidden(corsHeaders);

  const startTime = Date.now()

  try {
    const chamadaDoCron = cronSecretOk(req);
    let corpo: Record<string, unknown> = {};
    if (!chamadaDoCron) {
      try { corpo = await req.json(); } catch { corpo = {}; }
    }
    const automationKey = chamadaDoCron ? null : corpo.automation_key;
    if (!chamadaDoCron && !['lembrete_consulta_24h', 'lembrete_consulta_2h', 'confirmacao_agendamento'].includes(String(automationKey))) {
      return new Response(JSON.stringify({ success: false, error: 'Informe qual janela de lembrete deseja executar.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const brevoApiKey = Deno.env.get('BREVO_API_KEY')
    const evolutionApiUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/+$/, '')
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const clinicaAlvo = chamadaDoCron ? null : await clinicaDoChamador(req, supabase);
    if (!chamadaDoCron && !clinicaAlvo) return cronForbidden(corsHeaders);

    // Cache clinic configs and WhatsApp instances per clinic. A single global
    // connected instance would send one clinic's messages through another
    // clinic's number when the cron processes multiple tenants.
    const clinicConfigCache: Record<string, any> = {}
    const whatsappInstanceCache: Record<string, string | null> = {}
    const whatsappInstancesUsed = new Set<string>()

    const { data: settings, error: settingsError } = await supabase
      .from('automation_settings')
      .select('chave, valor, ativo, clinica_id')
      .in('chave', ['lembrete_consulta_24h', 'lembrete_consulta_2h', 'confirmacao_agendamento'])
    if (settingsError) throw new Error(`Erro ao carregar configurações: ${settingsError.message}`)

    const { data: templates, error: templatesError } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('categoria', 'lembrete_consulta')
      .eq('tipo', 'email')
      .eq('ativo', true)
    if (templatesError) throw new Error(`Erro ao carregar modelos: ${templatesError.message}`)

    if (automationKey === 'confirmacao_agendamento') {
      const setting = settings?.find((item) => item.chave === 'confirmacao_agendamento' && item.clinica_id === clinicaAlvo);
      if (setting?.ativo === false) {
        return new Response(JSON.stringify({ success: true, message: 'A confirmação automática está desativada nesta clínica.', stats: { processados: 0, sucesso: 0, erros: 0 } }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const agendamentoId = typeof corpo.agendamento_id === 'string' ? corpo.agendamento_id : '';
      if (!agendamentoId) throw new Error('Agendamento não informado para confirmação.');

      const { data: agendamento, error: agendamentoError } = await supabase
        .from('agendamentos')
        .select('id, data, hora_inicio, tipo, clinica_id, pacientes!inner(id, nome, telefone), medicos!inner(nome, crm)')
        .eq('id', agendamentoId)
        .eq('clinica_id', clinicaAlvo)
        .maybeSingle();
      if (agendamentoError) throw new Error(`Erro ao localizar a consulta: ${agendamentoError.message}`);
      if (!agendamento) throw new Error('Consulta não encontrada nesta clínica.');

      const { data: templatesConfirmacao, error: templateConfirmacaoError } = await supabase
        .from('notification_templates')
        .select('id, nome, conteudo, clinica_id')
        .eq('categoria', 'confirmacao_consulta')
        .eq('tipo', 'whatsapp')
        .eq('ativo', true)
        .or(`clinica_id.eq.${clinicaAlvo},clinica_id.is.null`);
      if (templateConfirmacaoError) throw new Error(`Erro ao carregar o modelo de confirmação: ${templateConfirmacaoError.message}`);
      const modelo = templatesConfirmacao?.find((item) => item.clinica_id === clinicaAlvo) ?? templatesConfirmacao?.find((item) => item.clinica_id === null);
      if (!modelo) throw new Error('Nenhum modelo ativo de confirmação por WhatsApp foi encontrado.');

      const paciente = (agendamento as any).pacientes;
      if (!paciente?.telefone) throw new Error('O paciente não tem telefone cadastrado para receber a confirmação.');
      const medico = (agendamento as any).medicos;
      const { data: clinica, error: clinicaError } = await supabase
        .from('clinicas')
        .select('nome')
        .eq('id', clinicaAlvo)
        .maybeSingle();
      if (clinicaError) throw new Error(`Erro ao carregar a clínica: ${clinicaError.message}`);
      const clinicaNome = clinica?.nome || 'Clínica';
      const conteudo = modelo.conteudo
        .replace(/\{\{paciente_nome\}\}/g, paciente.nome || '')
        .replace(/\{\{data\}\}/g, formatDate(agendamento.data))
        .replace(/\{\{horario\}\}/g, String(agendamento.hora_inicio).slice(0, 5))
        .replace(/\{\{medico_nome\}\}/g, medico?.nome ? `Dr(a). ${medico.nome}` : `CRM ${medico?.crm || ''}`)
        .replace(/\{\{clinica_nome\}\}/g, clinicaNome)
        .replace(/\{\{link_portal\}\}/g, '');

      const { data: existingConfirmation, error: duplicateCheckError } = await supabase
        .from('notification_queue')
        .select('id')
        .eq('clinica_id', clinicaAlvo)
        .contains('dados_extras', { tipo_notificacao: 'confirmacao_agendamento', agendamento_id: agendamentoId })
        .neq('status', 'cancelado')
        .limit(1);
      if (duplicateCheckError) throw new Error(`Não foi possível conferir confirmações anteriores: ${duplicateCheckError.message}`);
      if (existingConfirmation?.length) {
        return new Response(JSON.stringify({ success: true, message: 'A confirmação desta consulta já está na fila.', stats: { processados: 1, sucesso: 1, erros: 0, duplicado: true } }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error: queueError } = await supabase.from('notification_queue').insert({
        tipo: 'whatsapp', destinatario_id: paciente.id, destinatario_telefone: paciente.telefone,
        destinatario_nome: paciente.nome, assunto: 'Confirmação de consulta', conteudo,
        status: 'pendente', clinica_id: clinicaAlvo,
        dados_extras: { tipo_notificacao: 'confirmacao_agendamento', agendamento_id: agendamentoId, template_id: modelo.id },
      });
      if (queueError) throw new Error(`Não foi possível colocar a confirmação na fila: ${queueError.message}`);

      return new Response(JSON.stringify({ success: true, message: 'Confirmação adicionada à fila de WhatsApp.', stats: { processados: 1, sucesso: 1, erros: 0, enfileirados: 1 } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
    const tomorrowDate = new Date(`${todayStr}T00:00:00Z`)
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1)
    const tomorrowStr = tomorrowDate.toISOString().slice(0, 10)
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000)
    const threeHoursFromNow = new Date(Date.now() + 3 * 60 * 60 * 1000)

    let totalProcessed = 0
    let totalSuccess = 0
    let totalErrors = 0
    const errors: string[] = []

    // === LEMBRETE 24H ===
    if ((!automationKey || automationKey === 'lembrete_consulta_24h') && hasGlobalOrClinicSetting(settings, null, 'lembrete_consulta_24h')) {
      const { data: agendamentos24h, error: err24h } = await carregarAgendamentos(
        supabase, tomorrowStr, clinicaAlvo,
      )

      if (err24h) {
        totalErrors++
        errors.push(`Erro 24h: ${err24h.message}`)
      } else if (agendamentos24h && agendamentos24h.length > 0) {
        for (const ag of agendamentos24h as unknown as Agendamento[]) {
          if (!isAutomationActive(settings, ag.clinica_id, 'lembrete_consulta_24h')) continue

          const { data: existing, error: existingError } = await supabase
            .from('notification_queue')
            .select('id')
            .eq('clinica_id', ag.clinica_id)
            .eq('dados_extras->agendamento_id', ag.id)
            .in('dados_extras->tipo_lembrete', ['24h', '24h_whatsapp'])
            .neq('status', 'cancelado')
            .limit(1)
            .maybeSingle()

          if (existingError) {
            totalErrors++
            errors.push(`Não foi possível conferir lembretes anteriores da consulta ${ag.id}: ${existingError.message}`)
            continue
          }

          if (existing) continue
          totalProcessed++
          const successesBeforeAppointment = totalSuccess
          const errorsBeforeAppointment = totalErrors

          const paciente = ag.pacientes
          const medico = ag.medicos
          const medicoNome = medico.nome ? `Dr(a). ${medico.nome}` : `Dr(a). CRM ${medico.crm}`
          const template24h = templateForClinic(templates || [], ag.clinica_id, '24h')

          // Fetch clinic config
          const clinicConfig = await getClinicConfig(supabase, ag.clinica_id, clinicConfigCache)
          const clinicaNome = clinicConfig?.nome_fantasia || 'Clínica Médica'
          const clinicaEndereco = clinicConfig ? `${clinicConfig.endereco || ''} — ${clinicConfig.cidade || ''} / ${clinicConfig.uf || ''}` : 'Endereço da clínica'

          // === SEND VIA EMAIL ===
          if (brevoApiKey && paciente?.email && template24h) {
            const conteudo = template24h.conteudo
              .replace(/\{\{paciente_nome\}\}/g, paciente.nome)
              .replace(/\{\{data\}\}/g, formatDate(ag.data))
              .replace(/\{\{horario\}\}/g, ag.hora_inicio)
              .replace(/\{\{medico_nome\}\}/g, medicoNome)
              .replace(/\{\{clinica_nome\}\}/g, clinicaNome)
              .replace(/\{\{clinica_endereco\}\}/g, clinicaEndereco)

            const assunto = (template24h.assunto || 'Lembrete de Consulta')
              .replace(/\{\{clinica_nome\}\}/g, clinicaNome)

            try {
              const emailRes = await sendSharedBrevoEmail({ to: { email: paciente.email, name: paciente.nome }, subject: assunto, html: conteudo.replace(/\n/g, '<br>'), senderName: clinicaNome })

              if (emailRes.ok) {
                totalSuccess++
                const { error: queueError } = await supabase.from('notification_queue').insert({
                  template_id: template24h.id,
                  tipo: 'email',
                  destinatario_id: ag.paciente_id,
                  destinatario_email: paciente.email,
                  destinatario_nome: paciente.nome,
                  assunto,
                  conteudo,
                  dados_extras: { agendamento_id: ag.id, tipo_lembrete: '24h' },
                  clinica_id: ag.clinica_id,
                  status: 'enviado',
                  enviado_em: new Date().toISOString(),
                })
                if (queueError) {
                  totalErrors++
                  errors.push(`E-mail enviado, mas não foi registrado na fila (${ag.id}): ${queueError.message}`)
                }
              } else {
                totalErrors++
                const result = await emailRes.json()
                errors.push(`Erro email para ${paciente.email}: ${JSON.stringify(result)}`)
              }
            } catch (emailError) {
              totalErrors++
              errors.push(`Exceção email para ${paciente.email}: ${emailError}`)
            }
          }

          const whatsappInstanceName = await getWhatsAppInstance(
            supabase,
            ag.clinica_id,
            whatsappInstanceCache,
            evolutionApiUrl,
            evolutionApiKey,
          )
          if (whatsappInstanceName) whatsappInstancesUsed.add(ag.clinica_id)

          // === SEND VIA WHATSAPP ===
          if (whatsappInstanceName && paciente?.telefone) {
            try {
              const whatsappMsg = `⏰ *Lembrete de Consulta - ${clinicaNome}*\n\nOlá, ${paciente.nome}!\n\nLembramos que você tem uma consulta amanhã:\n📅 Data: ${formatDate(ag.data)}\n🕐 Horário: ${ag.hora_inicio}\n👨‍⚕️ Médico: ${medicoNome}\n📋 Tipo: ${ag.tipo || 'Consulta'}\n\nNão se esqueça de trazer seus documentos e exames anteriores.\n\nResponda *CONFIRMAR* para confirmar sua presença.\n\n_${clinicaNome}_`

              await sendWhatsAppMessage(evolutionApiUrl!, evolutionApiKey!, whatsappInstanceName, paciente.telefone, whatsappMsg)

              const { error: queueError } = await supabase.from('notification_queue').insert({
                tipo: 'whatsapp',
                destinatario_id: ag.paciente_id,
                destinatario_telefone: paciente.telefone,
                destinatario_nome: paciente.nome,
                conteudo: whatsappMsg,
                dados_extras: { agendamento_id: ag.id, tipo_lembrete: '24h_whatsapp' },
                clinica_id: ag.clinica_id,
                status: 'enviado',
                enviado_em: new Date().toISOString(),
              })
              totalSuccess++
              if (queueError) {
                totalErrors++
                errors.push(`WhatsApp enviado, mas não foi registrado na fila (${ag.id}): ${queueError.message}`)
              }
            } catch (whatsappError) {
              totalErrors++
              errors.push(`Erro WhatsApp para ${paciente.nome}: ${whatsappError}`)
            }
          }
          if (totalSuccess === successesBeforeAppointment && totalErrors === errorsBeforeAppointment) {
            totalErrors++
            errors.push(`Nenhum canal de envio está disponível para a consulta ${ag.id}.`)
          }
        }
      }
    }

    // === LEMBRETE 2H ===
    if ((!automationKey || automationKey === 'lembrete_consulta_2h') && hasGlobalOrClinicSetting(settings, null, 'lembrete_consulta_2h')) {
      const { data: agendamentos2h, error: err2h } = await carregarAgendamentos(
        supabase, todayStr, clinicaAlvo,
      )

      if (err2h) {
        totalErrors++
        errors.push(`Erro 2h: ${err2h.message}`)
      } else if (agendamentos2h && agendamentos2h.length > 0) {
        for (const ag of agendamentos2h as unknown as Agendamento[]) {
          if (!isAutomationActive(settings, ag.clinica_id, 'lembrete_consulta_2h')) continue
          const appointmentTime = new Date(`${todayStr}T${ag.hora_inicio.slice(0, 5)}:00-03:00`)

          if (appointmentTime < twoHoursFromNow || appointmentTime > threeHoursFromNow) continue

          const { data: existing, error: existingError } = await supabase
            .from('notification_queue')
            .select('id')
            .eq('clinica_id', ag.clinica_id)
            .eq('dados_extras->agendamento_id', ag.id)
            .in('dados_extras->tipo_lembrete', ['2h', '2h_whatsapp'])
            .neq('status', 'cancelado')
            .limit(1)
            .maybeSingle()

          if (existingError) {
            totalErrors++
            errors.push(`Não foi possível conferir lembretes anteriores da consulta ${ag.id}: ${existingError.message}`)
            continue
          }

          if (existing) continue
          totalProcessed++
          const successesBeforeAppointment = totalSuccess
          const errorsBeforeAppointment = totalErrors

          const paciente = ag.pacientes
          const medico = ag.medicos
          const medicoNome = medico.nome ? `Dr(a). ${medico.nome}` : `Dr(a). CRM ${medico.crm}`
          const template2h = templateForClinic(templates || [], ag.clinica_id, '2h')

          // Fetch clinic config
          const clinicConfig2h = await getClinicConfig(supabase, ag.clinica_id, clinicConfigCache)
          const clinicaNome2h = clinicConfig2h?.nome_fantasia || 'Clínica Médica'

          // === SEND VIA EMAIL ===
          if (brevoApiKey && paciente?.email && template2h) {
            const conteudo = template2h.conteudo
              .replace(/\{\{paciente_nome\}\}/g, paciente.nome)
              .replace(/\{\{horario\}\}/g, ag.hora_inicio)
              .replace(/\{\{medico_nome\}\}/g, medicoNome)
              .replace(/\{\{clinica_nome\}\}/g, clinicaNome2h)

            const assunto = (template2h.assunto || 'Lembrete de Consulta')
              .replace(/\{\{horario\}\}/g, ag.hora_inicio)
              .replace(/\{\{clinica_nome\}\}/g, clinicaNome2h)

            try {
              const emailRes = await sendSharedBrevoEmail({ to: { email: paciente.email, name: paciente.nome }, subject: assunto, html: conteudo.replace(/\n/g, '<br>'), senderName: clinicaNome2h })

              if (emailRes.ok) {
                totalSuccess++
                const { error: queueError } = await supabase.from('notification_queue').insert({
                  template_id: template2h.id,
                  tipo: 'email',
                  destinatario_id: ag.paciente_id,
                  destinatario_email: paciente.email,
                  destinatario_nome: paciente.nome,
                  assunto,
                  conteudo,
                  dados_extras: { agendamento_id: ag.id, tipo_lembrete: '2h' },
                  clinica_id: ag.clinica_id,
                  status: 'enviado',
                  enviado_em: new Date().toISOString(),
                })
                if (queueError) {
                  totalErrors++
                  errors.push(`E-mail enviado, mas não foi registrado na fila (${ag.id}): ${queueError.message}`)
                }
              } else {
                totalErrors++
              }
            } catch (emailError) {
              totalErrors++
              errors.push(`Exceção 2h email: ${emailError}`)
            }
          }

          const whatsappInstanceName = await getWhatsAppInstance(
            supabase,
            ag.clinica_id,
            whatsappInstanceCache,
            evolutionApiUrl,
            evolutionApiKey,
          )
          if (whatsappInstanceName) whatsappInstancesUsed.add(ag.clinica_id)

          // === SEND VIA WHATSAPP ===
          if (whatsappInstanceName && paciente?.telefone) {
            try {
              const whatsappMsg = `⏰ *Lembrete - ${clinicaNome2h}*\n\nOlá, ${paciente.nome}! Sua consulta é daqui a 2 horas:\n🕐 Horário: ${ag.hora_inicio}\n👨‍⚕️ Médico: ${medicoNome}\n\nEstamos esperando por você!\n\n_${clinicaNome2h}_`

              await sendWhatsAppMessage(evolutionApiUrl!, evolutionApiKey!, whatsappInstanceName, paciente.telefone, whatsappMsg)

              const { error: queueError } = await supabase.from('notification_queue').insert({
                tipo: 'whatsapp',
                destinatario_id: ag.paciente_id,
                destinatario_telefone: paciente.telefone,
                destinatario_nome: paciente.nome,
                conteudo: whatsappMsg,
                dados_extras: { agendamento_id: ag.id, tipo_lembrete: '2h_whatsapp' },
                clinica_id: ag.clinica_id,
                status: 'enviado',
                enviado_em: new Date().toISOString(),
              })
              totalSuccess++
              if (queueError) {
                totalErrors++
                errors.push(`WhatsApp enviado, mas não foi registrado na fila (${ag.id}): ${queueError.message}`)
              }
            } catch (whatsappError) {
              totalErrors++
              errors.push(`Erro WhatsApp 2h para ${paciente.nome}: ${whatsappError}`)
            }
          }
          if (totalSuccess === successesBeforeAppointment && totalErrors === errorsBeforeAppointment) {
            totalErrors++
            errors.push(`Nenhum canal de envio está disponível para a consulta ${ag.id}.`)
          }
        }
      }
    }

    const duration = Date.now() - startTime

    // Mesmo motivo do welcome-email: este roda de hora em hora e registrava
    // "sucesso" mesmo sem nenhum lembrete para mandar — 24 linhas vazias por
    // dia. Sem nada processado não há o que registrar.
    if (totalProcessed > 0 || totalErrors > 0) {
      await supabase.from('automation_logs').insert({
        tipo: 'lembrete',
        nome: 'Lembretes de Consulta (Email + WhatsApp)',
        status: totalSuccess === 0 && totalErrors > 0 ? 'erro' : totalErrors > 0 ? 'parcial' : 'sucesso',
        registros_processados: totalProcessed,
        registros_sucesso: totalSuccess,
        registros_erro: totalErrors,
        detalhes: { errors, whatsapp_available: whatsappInstancesUsed.size > 0 },
        duracao_ms: duration,
        executado_por: 'cron',
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: automationKey ? `Lembrete ${automationKey === 'lembrete_consulta_24h' ? '24h' : '2h'} processado.` : 'Lembretes processados (Email + WhatsApp)',
        stats: { processados: totalProcessed, sucesso: totalSuccess, erros: totalErrors, duracao_ms: duration, whatsapp: whatsappInstancesUsed.size > 0 },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Erro na função send-appointment-reminder:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}

async function carregarAgendamentos(
  supabase: any,
  data: string,
  clinicaId: string | null,
): Promise<{ data: Agendamento[] | null; error: Error | null }> {
  const limite = 20_000
  const tamanhoPagina = 1_000
  const rows: Agendamento[] = []

  const consultaBase = (select: string, inicio: number, fim: number) => {
    let query = supabase.from('agendamentos').select(select)
      .eq('data', data)
      .in('status', ['agendado', 'confirmado'])
      .order('clinica_id', { ascending: true })
      .order('id', { ascending: true })
      .range(inicio, fim)
    if (clinicaId) query = query.eq('clinica_id', clinicaId)
    return query
  }

  while (rows.length < limite) {
    const inicio = rows.length
    const fim = Math.min(inicio + tamanhoPagina, limite) - 1
    const { data: pagina, error } = await consultaBase(`
      id, data, hora_inicio, status, tipo, paciente_id, medico_id, clinica_id,
      pacientes!inner(nome, email, telefone),
      medicos!inner(crm, nome, especialidade)
    `, inicio, fim)
    if (error) return { data: null, error: new Error(`Erro ao buscar consultas: ${error.message}`) }

    const recebidos = (pagina || []) as unknown as Agendamento[]
    rows.push(...recebidos)
    if (recebidos.length < fim - inicio + 1) return { data: rows, error: null }
  }

  const { data: extra, error } = await consultaBase('id', limite, limite)
  if (error) return { data: null, error: new Error(`Erro ao verificar o limite de consultas: ${error.message}`) }
  if (extra?.length) {
    return { data: null, error: new Error(`A consulta excedeu o limite de ${limite} agendamentos; a execução foi interrompida para não pular lembretes.`) }
  }
  return { data: rows, error: null }
}

async function getClinicConfig(supabase: any, clinicId: string, cache: Record<string, any>): Promise<any> {
  if (cache[clinicId]) return cache[clinicId]

  const { data } = await supabase
    .from('configuracoes_clinica')
    .select('*')
    .eq('clinica_id', clinicId)
    .single()

  cache[clinicId] = data || {}
  return cache[clinicId]
}

function isAutomationActive(settings: any[] | null, clinicId: string | null, chave: string): boolean {
  const scoped = settings?.find((setting) => setting.clinica_id === clinicId && setting.chave === chave)
  const legacy = settings?.find((setting) => setting.clinica_id == null && setting.chave === chave)
  return (scoped || legacy)?.ativo !== false
}

function hasGlobalOrClinicSetting(settings: any[] | null, _clinicId: string | null, chave: string): boolean {
  return settings?.some((setting) => setting.chave === chave) ?? true
}

function templateForClinic(templates: any[], clinicId: string, suffix: string): any | null {
  return templates.find((template) => template.clinica_id === clinicId && template.nome.includes(suffix))
    || templates.find((template) => template.clinica_id == null && template.nome.includes(suffix))
    || null
}

async function getWhatsAppInstance(
  supabase: any,
  clinicId: string,
  cache: Record<string, string | null>,
  apiUrl: string,
  apiKey: string | undefined,
): Promise<string | null> {
  if (!apiUrl || !apiKey) return null
  if (Object.prototype.hasOwnProperty.call(cache, clinicId)) return cache[clinicId]

  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('instance_name')
    .eq('clinica_id', clinicId)
    .eq('status', 'connected')
    .limit(1)
    .maybeSingle()

  cache[clinicId] = session?.instance_name || null
  return cache[clinicId]
}



async function sendWhatsAppMessage(apiUrl: string, apiKey: string, instanceName: string, phone: string, message: string): Promise<void> {
  const cleanPhone = phone.replace(/\D/g, '')
  const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`

  const response = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': apiKey,
    },
    body: JSON.stringify({
      number: formattedPhone,
      text: message,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Erro WhatsApp: ${errorText}`)
  }
}
