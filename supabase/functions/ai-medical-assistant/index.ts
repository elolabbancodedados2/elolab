import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decidirAcoesFalhaIa, estimarTokensEntradaConservador, liberarReservaTokensIa, liquidarReservaTokensIa, reservarTokensIa } from '../_shared/limitesClinica.ts'
import { corsPadrao } from '../_shared/cors.ts';
import { createNvidiaChatCompletion, DEFAULT_NVIDIA_CHAT_MODEL } from '../_shared/nvidia.ts';

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

function callNvidia(
  apiKey: string,
  model: string,
  instructions: string,
  input: string,
  maxOutputTokens: number,
  temperature: number,
  _safetyIdentifier: string,
) {
  return createNvidiaChatCompletion({
    apiKey,
    model,
    messages: [
      { role: 'system', content: instructions },
      { role: 'user', content: input },
    ],
    maxTokens: maxOutputTokens,
    temperature,
    timeoutMs: 45_000,
  })
}

Deno.serve(async (req) => {
  const corsHeaders = { ...corsPadrao(req) };
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), { status: 405, headers: corsHeaders })
  }

  const startTime = Date.now()
  let usageClient: any = null
  let usageUserId: string | null = null
  let usageClinicId: string | null = null
  let usageOperation: string | null = null
  let tokenReservationId: string | null = null
  let providerResponded = false
  let modelUsed = Deno.env.get('NVIDIA_MEDICAL_MODEL') || Deno.env.get('NVIDIA_CHAT_MODEL') || DEFAULT_NVIDIA_CHAT_MODEL

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
    usageUserId = user.id

    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const nvidiaApiKey = Deno.env.get('NVIDIA_API_KEY')
    const defaultNvidiaModel = Deno.env.get('NVIDIA_MEDICAL_MODEL') || Deno.env.get('NVIDIA_CHAT_MODEL') || DEFAULT_NVIDIA_CHAT_MODEL

    if (!nvidiaApiKey) {
      throw new Error('NVIDIA_API_KEY não configurada')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    usageClient = supabase
    const { data: aiConfig, error: aiConfigError } = await supabase.from('platform_ai_config').select('*').eq('id', true).maybeSingle()
    if (aiConfigError) throw new Error('Não foi possível carregar a configuração da IA.')
    if (aiConfig && !aiConfig.ativo) return new Response(JSON.stringify({ error: 'Assistente de IA temporariamente desativado.' }), { status: 503, headers: corsHeaders })
    const configuredModel = typeof aiConfig?.modelo_principal === 'string' && aiConfig.modelo_principal.startsWith('nvidia/')
      ? aiConfig.modelo_principal
      : defaultNvidiaModel
    modelUsed = configuredModel

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
    usageClinicId = clinicaId

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
    usageOperation = action
    if (!['suggest_diagnosis', 'check_interactions', 'fill_prescription'].includes(action) || !data || typeof data !== 'object') {
      throw new Error('Solicitação inválida para o assistente de IA.')
    }

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

    // Chamar o modelo principal e usar o alternativo apenas em falha de rede,
    // rate limit ou indisponibilidade temporária do provedor.
    const safetyIdentifier = await createSafetyIdentifier(user.id)
    const fallbackModel = typeof aiConfig?.modelo_fallback === 'string' && aiConfig.modelo_fallback.startsWith('nvidia/')
      ? aiConfig.modelo_fallback
      : Deno.env.get('NVIDIA_FALLBACK_MODEL') || null
    const instructions = `${aiConfig?.prompt_base || ''}\n\n${systemPrompt}`
    const maxOutputTokens = aiConfig?.max_tokens || 2000
    const temperature = Number(aiConfig?.temperatura ?? 0.3)

    // Reserva entrada estimada + toda a saída autorizada antes de enviar dados
    // clínicos ao provedor. O RPC serializa reservas concorrentes por clínica.
    const tokensReservados = estimarTokensEntradaConservador(instructions, userPrompt) + maxOutputTokens
    const reserva = await reservarTokensIa(supabase, clinicaId, tokensReservados, aiConfig?.limite_mensal_clinica)
    if (!reserva.aceita) {
      return new Response(
        JSON.stringify({ error: `A clínica atingiu o limite mensal de uso da IA (${reserva.limite.toLocaleString('pt-BR')} tokens). Fale com o suporte para ampliar.` }),
        { status: 429, headers: corsHeaders },
      )
    }
    if (!reserva.reservaId) throw new Error('Não foi possível iniciar a reserva de tokens da IA.')
    tokenReservationId = reserva.reservaId

    // Registro da transferência internacional, exigido para demonstrar base
    // legal e rastrear quem enviou o quê para fora.
    await supabase.from('audit_log').insert({
      action: 'ai_request',
      collection: 'ai_medical_assistant',
      record_id: crypto.randomUUID(),
      record_name: `Envio de dado clínico a provedor externo (${action})`,
      user_id: user.id,
      user_name: (profile as any)?.nome || null,
      clinica_id: clinicaId,
    }).then(({ error }) => {
      if (error) console.error('[ai-medical-assistant] falha ao registrar auditoria:', error)
    })

    let aiResult: any

    try {
      aiResult = await callNvidia(nvidiaApiKey, configuredModel, instructions, userPrompt, maxOutputTokens, temperature, safetyIdentifier)
      providerResponded = true
    } catch (primaryNetworkError) {
      if (!fallbackModel) throw new Error('O provedor de IA não respondeu. Tente novamente em alguns instantes.')
      console.warn('[ai-medical-assistant] modelo principal indisponível; tentando alternativa')
      aiResult = await callNvidia(nvidiaApiKey, fallbackModel, instructions, userPrompt, maxOutputTokens, temperature, safetyIdentifier)
      providerResponded = true
      modelUsed = fallbackModel
    }
    const suggestion = aiResult.choices?.[0]?.message?.content || 'Não foi possível gerar sugestão'

    const duration = Date.now() - startTime
    const inputTokens = Number(aiResult.usage?.prompt_tokens || aiResult.usage?.input_tokens || 0), outputTokens = Number(aiResult.usage?.completion_tokens || aiResult.usage?.output_tokens || 0)
    await liquidarReservaTokensIa(supabase, {
      reservaId: tokenReservationId,
      clinicaId,
      usuarioId: user.id,
      operacao: action,
      modelo: modelUsed,
      inputTokens,
      outputTokens,
      duracaoMs: duration,
    })
    tokenReservationId = null

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
        model: modelUsed,
        fallback_used: modelUsed !== configuredModel,
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
    const failureActions = decidirAcoesFalhaIa(providerResponded, tokenReservationId !== null)
    if (usageClient && tokenReservationId && usageClinicId && failureActions.liberarReserva) {
      try {
        await liberarReservaTokensIa(usageClient, tokenReservationId, usageClinicId)
      } catch (releaseError) {
        console.error('[ai-medical-assistant] falha ao liberar reserva:', releaseError)
      }
      tokenReservationId = null
    }
    // Depois de uma resposta do provedor, a reserva fica pendente se a
    // liquidação falhar. Uma linha de falha com zero tokens apagaria o consumo
    // real; se a liquidação já ocorreu, também criaria uma entrada contraditória.
    if (usageClient && usageUserId && usageClinicId && usageOperation && failureActions.registrarUsoFalho) {
      const { error: usageError } = await (usageClient as any).from('platform_ai_usage').insert({
        clinica_id: usageClinicId,
        user_id: usageUserId,
        operacao: usageOperation,
        modelo: modelUsed,
        input_tokens: 0,
        output_tokens: 0,
        custo_estimado: 0,
        duracao_ms: Date.now() - startTime,
        sucesso: false,
        erro: 'A solicitação não foi concluída.',
      })
      if (usageError) console.error('[ai-medical-assistant] falha ao registrar tentativa sem sucesso:', usageError.message)
    }
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
