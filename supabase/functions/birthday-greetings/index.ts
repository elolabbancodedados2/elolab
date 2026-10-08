import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cronOrUserOk, cronForbidden, clinicaDoChamador } from '../_shared/cronAuth.ts';
import { corsPadrao } from '../_shared/cors.ts';

// Atribuído em cada request (reflete a origem permitida). Helpers
// top-level (json/reply) capturam esta variável por closure.
let corsHeaders: Record<string, string> = {};

Deno.serve(async (req) => {
  corsHeaders = { ...corsPadrao(req),};
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // O agendador OU um usuário logado. Com `cronSecretOk` o botão "Executar
  // agora" da tela de Automações recebia 403 e a automação parecia quebrada.
  if (!cronOrUserOk(req)) return cronForbidden(corsHeaders);

  const startTime = Date.now()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const brevoApiKey = Deno.env.get('BREVO_API_KEY')

    if (!brevoApiKey) {
      throw new Error('BREVO_API_KEY não configurada')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: settings, error: settingsError } = await supabase
      .from('automation_settings')
      .select('valor, ativo, clinica_id')
      .eq('chave', 'aniversariantes')
    if (settingsError) throw new Error(`Erro ao carregar as configurações da automação: ${settingsError.message}`)

    const { data: templates, error: templatesError } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('categoria', 'aniversario')
      .eq('tipo', 'email')
      .eq('ativo', true)
    if (templatesError) throw new Error(`Erro ao carregar o modelo de aniversário: ${templatesError.message}`)

    if (!templates || templates.length === 0) {
      throw new Error('Template de aniversário não encontrado')
    }

    const hoje = new Date()
    const hojeBrasil = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(hoje)
    const [, mes, dia] = hojeBrasil.split('-')

    // Disparo manual só alcança a clínica de quem clicou; o cron segue global.
    const clinicaAlvo = await clinicaDoChamador(req, supabase)

    const limitePacientes = 20_000
    const tamanhoPagina = 1_000
    const pacientesComNascimento: any[] = []
    while (pacientesComNascimento.length < limitePacientes) {
      const inicio = pacientesComNascimento.length
      const fim = Math.min(inicio + tamanhoPagina, limitePacientes) - 1
      let consulta = supabase
        .from('pacientes')
        .select('id, nome, email, data_nascimento, clinica_id')
        .not('email', 'is', null)
        .not('data_nascimento', 'is', null)
        .order('clinica_id', { ascending: true })
        .order('id', { ascending: true })
        .range(inicio, fim)
      if (clinicaAlvo) consulta = consulta.eq('clinica_id', clinicaAlvo)

      const { data: pagina, error: fetchError } = await consulta
      if (fetchError) throw new Error(`Erro ao buscar pacientes: ${fetchError.message}`)
      pacientesComNascimento.push(...(pagina || []))
      if ((pagina || []).length < fim - inicio + 1) break
    }

    if (pacientesComNascimento.length === limitePacientes) {
      let consultaExtra = supabase.from('pacientes').select('id')
        .not('email', 'is', null).not('data_nascimento', 'is', null)
        .order('clinica_id', { ascending: true }).order('id', { ascending: true })
        .range(limitePacientes, limitePacientes)
      if (clinicaAlvo) consultaExtra = consultaExtra.eq('clinica_id', clinicaAlvo)
      const { data: extra, error: extraError } = await consultaExtra
      if (extraError) throw new Error(`Erro ao verificar o limite de pacientes: ${extraError.message}`)
      if (extra?.length) throw new Error(`A consulta excedeu o limite de ${limitePacientes} pacientes; a execução foi interrompida para não deixar aniversariantes de fora.`)
    }

    const aniversariantesHoje = pacientesComNascimento.filter(p => {
      if (!p.data_nascimento) return false
      const [, m, d] = p.data_nascimento.split('-')
      return d === dia && m === mes && isAutomationActive(settings || [], p.clinica_id)
    }) || []

    if (aniversariantesHoje.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Nenhum aniversariante hoje', aniversariantes: 0, stats: { aniversariantes: 0, enviados: 0, erros: 0 } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let successCount = 0
    let errorCount = 0

    for (const paciente of aniversariantesHoje) {
      if (!paciente.email) {
        errorCount++
        continue
      }

      const template = templateForClinic(templates || [], paciente.clinica_id)
      if (!template) {
        errorCount++
        continue
      }

      const { data: existing, error: existingError } = await supabase
        .from('notification_queue')
        .select('id')
        .eq('clinica_id', paciente.clinica_id)
        .eq('destinatario_id', paciente.id)
        .eq('dados_extras->tipo', 'aniversario')
        .gte('created_at', `${hojeBrasil}T00:00:00-03:00`)
        .neq('status', 'cancelado')
        .limit(1)
        .maybeSingle()

      if (existingError) {
        errorCount++
        console.error(`Não foi possível conferir o envio de aniversário para ${paciente.id}:`, existingError)
        continue
      }
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
          const { error: queueError } = await supabase.from('notification_queue').insert({
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
          if (queueError) {
            errorCount++
            console.error(`E-mail de aniversário enviado, mas não foi registrado na fila (${paciente.id}):`, queueError)
          }
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
      status: successCount === 0 && errorCount > 0 ? 'erro' : errorCount > 0 ? 'parcial' : 'sucesso',
      registros_processados: aniversariantesHoje.length,
      registros_sucesso: successCount,
      registros_erro: errorCount,
      detalhes: {
        data: hojeBrasil,
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
