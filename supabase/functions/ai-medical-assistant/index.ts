import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

interface MedicalAssistantRequest {
  action: 'suggest_diagnosis' | 'check_interactions' | 'fill_prescription'
  data: {
    queixa_principal?: string
    historia_doenca_atual?: string
    exames_fisicos?: string
    medicamentos?: string[]
    alergias?: string[]
    diagnostico?: string
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    // Auth validation
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: userError } = await authClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    const defaultOpenaiModel = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini'

    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY não configurada')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: aiConfig } = await supabase.from('platform_ai_config').select('*').eq('id', true).maybeSingle()
    if (aiConfig && !aiConfig.ativo) return new Response(JSON.stringify({ error: 'Assistente de IA temporariamente desativado.' }), { status: 503, headers: corsHeaders })
    const openaiModel = aiConfig?.modelo_principal || defaultOpenaiModel

    // ─── Autorização ──────────────────────────────────────────────────────
    // A checagem anterior parava na validade do JWT. Como o texto enviado aqui
    // é queixa, história, exame físico, alergias e hipótese diagnóstica — dado
    // de saúde, sensível pelo art. 11 da LGPD — e sai do país rumo a um
    // provedor externo (hoje api.openai.com), qualquer usuário autenticado
    // (recepção, estagiário, funcionário de outra clínica) podia disparar uma
    // transferência internacional de dado sensível sem registro nenhum.
    const { data: profile } = await supabase
      .from('profiles').select('clinica_id, nome').eq('id', user.id).maybeSingle()
    const clinicaId = (profile as any)?.clinica_id

    if (!clinicaId) {
      return new Response(
        JSON.stringify({ error: 'Usuário sem clínica associada.' }),
        { status: 403, headers: corsHeaders },
      )
    }

    // Apoio à decisão clínica é ferramenta de quem prescreve.
    const { data: papeis } = await supabase
      .from('user_roles').select('role').eq('user_id', user.id)
    const podeUsar = (papeis || []).some((p: any) => p.role === 'medico' || p.role === 'admin')

    if (!podeUsar) {
      return new Response(
        JSON.stringify({ error: 'Apoio à decisão clínica é restrito a médicos.' }),
        { status: 403, headers: corsHeaders },
      )
    }

    const body: MedicalAssistantRequest = await req.json()
    const { action, data } = body

    // Registro da transferência internacional, exigido para demonstrar base
    // legal e rastrear quem enviou o quê para fora.
    await supabase.from('audit_log').insert({
      action: 'ai_request',
      collection: 'ai_medical_assistant',
      record_id: crypto.randomUUID(), // não há registro próprio; o evento é o registro
      record_name: `Envio de dado clínico a provedor externo (${action})`,
      user_id: user.id,
      user_name: (profile as any)?.nome || null,
      clinica_id: clinicaId,
    }).then(({ error }) => {
      // Não bloqueia o atendimento, mas precisa aparecer no log do servidor.
      if (error) console.error('[ai-medical-assistant] falha ao registrar auditoria:', error)
    })

    let systemPrompt = ''
    let userPrompt = ''

    switch (action) {
      case 'suggest_diagnosis':
        systemPrompt = `Você é um assistente médico de apoio à decisão clínica. Sua função é sugerir hipóteses diagnósticas baseadas nos sintomas e exames fornecidos.

IMPORTANTE: Suas sugestões são apenas para apoio - a decisão final é SEMPRE do médico.

Formato de resposta:
1. Liste as 3-5 hipóteses diagnósticas mais prováveis em ordem de probabilidade
2. Para cada hipótese, explique brevemente os achados que a suportam
3. Sugira exames complementares se necessário
4. Use linguagem técnica apropriada para profissionais de saúde

Responda em português brasileiro.`

        userPrompt = `Paciente apresenta:

**Queixa Principal:** ${data.queixa_principal || 'Não informada'}

**História da Doença Atual:** ${data.historia_doenca_atual || 'Não informada'}

**Exames Físicos:** ${data.exames_fisicos || 'Não realizados'}

Com base nessas informações, quais são as hipóteses diagnósticas mais prováveis?`
        break

      case 'check_interactions':
        systemPrompt = `Você é um farmacêutico clínico especializado em interações medicamentosas e alergias.

Sua função é analisar uma lista de medicamentos e alergias e identificar:
1. Interações medicamentosas (gravidade: leve, moderada, grave)
2. Possíveis reações alérgicas cruzadas
3. Contraindicações importantes
4. Sugestões de ajuste se necessário

Formato:
- Se houver interações GRAVES, destaque com ⚠️ ALERTA
- Liste cada interação com explicação clara
- Sugira alternativas quando apropriado

Responda em português brasileiro de forma concisa.`

        userPrompt = `Analise a seguinte prescrição:

**Medicamentos:**
${(data.medicamentos || []).map((m, i) => `${i + 1}. ${m}`).join('\n')}

**Alergias conhecidas:**
${data.alergias && data.alergias.length > 0 ? data.alergias.join(', ') : 'Nenhuma informada'}

Existem interações medicamentosas ou contraindicações?`
        break

      case 'fill_prescription':
        systemPrompt = `Você é um assistente médico que ajuda a elaborar prescrições.

Com base no diagnóstico fornecido, sugira:
1. Medicamentos apropriados com dosagem e posologia
2. Duração do tratamento
3. Orientações ao paciente
4. Cuidados especiais

Use apenas medicamentos comuns e disponíveis no Brasil.
Formate como uma prescrição médica estruturada.

Responda em português brasileiro.`

        userPrompt = `Elabore uma sugestão de prescrição para:

**Diagnóstico:** ${data.diagnostico || 'Não informado'}

Sugira os medicamentos mais apropriados.`
        break

      default:
        throw new Error(`Ação desconhecida: ${action}`)
    }

    // Chamar OpenAI Responses API
    const safetyIdentifier = await createSafetyIdentifier(user.id)
    const aiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: openaiModel,
        instructions: `${aiConfig?.prompt_base || ''}\n\n${systemPrompt}`,
        input: [{ role: 'user', content: userPrompt }],
        max_output_tokens: aiConfig?.max_tokens || 2000,
        temperature: Number(aiConfig?.temperatura ?? 0.3),
        store: false,
        safety_identifier: safetyIdentifier,
      }),
    })

    if (!aiResponse.ok) {
      const error = await aiResponse.text()
      throw new Error(`Erro na API OpenAI: ${error}`)
    }

    const aiResult = await aiResponse.json()
    if (!aiResult.choices) {
      aiResult.choices = [{ message: { content: aiResult.output_text || extractResponseText(aiResult) } }]
    }
    const suggestion = aiResult.choices?.[0]?.message?.content || 'Não foi possível gerar sugestão'

    const duration = Date.now() - startTime
    const inputTokens = Number(aiResult.usage?.input_tokens || 0), outputTokens = Number(aiResult.usage?.output_tokens || 0)
    await supabase.from('platform_ai_usage').insert({ clinica_id: clinicaId, user_id: user.id, operacao: action, modelo: openaiModel, input_tokens: inputTokens, output_tokens: outputTokens, custo_estimado: inputTokens * 0.00000015 + outputTokens * 0.0000006, duracao_ms: duration, sucesso: true })

    // Log da automação
    await supabase.from('automation_logs').insert({
      tipo: 'ia_medica',
      nome: `Assistente IA - ${action}`,
      status: 'sucesso',
      registros_processados: 1,
      registros_sucesso: 1,
      detalhes: {
        action,
        input_length: userPrompt.length,
        output_length: suggestion.length,
      },
      duracao_ms: duration,
      executado_por: 'usuario',
    })

    return new Response(
      JSON.stringify({
        success: true,
        action,
        suggestion,
        disclaimer: '⚠️ Esta é uma sugestão gerada por IA para apoio à decisão clínica. A responsabilidade pela conduta médica é exclusiva do profissional de saúde.',
        stats: {
          duracao_ms: duration,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Erro na função ai-medical-assistant:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function extractResponseText(result: any): string {
  return (result?.output || [])
    .flatMap((item: any) => item.content || [])
    .filter((item: any) => item?.type === 'output_text' && typeof item.text === 'string')
    .map((item: any) => item.text)
    .join('\n')
}

async function createSafetyIdentifier(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
