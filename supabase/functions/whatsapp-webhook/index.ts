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
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')!
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')!
    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY')!

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
      .single()

    if (!session) {
      console.log('[Webhook] Session not found for instance:', instanceName)
      return new Response(JSON.stringify({ received: true }), { headers: corsHeaders })
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
        const qrCode = data?.qrcode?.base64 || data?.base64
        
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
            .single()

          if (!conversation) {
            // Tentar vincular a um paciente pelo telefone
            const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
            const { data: paciente } = await supabase
              .from('pacientes')
              .select('id')
              .or(`telefone.ilike.%${phoneNumber.slice(-8)}%,telefone.ilike.%${phoneNumber.slice(-9)}%`)
              .limit(1)
              .single()

            const { data: newConversation } = await supabase
              .from('whatsapp_conversations')
              .insert({
                session_id: session.id,
                remote_jid: remoteJid,
                paciente_id: paciente?.id || null,
                contexto: [],
              })
              .select()
              .single()

            conversation = newConversation
          }

          if (!conversation) continue

          // Salvar mensagem recebida
          await supabase
            .from('whatsapp_messages')
            .insert({
              conversation_id: conversation.id,
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
          if (session.agent_id && session.whatsapp_agents) {
            const agent = session.whatsapp_agents

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
                .single()

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

            // Chamar IA
            const startTime = Date.now()
            const aiResponse = await fetch('https://api.deepseek.com/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${deepseekApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'deepseek-chat',
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

  return tools
}

async function executeAgentTool(
  supabase: any,
  toolName: string,
  args: any,
  conversation: any
): Promise<any> {
  try {
    switch (toolName) {
      case 'consultar_disponibilidade': {
        const { data: medicos } = await supabase
          .from('medicos')
          .select('id, crm, especialidade')
          .eq('ativo', true)
          .ilike('especialidade', `%${args.especialidade || ''}%`)
          .limit(5)

        if (!medicos || medicos.length === 0) {
          return {
            success: true,
            message: 'Não encontrei médicos disponíveis para essa especialidade. Gostaria de ver outras especialidades?',
          }
        }

        // Buscar horários ocupados
        const dataRef = args.data_preferencia || new Date().toISOString().split('T')[0]
        const { data: agendamentos } = await supabase
          .from('agendamentos')
          .select('medico_id, hora_inicio')
          .eq('data', dataRef)
          .in('medico_id', medicos.map((m: any) => m.id))

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

        const { data: agendamentos } = await supabase
          .from('agendamentos')
          .select('*, medicos(crm, especialidade)')
          .eq('paciente_id', conversation.paciente_id)
          .gte('data', new Date().toISOString().split('T')[0])
          .order('data', { ascending: true })
          .limit(5)

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

        const { error } = await supabase.from('agendamentos').insert({
          paciente_id: conversation.paciente_id,
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

        await supabase
          .from('whatsapp_conversations')
          .update({
            contexto: supabase.sql`contexto || ${JSON.stringify(triageData)}::jsonb`,
          })
          .eq('id', conversation.id)

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
