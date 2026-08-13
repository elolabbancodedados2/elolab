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

    const { resultado_id } = await req.json()

    if (!resultado_id) {
      return new Response(
        JSON.stringify({ error: 'resultado_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch resultado details with exam and patient info
    const { data: resultado, error: resultError } = await supabase
      .from('resultados_laboratorio')
      .select(`
        id, data_resultado, exame_id, coleta_id,
        coletas_laboratorio!inner(
          paciente_id,
          clinica_id,
          pacientes!inner(nome, email, telefone)
        ),
        tipos_exame_custom!inner(nome)
      `)
      .eq('id', resultado_id)
      .single()

    if (resultError || !resultado) {
      return new Response(
        JSON.stringify({ error: 'Resultado não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const coleta = resultado.coletas_laboratorio
    const paciente = coleta.pacientes
    const tipoExame = resultado.tipos_exame_custom.nome
    const clinicaId = coleta.clinica_id

    // Fetch clinic config
    const { data: clinicConfig } = await supabase
      .from('configuracoes_clinica')
      .select('*')
      .eq('clinica_id', clinicaId)
      .single()

    const clinicaNome = clinicConfig?.nome_fantasia || 'Clínica Médica'

    // Fetch email template
    const { data: template } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('categoria', 'resultado_exame')
      .eq('tipo', 'email')
      .eq('ativo', true)
      .single()

    let emailSuccess = false
    let whatsappSuccess = false

    // === SEND EMAIL ===
    if (brevoApiKey && paciente?.email && template) {
      try {
        const portalLink = `${appUrl}/portal-paciente?resultado_id=${resultado_id}`
        const [year, month, day] = resultado.data_resultado.split('-')
        const dataFormatada = `${day}/${month}/${year}`

        const conteudo = template.conteudo
          .replace(/\{\{paciente_nome\}\}/g, paciente.nome)
          .replace(/\{\{tipo_exame\}\}/g, tipoExame)
          .replace(/\{\{data_resultado\}\}/g, dataFormatada)
          .replace(/\{\{link_portal\}\}/g, portalLink)
          .replace(/\{\{clinica_nome\}\}/g, clinicaNome)

        const assunto = (template.assunto || 'Resultado de Exame')
          .replace(/\{\{tipo_exame\}\}/g, tipoExame)
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
            clinica_id: clinicaId,
            destinatario_id: coleta.paciente_id,
            destinatario_email: paciente.email,
            destinatario_nome: paciente.nome,
            assunto,
            conteudo,
            dados_extras: { resultado_id: resultado.id, tipo_exame: tipoExame, tipo_notificacao: 'resultado' },
            status: 'enviado',
            enviado_em: new Date().toISOString(),
          })
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
            const portalLink = `${appUrl}/portal-paciente?resultado_id=${resultado_id}`
            const whatsappMsg = `📋 *Resultado de Exame Disponível!*\n\nOlá, ${paciente.nome}!\n\nSeu resultado do exame *${tipoExame}* está disponível para consulta.\n\n🔗 Visualizar: ${portalLink}\n\n_${clinicaNome}_`

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
                clinica_id: clinicaId,
                destinatario_id: coleta.paciente_id,
                destinatario_telefone: paciente.telefone,
                destinatario_nome: paciente.nome,
                conteudo: whatsappMsg,
                dados_extras: { resultado_id: resultado.id, tipo_exame: tipoExame, tipo_notificacao: 'resultado_whatsapp' },
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

    await supabase.from('automation_logs').insert({
      tipo: 'resultado_exame',
      nome: 'Notificação de Resultado de Exame',
      status: emailSuccess || whatsappSuccess ? 'sucesso' : 'erro',
      registros_processados: 1,
      registros_sucesso: (emailSuccess ? 1 : 0) + (whatsappSuccess ? 1 : 0),
      registros_erro: (emailSuccess || whatsappSuccess ? 0 : 1),
      detalhes: { email: emailSuccess, whatsapp: whatsappSuccess, exame: tipoExame },
      executado_por: 'event',
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Notificação de resultado enviada',
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
