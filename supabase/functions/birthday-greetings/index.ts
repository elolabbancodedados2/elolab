import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cronSecretOk, cronForbidden } from '../_shared/cronAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

    if (!brevoApiKey) {
      throw new Error('BREVO_API_KEY não configurada')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: settings } = await supabase
      .from('automation_settings')
      .select('valor, ativo, clinica_id')
      .eq('chave', 'aniversariantes')


    const { data: templates } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('categoria', 'aniversario')
      .eq('tipo', 'email')
      .eq('ativo', true)

    if (!templates || templates.length === 0) {
      throw new Error('Template de aniversário não encontrado')
    }

    const hoje = new Date()
    const dia = String(hoje.getDate()).padStart(2, '0')
    const mes = String(hoje.getMonth() + 1).padStart(2, '0')

    const { data: aniversariantes, error: fetchError } = await supabase
      .from('pacientes')
      .select('id, nome, email, data_nascimento, clinica_id')
      .not('email', 'is', null)
      .not('data_nascimento', 'is', null)

    if (fetchError) {
      throw new Error(`Erro ao buscar pacientes: ${fetchError.message}`)
    }

    const aniversariantesHoje = aniversariantes?.filter(p => {
      if (!p.data_nascimento) return false
      const [ano, m, d] = p.data_nascimento.split('-')
      return d === dia && m === mes && isAutomationActive(settings || [], p.clinica_id)
    }) || []

    if (aniversariantesHoje.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Nenhum aniversariante hoje', aniversariantes: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let successCount = 0
    let errorCount = 0

    for (const paciente of aniversariantesHoje) {
      if (!paciente.email) continue

      const template = templateForClinic(templates || [], paciente.clinica_id)
      if (!template) continue

      const { data: existing } = await supabase
        .from('notification_queue')
        .select('id')
        .eq('destinatario_id', paciente.id)
        .eq('dados_extras->tipo', 'aniversario')
        .gte('created_at', hoje.toISOString().split('T')[0])
        .single()

      if (existing) continue

      const conteudo = template.conteudo
        .replace(/\{\{paciente_nome\}\}/g, paciente.nome)
        .replace(/\{\{clinica_nome\}\}/g, 'EloLab Clínica')

      const assunto = (template.assunto || 'Feliz Aniversário!')
        .replace(/\{\{paciente_nome\}\}/g, paciente.nome)

      try {
        const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': brevoApiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: 'EloLab Clínica', email: 'noreply@elolab.com.br' },
            to: [{ email: paciente.email, name: paciente.nome }],
            subject: assunto,
            htmlContent: conteudo.replace(/\n/g, '<br>'),
          }),
        })

        if (emailRes.ok) {
          successCount++
          await supabase.from('notification_queue').insert({
            template_id: template.id,
            tipo: 'email',
            destinatario_id: paciente.id,
            destinatario_email: paciente.email,
            destinatario_nome: paciente.nome,
            assunto,
            conteudo,
            dados_extras: { tipo: 'aniversario' },
            clinica_id: paciente.clinica_id,
            status: 'enviado',
            enviado_em: new Date().toISOString(),
          })
        } else {
          errorCount++
        }
      } catch (err) {
        errorCount++
      }
    }

    const duration = Date.now() - startTime

    await supabase.from('automation_logs').insert({
      tipo: 'aniversario',
      nome: 'Mensagens de Aniversário',
      status: errorCount === 0 ? 'sucesso' : 'parcial',
      registros_processados: aniversariantesHoje.length,
      registros_sucesso: successCount,
      registros_erro: errorCount,
      detalhes: {
        data: hoje.toISOString().split('T')[0],
        aniversariantes: aniversariantesHoje.map(p => ({ id: p.id, nome: p.nome })),
      },
      duracao_ms: duration,
      executado_por: 'cron',
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Mensagens de aniversário processadas',
        stats: { aniversariantes: aniversariantesHoje.length, enviados: successCount, erros: errorCount, duracao_ms: duration },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Erro na função birthday-greetings:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function isAutomationActive(settings: any[], clinicId: string | null): boolean {
  const scoped = settings.find((setting) => setting.clinica_id === clinicId)
  const legacy = settings.find((setting) => setting.clinica_id == null)
  return (scoped || legacy)?.ativo !== false
}

function templateForClinic(templates: any[], clinicId: string | null): any | null {
  return templates.find((template) => template.clinica_id === clinicId)
    || templates.find((template) => template.clinica_id == null)
    || null
}
