import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cronSecretOk, cronForbidden } from '../_shared/cronAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Só o agendador (pg_cron) pode disparar esta rotina.
  if (!cronSecretOk(req)) return cronForbidden(corsHeaders);

  const startTime = Date.now()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const brevoApiKey = Deno.env.get('BREVO_API_KEY')
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Cache clinic configs
    const clinicConfigCache: Record<string, any> = {}

    const { data: settings } = await supabase
      .from('automation_settings')
      .select('chave, valor, ativo')
      .in('chave', ['lembrete_consulta_24h', 'lembrete_consulta_2h'])

    const config24h = settings?.find(s => s.chave === 'lembrete_consulta_24h')
    const config2h = settings?.find(s => s.chave === 'lembrete_consulta_2h')

    const { data: templates } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('categoria', 'lembrete_consulta')
      .eq('tipo', 'email')
      .eq('ativo', true)

    const template24h = templates?.find(t => t.nome.includes('24h'))
    const template2h = templates?.find(t => t.nome.includes('2h'))

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const twoHoursFromNow = new Date(today.getTime() + 2 * 60 * 60 * 1000)
    const threeHoursFromNow = new Date(today.getTime() + 3 * 60 * 60 * 1000)

    let totalProcessed = 0
    let totalSuccess = 0
    let totalErrors = 0
    const errors: string[] = []

    // Check if WhatsApp is available
    let whatsappInstanceName: string | null = null
    if (evolutionApiUrl && evolutionApiKey) {
      const { data: session } = await supabase
        .from('whatsapp_sessions')
        .select('instance_name')
        .eq('status', 'connected')
        .limit(1)
        .single()
      whatsappInstanceName = session?.instance_name || null
    }

    // === LEMBRETE 24H ===
    if (config24h?.ativo !== false) {
      const { data: agendamentos24h, error: err24h } = await supabase
        .from('agendamentos')
        .select(`
          id, data, hora_inicio, status, tipo, paciente_id, medico_id, clinica_id,
          pacientes!inner(nome, email, telefone),
          medicos!inner(crm, nome, especialidade)
        `)
        .eq('data', tomorrowStr)
        .in('status', ['agendado', 'confirmado'])

      if (err24h) {
        errors.push(`Erro 24h: ${err24h.message}`)
      } else if (agendamentos24h && agendamentos24h.length > 0) {
        for (const ag of agendamentos24h as unknown as Agendamento[]) {
          totalProcessed++

          const { data: existing } = await supabase
            .from('notification_queue')
            .select('id')
            .eq('dados_extras->agendamento_id', ag.id)
            .eq('dados_extras->tipo_lembrete', '24h')
            .single()

          if (existing) continue

          const paciente = ag.pacientes
          const medico = ag.medicos
          const medicoNome = medico.nome ? `Dr(a). ${medico.nome}` : `Dr(a). CRM ${medico.crm}`

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
              const emailRes = await sendBrevoEmail(brevoApiKey, paciente.email, paciente.nome, assunto, conteudo, clinicaNome)

              if (emailRes.ok) {
                totalSuccess++
                await supabase.from('notification_queue').insert({
                  template_id: template24h.id,
                  tipo: 'email',
                  destinatario_id: ag.paciente_id,
                  destinatario_email: paciente.email,
                  destinatario_nome: paciente.nome,
                  assunto,
                  conteudo,
                  dados_extras: { agendamento_id: ag.id, tipo_lembrete: '24h' },
                  status: 'enviado',
                  enviado_em: new Date().toISOString(),
                })
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

          // === SEND VIA WHATSAPP ===
          if (whatsappInstanceName && paciente?.telefone) {
            try {
              const whatsappMsg = `⏰ *Lembrete de Consulta - ${clinicaNome}*\n\nOlá, ${paciente.nome}!\n\nLembramos que você tem uma consulta amanhã:\n📅 Data: ${formatDate(ag.data)}\n🕐 Horário: ${ag.hora_inicio}\n👨‍⚕️ Médico: ${medicoNome}\n📋 Tipo: ${ag.tipo || 'Consulta'}\n\nNão se esqueça de trazer seus documentos e exames anteriores.\n\nResponda *CONFIRMAR* para confirmar sua presença.\n\n_${clinicaNome}_`

              await sendWhatsAppMessage(evolutionApiUrl!, evolutionApiKey!, whatsappInstanceName, paciente.telefone, whatsappMsg)

              await supabase.from('notification_queue').insert({
                tipo: 'whatsapp',
                destinatario_id: ag.paciente_id,
                destinatario_telefone: paciente.telefone,
                destinatario_nome: paciente.nome,
                conteudo: whatsappMsg,
                dados_extras: { agendamento_id: ag.id, tipo_lembrete: '24h_whatsapp' },
                status: 'enviado',
                enviado_em: new Date().toISOString(),
              })
              totalSuccess++
            } catch (whatsappError) {
              errors.push(`Erro WhatsApp para ${paciente.nome}: ${whatsappError}`)
            }
          }
        }
      }
    }

    // === LEMBRETE 2H ===
    if (config2h?.ativo !== false) {
      const { data: agendamentos2h, error: err2h } = await supabase
        .from('agendamentos')
        .select(`
          id, data, hora_inicio, status, tipo, paciente_id, medico_id, clinica_id,
          pacientes!inner(nome, email, telefone),
          medicos!inner(crm, nome, especialidade)
        `)
        .eq('data', todayStr)
        .in('status', ['agendado', 'confirmado'])

      if (err2h) {
        errors.push(`Erro 2h: ${err2h.message}`)
      } else if (agendamentos2h && agendamentos2h.length > 0) {
        for (const ag of agendamentos2h as unknown as Agendamento[]) {
          const [hours, minutes] = ag.hora_inicio.split(':').map(Number)
          const appointmentTime = new Date(today)
          appointmentTime.setHours(hours, minutes, 0, 0)

          if (appointmentTime < twoHoursFromNow || appointmentTime > threeHoursFromNow) continue

          totalProcessed++

          const { data: existing } = await supabase
            .from('notification_queue')
            .select('id')
            .eq('dados_extras->agendamento_id', ag.id)
            .eq('dados_extras->tipo_lembrete', '2h')
            .single()

          if (existing) continue

          const paciente = ag.pacientes
          const medico = ag.medicos
          const medicoNome = medico.nome ? `Dr(a). ${medico.nome}` : `Dr(a). CRM ${medico.crm}`

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
              const emailRes = await sendBrevoEmail(brevoApiKey, paciente.email, paciente.nome, assunto, conteudo, clinicaNome2h)

              if (emailRes.ok) {
                totalSuccess++
                await supabase.from('notification_queue').insert({
                  template_id: template2h.id,
                  tipo: 'email',
                  destinatario_id: ag.paciente_id,
                  destinatario_email: paciente.email,
                  destinatario_nome: paciente.nome,
                  assunto,
                  conteudo,
                  dados_extras: { agendamento_id: ag.id, tipo_lembrete: '2h' },
                  status: 'enviado',
                  enviado_em: new Date().toISOString(),
                })
              } else {
                totalErrors++
              }
            } catch (emailError) {
              totalErrors++
              errors.push(`Exceção 2h email: ${emailError}`)
            }
          }

          // === SEND VIA WHATSAPP ===
          if (whatsappInstanceName && paciente?.telefone) {
            try {
              const whatsappMsg = `⏰ *Lembrete - ${clinicaNome2h}*\n\nOlá, ${paciente.nome}! Sua consulta é daqui a 2 horas:\n🕐 Horário: ${ag.hora_inicio}\n👨‍⚕️ Médico: ${medicoNome}\n\nEstamos esperando por você!\n\n_${clinicaNome2h}_`

              await sendWhatsAppMessage(evolutionApiUrl!, evolutionApiKey!, whatsappInstanceName, paciente.telefone, whatsappMsg)

              await supabase.from('notification_queue').insert({
                tipo: 'whatsapp',
                destinatario_id: ag.paciente_id,
                destinatario_telefone: paciente.telefone,
                destinatario_nome: paciente.nome,
                conteudo: whatsappMsg,
                dados_extras: { agendamento_id: ag.id, tipo_lembrete: '2h_whatsapp' },
                status: 'enviado',
                enviado_em: new Date().toISOString(),
              })
              totalSuccess++
            } catch (whatsappError) {
              errors.push(`Erro WhatsApp 2h para ${paciente.nome}: ${whatsappError}`)
            }
          }
        }
      }
    }

    const duration = Date.now() - startTime

    await supabase.from('automation_logs').insert({
      tipo: 'lembrete',
      nome: 'Lembretes de Consulta (Email + WhatsApp)',
      status: totalErrors === 0 ? 'sucesso' : totalErrors === totalProcessed ? 'erro' : 'parcial',
      registros_processados: totalProcessed,
      registros_sucesso: totalSuccess,
      registros_erro: totalErrors,
      detalhes: { errors, whatsapp_available: !!whatsappInstanceName },
      duracao_ms: duration,
      executado_por: 'cron',
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Lembretes processados (Email + WhatsApp)',
        stats: { processados: totalProcessed, sucesso: totalSuccess, erros: totalErrors, duracao_ms: duration, whatsapp: !!whatsappInstanceName },
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

async function sendBrevoEmail(apiKey: string, to: string, toName: string, subject: string, htmlContent: string, clinicName?: string): Promise<Response> {
  return fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: clinicName || 'EloLab Clínica', email: 'noreply@elolab.com.br' },
      to: [{ email: to, name: toName }],
      subject,
      htmlContent: htmlContent.replace(/\n/g, '<br>'),
    }),
  })
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
