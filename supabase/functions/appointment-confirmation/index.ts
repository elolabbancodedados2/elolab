import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const brevoApiKey = Deno.env.get('BREVO_API_KEY')
    const appUrl = Deno.env.get('APP_URL') || 'https://app.elolab.com.br'
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get request body (agendamento_id)
    const { agendamento_id } = await req.json()

    if (!agendamento_id) {
      return new Response(
        JSON.stringify({ error: 'agendamento_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch appointment details
    const { data: agendamento, error: agenError } = await supabase
      .from('agendamentos')
      .select(`
        id, data, hora_inicio, clinica_id,
        pacientes!inner(nome, email, telefone),
        medicos!inner(nome, crm, especialidade)
      `)
      .eq('id', agendamento_id)
      .single()

    if (agenError || !agendamento) {
      return new Response(
        JSON.stringify({ error: 'Agendamento não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch clinic config
    const { data: clinicConfig } = await supabase
      .from('configuracoes_clinica')
      .select('*')
      .eq('clinica_id', agendamento.clinica_id)
      .single()

    const clinicaNome = clinicConfig?.nome_fantasia || 'Clínica Médica'
    const clinicaEndereco = clinicConfig ? `${clinicConfig.endereco || ''}` : 'Clínica'
    const medicoNome = agendamento.medicos.nome ? `Dr(a). ${agendamento.medicos.nome}` : `Dr(a). CRM ${agendamento.medicos.crm}`
    const paciente = agendamento.pacientes
    const portalLink = `${appUrl}/portal-paciente?agendamento_id=${agendamento_id}`

    // Fetch email template
    const { data: template } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('categoria', 'confirmacao_consulta')
      .eq('tipo', 'email')
      .eq('ativo', true)
      .single()

    let emailSuccess = false
    let whatsappSuccess = false

    // === SEND EMAIL ===
    if (brevoApiKey && paciente?.email && template) {
      try {
        const [day, month, year] = agendamento.data.split('-').reverse()
        const dataFormatada = `${day}/${month}/${year}`

        const conteudo = template.conteudo
          .replace(/\{\{paciente_nome\}\}/g, paciente.nome)
          .replace(/\{\{data\}\}/g, dataFormatada)
          .replace(/\{\{horario\}\}/g, agendamento.hora_inicio)
          .replace(/\{\{medico_nome\}\}/g, medicoNome)
          .replace(/\{\{clinica_nome\}\}/g, clinicaNome)
          .replace(/\{\{clinica_endereco\}\}/g, clinicaEndereco)

        const assunto = (template.assunto || 'Consulta Confirmada')
          .replace(/\{\{clinica_nome\}\}/g, clinicaNome)

        const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': brevoApiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: clinicaNome, email: 'noreply@elolab.com.br' },
            to: [{ email: paciente.email, name: paciente.nome }],
            subject: assunto,
            htmlContent: conteudo.replace(/\n/g, '<br>'),
          }),
        })

        if (emailRes.ok) {
          emailSuccess = true
          await supabase.from('notification_queue').insert({
            tipo: 'email',
            clinica_id: agendamento.clinica_id,
            destinatario_id: agendamento.paciente_id,
            destinatario_email: paciente.email,
            destinatario_nome: paciente.nome,
            assunto,
            conteudo,
            dados_extras: { agendamento_id: agendamento.id, tipo_notificacao: 'confirmacao' },
            status: 'enviado',
            enviado_em: new Date().toISOString(),
          })
        } else {
          console.error('Brevo error:', await emailRes.text())
        }
      } catch (emailError) {
        console.error('Email error:', emailError)
      }
    }

    // === SEND WHATSAPP ===
    if (paciente?.telefone) {
      try {
        const evolutionApiUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/+$/, '')
        const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')

        if (evolutionApiUrl && evolutionApiKey) {
          const { data: session } = await supabase
            .from('whatsapp_sessions')
            .select('instance_name')
            .eq('status', 'connected')
            .limit(1)
            .single()

          if (session?.instance_name) {
            const [day, month, year] = agendamento.data.split('-').reverse()
            const dataFormatada = `${day}/${month}/${year}`

            const whatsappMsg = `✅ *Consulta Confirmada!*\n\nOlá, ${paciente.nome}!\n\nSua consulta foi confirmada:\n\n📅 Data: ${dataFormatada}\n🕐 Horário: ${agendamento.hora_inicio}\n👨‍⚕️ Médico: ${medicoNome}\n📍 Local: ${clinicaNome}\n\nChegue 10 minutos antes. Traga seus documentos.\n\n${portalLink}\n\n_${clinicaNome}_`

            const cleanPhone = paciente.telefone.replace(/\D/g, '')
            const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`

            const response = await fetch(`${evolutionApiUrl}/message/sendText/${session.instance_name}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': evolutionApiKey,
              },
              body: JSON.stringify({
                number: formattedPhone,
                text: whatsappMsg,
              }),
            })

            if (response.ok) {
              whatsappSuccess = true
              await supabase.from('notification_queue').insert({
                tipo: 'whatsapp',
                clinica_id: agendamento.clinica_id,
                destinatario_id: agendamento.paciente_id,
                destinatario_telefone: paciente.telefone,
                destinatario_nome: paciente.nome,
                conteudo: whatsappMsg,
                dados_extras: { agendamento_id: agendamento.id, tipo_notificacao: 'confirmacao_whatsapp' },
                status: 'enviado',
                enviado_em: new Date().toISOString(),
              })
            }
          }
        }
      } catch (whatsappError) {
        console.error('WhatsApp error:', whatsappError)
      }
    }

    // Log automation execution
    await supabase.from('automation_logs').insert({
      tipo: 'confirmacao_consulta',
      nome: 'Notificação de Confirmação de Consulta',
      status: emailSuccess || whatsappSuccess ? 'sucesso' : 'erro',
      registros_processados: 1,
      registros_sucesso: (emailSuccess ? 1 : 0) + (whatsappSuccess ? 1 : 0),
      registros_erro: (emailSuccess || whatsappSuccess ? 0 : 1),
      detalhes: { email: emailSuccess, whatsapp: whatsappSuccess },
      executado_por: 'event',
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Notificação de confirmação enviada',
        stats: { email: emailSuccess, whatsapp: whatsappSuccess },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
