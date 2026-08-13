import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const evolutionApiUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/+$/, '')
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || ''
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    const openaiModel = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini'

    if (!evolutionApiUrl || !evolutionApiKey) {
      console.error('[Webhook] Evolution API não configurada')
      return new Response(
        JSON.stringify({ error: 'Evolution API não configurada' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Verifica assinatura do webhook. Evolution API pode ser configurada para
    // enviar o header `apikey` (ou `x-webhook-token`). Sem essa checagem,
    // qualquer requisição pública podia forjar mensagens/status.
    const providedToken =
      req.headers.get('apikey') ||
      req.headers.get('x-webhook-token') ||
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
      ''
    if (!providedToken || providedToken !== evolutionApiKey) {
      console.warn('[Webhook] Unauthorized: token ausente ou inválido')
      return new Response(
        JSON.stringify({ error: 'unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const body = await req.json()

    console.log('[Webhook] Received:', JSON.stringify(body, null, 2))

    const event = body.event
    const instanceName = body.instance
    const data = body.data

    // Buscar sessão
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('*, whatsapp_agents(*)')
      .eq('instance_name', instanceName)
      .maybeSingle()

    if (!session) {
      console.log('[Webhook] Session not found for instance:', instanceName)
      return new Response(JSON.stringify({ received: true }), { headers: corsHeaders })
    }

    if (
      session.clinica_id &&
      session.whatsapp_agents?.clinica_id &&
      session.whatsapp_agents.clinica_id !== session.clinica_id
    ) {
      console.error('[Webhook] Agente não pertence à clínica da sessão:', session.id)
      return new Response(JSON.stringify({ error: 'Configuração de agente inválida' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    switch (event) {
      case 'connection.update':
      case 'CONNECTION_UPDATE': {
        const state = data?.state || data?.connection
        let status = 'disconnected'
        
        if (state === 'open' || state === 'connected') {
          status = 'connected'
        } else if (state === 'connecting') {
          status = 'connecting'
        } else if (state === 'close' || state === 'disconnected') {
          status = 'disconnected'
        }

        await supabase
          .from('whatsapp_sessions')
          .update({ status })
          .eq('id', session.id)

        console.log(`[Webhook] Connection updated: ${status}`)
        break
      }

      case 'qrcode.updated':
      case 'QRCODE_UPDATED': {
      const qrCode = data?.qrcode?.base64 || data?.base64 || data?.qrcode?.code || data?.code
        
        await supabase
          .from('whatsapp_sessions')
          .update({
            qr_code: qrCode,
            qr_code_expires_at: new Date(Date.now() + 60000).toISOString(),
            status: 'qr_code',
          })
          .eq('id', session.id)

        console.log('[Webhook] QR Code updated')
        break
      }

      case 'messages.upsert':
      case 'MESSAGES_UPSERT': {
        const messages = Array.isArray(data) ? data : [data]

        for (const msg of messages) {
          // Ignorar mensagens enviadas pelo próprio bot
          if (msg.key?.fromMe) continue

          const remoteJid = msg.key?.remoteJid || msg.from
          if (!remoteJid) continue

          // Ignorar mensagens de grupos e status
          if (remoteJid.includes('@g.us') || remoteJid.includes('@broadcast') || remoteJid === 'status@broadcast') {
            continue
          }

          const messageContent = msg.message?.conversation || 
                                  msg.message?.extendedTextMessage?.text ||
                                  msg.message?.imageMessage?.caption ||
                                  msg.message?.videoMessage?.caption ||
                                  ''

          if (!messageContent) continue

          console.log(`[Webhook] Message from ${remoteJid}: ${messageContent}`)

          // Buscar ou criar conversa
          let { data: conversation } = await supabase
            .from('whatsapp_conversations')
            .select('*')
            .eq('session_id', session.id)
            .eq('remote_jid', remoteJid)
            .eq('status', 'ativo')
            .maybeSingle()

          if (!conversation) {
            // Tentar vincular a um paciente pelo telefone
            const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
            const { data: paciente } = await supabase
              .from('pacientes')
              .select('id')
              .or(`telefone.ilike.%${phoneNumber.slice(-8)}%,telefone.ilike.%${phoneNumber.slice(-9)}%`)
              .eq('clinica_id', session.clinica_id)
              .limit(1)
              .maybeSingle()

          const { data: newConversation } = await supabase
            .from('whatsapp_conversations')
            .insert({
                session_id: session.id,
                clinica_id: session.clinica_id || null,
                remote_jid: remoteJid,
                paciente_id: paciente?.id || null,
                contexto: [],
              })
              .select()
              .maybeSingle()

            conversation = newConversation
          }

          if (!conversation) continue

          // Salvar mensagem recebida
          await supabase
            .from('whatsapp_messages')
            .insert({
              conversation_id: conversation.id,
              clinica_id: session.clinica_id || null,
              message_id: msg.key?.id,
              direcao: 'entrada',
              tipo: 'texto',
              conteudo: messageContent,
              metadata: msg,
            })

          // Atualizar última mensagem
          await supabase
            .from('whatsapp_conversations')
            .update({ ultima_mensagem_at: new Date().toISOString() })
            .eq('id', conversation.id)

          // Processar com IA se tiver agente configurado
          if (session.agent_id && session.whatsapp_agents?.ativo) {
            const agent = session.whatsapp_agents

            if (!openaiApiKey) {
              console.error('[AI] OPENAI_API_KEY não configurada para sessão:', session.id)
              continue
            }

            // Verificar horário de atendimento
            const now = new Date()
            const currentTime = now.toTimeString().slice(0, 5)
            const isWithinHours = currentTime >= agent.horario_atendimento_inicio && 
                                   currentTime <= agent.horario_atendimento_fim

            if (!isWithinHours && !agent.atende_fora_horario) {
              // Enviar mensagem de fora do horário
              await sendWhatsAppMessage(
                evolutionApiUrl,
                evolutionApiKey,
                instanceName,
                remoteJid,
                agent.mensagem_fora_horario
              )
              continue
            }

            // Buscar contexto da conversa
            const { data: recentMessages } = await supabase
              .from('whatsapp_messages')
              .select('direcao, conteudo, created_at')
              .eq('conversation_id', conversation.id)
              .order('created_at', { ascending: false })
              .limit(10)

            const conversationHistory = (recentMessages || []).reverse().map(m => ({
              role: m.direcao === 'entrada' ? 'user' : 'assistant',
              content: m.conteudo,
            }))

            // Buscar dados do paciente se vinculado
            //
            // ⚠️ MINIMIZAÇÃO DE DADOS (LGPD art. 6º, III e art. 33)
            // Este contexto é enviado para api.deepseek.com, provedor sediado
            // fora do Brasil. Transferência internacional de dado pessoal
            // sensível de saúde exige base legal e cláusulas contratuais
            // específicas. Enquanto isso não estiver formalizado, mandamos o
            // MÍNIMO necessário para o agente funcionar.
            //
            // Antes iam nome completo, data de nascimento, telefone e ALERGIAS.
            // Nada disso é necessário para agendar: alergia é dado de saúde
            // (art. 11), o telefone o WhatsApp já conhece, e o primeiro nome
            // basta para tratar bem a pessoa.
            //
            // Se algum dia o agente precisar de dado clínico, exponha isso como
            // opção por agente e registre o consentimento do paciente.
            let patientContext = ''
            if (conversation.paciente_id) {
              const { data: paciente } = await supabase
                .from('pacientes')
                .select('nome')
                .eq('id', conversation.paciente_id)
                .maybeSingle()

              if (paciente) {
                const primeiroNome = (paciente.nome || '').trim().split(/\s+/)[0] || 'Paciente'
                patientContext = `
DADOS DO PACIENTE:
- Primeiro nome: ${primeiroNome}
`

                // Só data, hora e status — sem médico, especialidade ou tipo de
                // procedimento, que revelariam informação clínica.
            const { data: agendamentos } = await supabase
              .from('agendamentos')
              .select('data, hora_inicio, status')
              .eq('paciente_id', conversation.paciente_id)
              .eq('clinica_id', session.clinica_id)
              .gte('data', new Date().toISOString().split('T')[0])
                  .order('data', { ascending: true })
                  .limit(3)

                if (agendamentos && agendamentos.length > 0) {
                  patientContext += '\nPRÓXIMOS AGENDAMENTOS:\n'
                  agendamentos.forEach(a => {
                    patientContext += `- ${a.data} às ${a.hora_inicio} - Status: ${a.status}\n`
                  })
                }
              }
            }

            // Construir system prompt baseado no tipo e humor do agente
            const systemPrompt = buildSystemPrompt(agent, patientContext)

            // Atendimento IA via OpenAI Responses API. A chave permanece no
            // backend e nunca é enviada ao navegador ou ao WhatsApp.
            let responseText = ''
            try {
              responseText = await runOpenAIAgent({
                apiKey: openaiApiKey,
                model: openaiModel,
                agent,
                systemPrompt,
                conversationHistory,
                messageContent,
                supabase,
                conversation,
                clinicaId: session.clinica_id,
              })
            } catch (error) {
              console.error('[AI] OpenAI error:', error)
              responseText = 'No momento estou com dificuldade para responder. Vou encaminhar seu atendimento para nossa equipe humana.'
              await supabase
                .from('whatsapp_conversations')
                .update({ status: 'aguardando_humano' })
                .eq('id', conversation.id)
            }

            if (responseText) {
              await sendWhatsAppMessage(
                evolutionApiUrl,
                evolutionApiKey,
                instanceName,
                remoteJid,
                responseText,
              )

              await supabase
                .from('whatsapp_messages')
                .insert({
                  conversation_id: conversation.id,
                  clinica_id: session.clinica_id || null,
                  direcao: 'saida',
                  tipo: 'texto',
                  conteudo: responseText,
                })
            }

            if (legacyDeepSeekDisabled()) {
            // Legado DeepSeek mantido apenas durante a migração; não é executado.
            const startTime = Date.now()
            const aiResponse = await fetch('https://api.openai.com/v1/responses', {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer disabled',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: openaiModel,
                messages: [
                  { role: 'system', content: systemPrompt },
                  ...conversationHistory,
                  { role: 'user', content: messageContent },
                ],
                max_tokens: agent.max_tokens || 2000,
                temperature: parseFloat(agent.temperatura) || 0.7,
              }),
            })

            if (!aiResponse.ok) {
              console.error('[AI] Error:', await aiResponse.text())
              continue
            }

            const aiResult = await aiResponse.json()
            const duration = Date.now() - startTime

            // Processar resposta
            let responseText = ''
            const choice = aiResult.choices?.[0]

            if (choice?.message?.tool_calls) {
              // Processar chamadas de ferramentas
              for (const toolCall of choice.message.tool_calls) {
                const toolResult = await executeAgentTool(
                  supabase,
                  toolCall.function.name,
                  JSON.parse(toolCall.function.arguments),
                  conversation
                )

                // Logar ação
                await supabase.from('whatsapp_agent_actions').insert({
                  conversation_id: conversation.id,
                  tipo_acao: toolCall.function.name,
                  dados_entrada: JSON.parse(toolCall.function.arguments),
                  dados_saida: toolResult,
                  sucesso: toolResult.success,
                  erro_mensagem: toolResult.error,
                  duracao_ms: duration,
                })

                // Se a ferramenta retornou uma mensagem, usar ela
                if (toolResult.message) {
                  responseText = toolResult.message
                }
              }
            }
            if (!responseText && choice?.message?.content) {
              responseText = choice.message.content
            }

            if (responseText) {
              // Enviar resposta via WhatsApp
              await sendWhatsAppMessage(
                evolutionApiUrl,
                evolutionApiKey,
                instanceName,
                remoteJid,
                responseText
              )

              // Salvar mensagem enviada
              await supabase
                .from('whatsapp_messages')
                .insert({
                  conversation_id: conversation.id,
                  direcao: 'saida',
                  tipo: 'texto',
                  conteudo: responseText,
                })
            }
            }
          }
        }
        break
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Webhook] Error:', error)
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function runOpenAIAgent({
  apiKey,
  model,
  agent,
  systemPrompt,
  conversationHistory,
  messageContent,
  supabase,
  conversation,
  clinicaId,
}: {
  apiKey: string
  model: string
  agent: any
  systemPrompt: string
  conversationHistory: any[]
  messageContent: string
  supabase: any
  conversation: any
  clinicaId?: string | null
}): Promise<string> {
  const tools = getAgentTools(agent.tipo)
  const input = [
    ...conversationHistory,
    { role: 'user', content: messageContent },
  ]
  const safetyIdentifier = await createSafetyIdentifier(conversation.remote_jid || conversation.id)
  const request = async (requestInput: any[]) => {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        instructions: systemPrompt,
        input: requestInput,
        tools,
        max_output_tokens: Math.min(Math.max(Number(agent.max_tokens) || 600, 100), 2000),
        temperature: Math.min(Math.max(Number(agent.temperatura) || 0.7, 0), 1),
        store: false,
        safety_identifier: safetyIdentifier,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenAI ${response.status}: ${errorText.slice(0, 500)}`)
    }

    return await response.json()
  }

  const firstResult = await request(input)
  const functionCalls = (firstResult.output || []).filter(
    (item: any) => item?.type === 'function_call',
  )

  if (functionCalls.length === 0) {
    return extractResponsesText(firstResult) || 'Não consegui formular uma resposta agora. Vou encaminhar para nossa equipe.'
  }

  const toolOutputs: any[] = []
  for (const call of functionCalls) {
    let args: any = {}
    try {
      args = JSON.parse(call.arguments || '{}')
    } catch {
      args = {}
    }

    const toolStartedAt = Date.now()
    const toolResult = await executeAgentTool(
      supabase,
      call.name,
      args,
      conversation,
      clinicaId,
    )

    await supabase.from('whatsapp_agent_actions').insert({
      conversation_id: conversation.id,
      clinica_id: clinicaId || null,
      tipo_acao: call.name,
      dados_entrada: { campos: Object.keys(args) },
      dados_saida: { success: Boolean(toolResult.success), has_message: Boolean(toolResult.message) },
      sucesso: Boolean(toolResult.success),
      erro_mensagem: toolResult.error || null,
      duracao_ms: Date.now() - toolStartedAt,
    })

    toolOutputs.push({
      type: 'function_call_output',
      call_id: call.call_id,
      output: JSON.stringify(toolResult),
    })
  }

  // Keep the request stateless: replay the model output and tool results instead
  // of storing a response that may contain patient context.
  const finalResult = await request([
    ...input,
    ...(firstResult.output || []),
    ...toolOutputs,
  ])

  return extractResponsesText(finalResult) ||
    toolOutputs.map((item) => item.output).join('\n') ||
    'Não consegui concluir o atendimento. Vou encaminhar para nossa equipe.'
}

function extractResponsesText(result: any): string {
  if (typeof result?.output_text === 'string' && result.output_text.trim()) {
    return result.output_text.trim()
  }

  return (result?.output || [])
    .filter((item: any) => item?.type === 'message')
    .flatMap((item: any) => item.content || [])
    .filter((item: any) => item?.type === 'output_text' && typeof item.text === 'string')
    .map((item: any) => item.text.trim())
    .filter(Boolean)
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

function buildSystemPrompt(agent: any, patientContext: string): string {
  let humorInstructions = ''
  switch (agent.humor) {
    case 'profissional':
      humorInstructions = 'Use linguagem formal e técnica. Seja preciso e objetivo. Mantenha postura profissional.'
      break
    case 'amigavel':
      humorInstructions = 'Seja caloroso e acolhedor. Use linguagem empática. Demonstre preocupação genuína com o bem-estar do paciente.'
      break
    case 'objetivo':
      humorInstructions = 'Seja direto e prático. Respostas curtas e sem rodeios. Foque na resolução do problema.'
      break
  }

  let tipoInstructions = ''
  switch (agent.tipo) {
    case 'geral':
      tipoInstructions = 'Você responde dúvidas gerais sobre a clínica, horários de funcionamento, endereço, especialidades disponíveis e procedimentos.'
      break
    case 'agendamento':
      tipoInstructions = 'Você ajuda pacientes a agendar, remarcar e cancelar consultas. Pode verificar disponibilidade de horários e confirmar agendamentos.'
      break
    case 'triagem':
      tipoInstructions = 'Você realiza uma pré-triagem perguntando sobre sintomas, histórico e urgência antes da consulta. Colete informações relevantes para o médico.'
      break
  }

  return `Você é ${agent.nome}, assistente virtual de uma clínica médica.

${humorInstructions}

${tipoInstructions}

${agent.instrucoes_personalizadas || ''}

${patientContext}

REGRAS IMPORTANTES:
1. NUNCA forneça diagnósticos médicos
2. Em casos de emergência, oriente a ligar para 192 (SAMU) ou ir ao pronto-socorro
3. Seja respeitoso com os dados do paciente (LGPD)
4. Se não souber responder, encaminhe para atendimento humano
5. Responda sempre em português brasileiro
6. Mantenha respostas concisas (máximo 3 parágrafos)`
}

function getAgentTools(tipo: string): any[] {
  const tools: any[] = []

  if (tipo === 'agendamento' || tipo === 'geral') {
    tools.push({
      type: 'function',
      function: {
        name: 'consultar_disponibilidade',
        description: 'Consulta horários disponíveis para agendamento',
        parameters: {
          type: 'object',
          properties: {
            especialidade: { type: 'string', description: 'Especialidade médica desejada' },
            data_preferencia: { type: 'string', description: 'Data de preferência (YYYY-MM-DD)' },
          },
        },
      },
    })

    tools.push({
      type: 'function',
      function: {
        name: 'criar_agendamento',
        description: 'Cria um novo agendamento de consulta',
        parameters: {
          type: 'object',
          properties: {
            medico_id: { type: 'string', description: 'ID do médico' },
            data: { type: 'string', description: 'Data do agendamento (YYYY-MM-DD)' },
            hora_inicio: { type: 'string', description: 'Horário de início (HH:MM)' },
          },
          required: ['medico_id', 'data', 'hora_inicio'],
        },
      },
    })

    tools.push({
      type: 'function',
      function: {
        name: 'consultar_agendamentos_paciente',
        description: 'Lista os agendamentos do paciente',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    })
  }

  if (tipo === 'triagem') {
    tools.push({
      type: 'function',
      function: {
        name: 'registrar_triagem',
        description: 'Registra informações de pré-triagem do paciente',
        parameters: {
          type: 'object',
          properties: {
            queixa_principal: { type: 'string', description: 'Queixa principal do paciente' },
            sintomas: { type: 'array', items: { type: 'string' }, description: 'Lista de sintomas' },
            duracao_sintomas: { type: 'string', description: 'Há quanto tempo os sintomas estão presentes' },
            medicamentos_em_uso: { type: 'array', items: { type: 'string' }, description: 'Medicamentos que o paciente está usando' },
          },
        },
      },
    })
  }

  tools.push({
    type: 'function',
    function: {
      name: 'transferir_humano',
      description: 'Transfere o atendimento para um atendente humano',
      parameters: {
        type: 'object',
        properties: {
          motivo: { type: 'string', description: 'Motivo da transferência' },
        },
      },
    },
  })

  return tools.map((tool) => ({
    type: 'function',
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
    strict: false,
  }))
}

async function executeAgentTool(
  supabase: any,
  toolName: string,
  args: any,
  conversation: any,
  clinicaId?: string | null
): Promise<any> {
  try {
    if (!clinicaId) {
      return { success: false, error: 'Sessão WhatsApp sem clínica vinculada.' }
    }

    switch (toolName) {
      case 'consultar_disponibilidade': {
        let medicosQuery = supabase
          .from('medicos')
          .select('id, crm, especialidade')
          .eq('ativo', true)
          .ilike('especialidade', `%${args.especialidade || ''}%`)
          .limit(5)
        if (clinicaId) medicosQuery = medicosQuery.eq('clinica_id', clinicaId)
        const { data: medicos } = await medicosQuery

        if (!medicos || medicos.length === 0) {
          return {
            success: true,
            message: 'Não encontrei médicos disponíveis para essa especialidade. Gostaria de ver outras especialidades?',
          }
        }

        // Buscar horários ocupados
        const dataRef = args.data_preferencia || new Date().toISOString().split('T')[0]
        let disponibilidadeQuery = supabase
          .from('agendamentos')
          .select('medico_id, hora_inicio')
          .eq('data', dataRef)
          .in('medico_id', medicos.map((m: any) => m.id))
        if (clinicaId) disponibilidadeQuery = disponibilidadeQuery.eq('clinica_id', clinicaId)
        const { data: agendamentos } = await disponibilidadeQuery

        const horariosOcupados = new Set(
          (agendamentos || []).map((a: any) => `${a.medico_id}-${a.hora_inicio}`)
        )

        const horariosBase = ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00']
        
        let disponibilidade = 'Horários disponíveis para ' + dataRef + ':\n\n'
        for (const medico of medicos) {
          const horariosLivres = horariosBase.filter(
            h => !horariosOcupados.has(`${medico.id}-${h}`)
          )
          if (horariosLivres.length > 0) {
            disponibilidade += `Dr(a). CRM ${medico.crm} (${medico.especialidade}):\n`
            disponibilidade += horariosLivres.join(', ') + '\n\n'
          }
        }

        return {
          success: true,
          message: disponibilidade || 'Não há horários disponíveis nesta data. Gostaria de tentar outra data?',
          data: { medicos, agendamentos },
        }
      }

      case 'consultar_agendamentos_paciente': {
        if (!conversation.paciente_id) {
          return {
            success: false,
            message: 'Não consegui identificar seu cadastro. Poderia informar seu CPF ou nome completo?',
          }
        }

        let pacienteAgendamentosQuery = supabase
          .from('agendamentos')
          .select('*, medicos(crm, especialidade)')
          .eq('paciente_id', conversation.paciente_id)
          .gte('data', new Date().toISOString().split('T')[0])
          .order('data', { ascending: true })
          .limit(5)
        if (clinicaId) pacienteAgendamentosQuery = pacienteAgendamentosQuery.eq('clinica_id', clinicaId)
        const { data: agendamentos } = await pacienteAgendamentosQuery

        if (!agendamentos || agendamentos.length === 0) {
          return {
            success: true,
            message: 'Você não tem agendamentos futuros. Gostaria de agendar uma consulta?',
          }
        }

        let texto = 'Seus próximos agendamentos:\n\n'
        agendamentos.forEach((a: any, i: number) => {
          texto += `${i + 1}. ${a.data} às ${a.hora_inicio}\n`
          texto += `   ${a.medicos?.especialidade} - CRM ${a.medicos?.crm}\n`
          texto += `   Status: ${a.status}\n\n`
        })

        return { success: true, message: texto }
      }

      case 'criar_agendamento': {
        if (!conversation.paciente_id) {
          return {
            success: false,
            message: 'Preciso identificar seu cadastro antes de agendar. Poderia informar seu CPF?',
          }
        }

        if (!clinicaId || !args.medico_id || !args.data || !args.hora_inicio) {
          return { success: false, message: 'Preciso da data, horário e profissional para concluir o agendamento.' }
        }

        const { data: medico } = await supabase
          .from('medicos')
          .select('id')
          .eq('id', args.medico_id)
          .eq('clinica_id', clinicaId)
          .eq('ativo', true)
          .maybeSingle()
        if (!medico) {
          return { success: false, message: 'Esse profissional não está disponível nesta clínica.' }
        }

        const { data: conflito } = await supabase
          .from('agendamentos')
          .select('id')
          .eq('clinica_id', clinicaId)
          .eq('medico_id', args.medico_id)
          .eq('data', args.data)
          .eq('hora_inicio', args.hora_inicio)
          .not('status', 'in', '(cancelado,recusado)')
          .limit(1)
        if (conflito?.length) {
          return { success: false, message: 'Esse horário acabou de ser ocupado. Escolha outro, por favor.' }
        }

        const { error } = await supabase.from('agendamentos').insert({
          paciente_id: conversation.paciente_id,
          clinica_id: clinicaId,
          medico_id: args.medico_id,
          data: args.data,
          hora_inicio: args.hora_inicio,
          status: 'agendado',
          tipo: 'consulta',
        })

        if (error) {
          return {
            success: false,
            message: 'Não foi possível realizar o agendamento. Por favor, tente novamente ou entre em contato por telefone.',
            error: error.message,
          }
        }

        return {
          success: true,
          message: `✅ Agendamento confirmado!\n\n📅 Data: ${args.data}\n🕐 Horário: ${args.hora_inicio}\n\nLembre-se de chegar 15 minutos antes. Até lá!`,
        }
      }

      case 'registrar_triagem': {
        // Atualizar contexto da conversa com os dados de triagem
        const triageData = {
          queixa_principal: args.queixa_principal,
          sintomas: args.sintomas,
          duracao_sintomas: args.duracao_sintomas,
          medicamentos_em_uso: args.medicamentos_em_uso,
          registrado_em: new Date().toISOString(),
        }

        const { data: conversaAtual } = await supabase
          .from('whatsapp_conversations')
          .select('contexto')
          .eq('id', conversation.id)
          .eq('clinica_id', clinicaId)
          .maybeSingle()

        const contextoAtual = Array.isArray(conversaAtual?.contexto)
          ? conversaAtual.contexto
          : []
        await supabase
          .from('whatsapp_conversations')
          .update({ contexto: [...contextoAtual, triageData] })
          .eq('id', conversation.id)
          .eq('clinica_id', clinicaId)

        return {
          success: true,
          message: 'Informações registradas! O médico terá acesso a esses dados antes da sua consulta. Há mais alguma informação que gostaria de adicionar?',
        }
      }

      case 'transferir_humano': {
        await supabase
          .from('whatsapp_conversations')
          .update({ status: 'aguardando_humano' })
          .eq('id', conversation.id)

        return {
          success: true,
          message: 'Entendi! Estou transferindo seu atendimento para um de nossos atendentes. Em breve alguém entrará em contato. Obrigado pela paciência! 🙏',
        }
      }

      default:
        return { success: false, error: `Ferramenta desconhecida: ${toolName}` }
    }
  } catch (error) {
    console.error(`[Tool ${toolName}] Error:`, error)
    return { success: false, error: String(error) }
  }
}

async function sendWhatsAppMessage(
  apiUrl: string,
  apiKey: string,
  instanceName: string,
  to: string,
  message: string
): Promise<void> {
  const response = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': apiKey,
    },
    body: JSON.stringify({
      number: to.replace('@s.whatsapp.net', ''),
      text: message,
    }),
  })

  if (!response.ok) {
    console.error('[SendMessage] Error:', await response.text())
  }
}

// Compatibilidade de leitura durante a migração; o fluxo retorna sempre false.
function legacyDeepSeekDisabled(): boolean {
  return false
}
