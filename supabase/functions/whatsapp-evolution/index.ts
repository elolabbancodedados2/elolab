import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

interface EvolutionRequest {
  action: 'create_instance' | 'get_qr_code' | 'check_status' | 'send_message' | 'delete_instance' | 'list_instances'
  instance_name?: string
  session_id?: string
  to?: string
  message?: string
}

function extractQrCode(payload: any): string | null {
  const base64 = payload?.base64 || payload?.qrcode?.base64 || payload?.qr?.base64
  if (typeof base64 === 'string' && base64.trim()) return base64

  const code = payload?.code || payload?.qrcode?.code || payload?.qr?.code
  return typeof code === 'string' && code.trim() ? code : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

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
    const evolutionApiUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/+$/, '')
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')

    if (!evolutionApiUrl || !evolutionApiKey) {
      throw new Error('Evolution API não configurada. Configure EVOLUTION_API_URL e EVOLUTION_API_KEY.')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ─── Autorização ──────────────────────────────────────────────────────
    // Antes daqui só se validava que o JWT era válido. Depois disso a função
    // passava a usar o service_role — que ignora o RLS — e aceitava o
    // `session_id`/`instance_name` que viesse no corpo da requisição, sem
    // conferir de quem era. Um usuário de uma clínica que descobrisse o id de
    // sessão de outra pegava o QR Code dela (ou seja, pareava o WhatsApp da
    // concorrente no próprio celular), mandava mensagem em nome dela ou
    // apagava a instância.
    //
    // A clínica agora vem do perfil de quem chamou, nunca do corpo.
    const { data: profile } = await supabase
      .from('profiles').select('clinica_id').eq('id', user.id).maybeSingle()
    const clinicaId = (profile as any)?.clinica_id

    if (!clinicaId) {
      return new Response(
        JSON.stringify({ error: 'Usuário sem clínica associada.' }),
        { status: 403, headers: corsHeaders },
      )
    }

    // Conectar, trocar ou apagar o WhatsApp da clínica é ação de administrador.
    const { data: ehAdmin } = await supabase
      .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle()

    const body: EvolutionRequest = await req.json()
    const { action, instance_name, session_id, to, message } = body

    const ACOES_DE_ADMIN = new Set(['create_instance', 'delete_instance', 'get_qr_code'])
    if (ACOES_DE_ADMIN.has(action) && !ehAdmin) {
      return new Response(
        JSON.stringify({ error: 'Só um administrador da clínica pode gerenciar a conexão do WhatsApp.' }),
        { status: 403, headers: corsHeaders },
      )
    }

    /**
     * Resolve a instância a partir de `session_id` ou `instance_name` e confirma
     * que ela pertence à clínica de quem chamou. Devolve null quando não é dela
     * — e o chamador responde 404, para não confirmar que a sessão existe.
     */
    const resolverInstanciaDaClinica = async (): Promise<string | null> => {
      const filtro = supabase
        .from('whatsapp_sessions')
        .select('instance_name')
        .eq('clinica_id', clinicaId)

      const { data: sessao } = session_id
        ? await filtro.eq('id', session_id).maybeSingle()
        : await filtro.eq('instance_name', instance_name!).maybeSingle()

      return (sessao as any)?.instance_name ?? null
    }

    const naoEncontrada = () => new Response(
      JSON.stringify({ error: 'Sessão não encontrada nesta clínica.' }),
      { status: 404, headers: corsHeaders },
    )

    console.log(`[WhatsApp Evolution] Action: ${action}, Clínica: ${clinicaId}`)

    let result: any = null

    switch (action) {
      case 'create_instance': {
        if (!instance_name) throw new Error('instance_name é obrigatório')

        // Nome de instância é global na Evolution API. Sem esta checagem, uma
        // clínica podia criar uma instância com o nome da instância de outra e
        // sequestrar a sessão dela.
        const { data: jaExiste } = await supabase
          .from('whatsapp_sessions')
          .select('clinica_id')
          .eq('instance_name', instance_name)
          .maybeSingle()

        if (jaExiste && (jaExiste as any).clinica_id !== clinicaId) {
          return new Response(
            JSON.stringify({ error: 'Este nome de instância já está em uso. Escolha outro.' }),
            { status: 409, headers: corsHeaders },
          )
        }

        // Criar instância na Evolution API
        const createResponse = await fetch(`${evolutionApiUrl}/instance/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionApiKey,
          },
          body: JSON.stringify({
            instanceName: instance_name,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
          }),
        })

        if (!createResponse.ok) {
          const errorText = await createResponse.text()
          console.error('[Evolution API] Create error:', errorText)
          throw new Error(`Erro ao criar instância: ${errorText}`)
        }

        const createData = await createResponse.json()
        console.log('[Evolution API] Instance created:', createData)

        // Obter QR Code
        const qrResponse = await fetch(`${evolutionApiUrl}/instance/connect/${instance_name}`, {
          method: 'GET',
          headers: {
            'apikey': evolutionApiKey,
          },
        })

        let qrCode = null
        if (qrResponse.ok) {
          const qrData = await qrResponse.json()
          qrCode = extractQrCode(qrData)
        }

        // Salvar sessão no banco
        const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`
        
        const { data: sessionData, error: sessionError } = await supabase
          .from('whatsapp_sessions')
          .insert({
            instance_name,
            instance_id: createData.instance?.instanceId || instance_name,
            status: qrCode ? 'qr_code' : 'connecting',
            qr_code: qrCode,
            qr_code_expires_at: qrCode ? new Date(Date.now() + 60000).toISOString() : null,
            webhook_url: webhookUrl,
            clinica_id: clinicaId, // sem isto a sessão nasce órfã e some do filtro
          })
          .select()
          .single()

        if (sessionError) {
          console.error('[Supabase] Session insert error:', sessionError)
          throw sessionError
        }

        // Configurar webhook na Evolution API
        await fetch(`${evolutionApiUrl}/webhook/set/${instance_name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionApiKey,
          },
          body: JSON.stringify({
            url: webhookUrl,
            webhook_by_events: false,
            webhook_base64: false,
            events: [
              'MESSAGES_UPSERT',
              'MESSAGES_UPDATE',
              'CONNECTION_UPDATE',
              'QRCODE_UPDATED',
            ],
          }),
        })

        result = {
          session: sessionData,
          qr_code: qrCode,
        }
        break
      }

      case 'get_qr_code': {
        if (!instance_name && !session_id) throw new Error('instance_name ou session_id é obrigatório')

        // O QR Code é a credencial de pareamento: quem o obtém conecta o
        // WhatsApp da clínica ao próprio aparelho. Só sai para a clínica dona.
        const instanceName = await resolverInstanciaDaClinica()
        if (!instanceName) return naoEncontrada()

        const qrResponse = await fetch(`${evolutionApiUrl}/instance/connect/${instanceName}`, {
          method: 'GET',
          headers: {
            'apikey': evolutionApiKey,
          },
        })

        if (!qrResponse.ok) {
          const errorText = await qrResponse.text()
          throw new Error(`Erro ao obter QR Code: ${errorText}`)
        }

        const qrData = await qrResponse.json()
        const qrCode = extractQrCode(qrData)

        if (!qrCode) {
          throw new Error('A Evolution API não retornou um QR Code válido.')
        }

        // Atualizar no banco
        await supabase
          .from('whatsapp_sessions')
          .update({
            qr_code: qrCode,
            qr_code_expires_at: new Date(Date.now() + 60000).toISOString(),
            status: 'qr_code',
          })
          .eq('instance_name', instanceName)

        result = { qr_code: qrCode }
        break
      }

      case 'check_status': {
        if (!instance_name && !session_id) throw new Error('instance_name ou session_id é obrigatório')

        const instanceName = await resolverInstanciaDaClinica()
        if (!instanceName) return naoEncontrada()

        const statusResponse = await fetch(`${evolutionApiUrl}/instance/connectionState/${instanceName}`, {
          method: 'GET',
          headers: {
            'apikey': evolutionApiKey,
          },
        })

        if (!statusResponse.ok) {
          result = { status: 'disconnected', connected: false }
          break
        }

        const statusData = await statusResponse.json()
        const isConnected = statusData.state === 'open'

        // Atualizar status no banco
        await supabase
          .from('whatsapp_sessions')
          .update({
            status: isConnected ? 'connected' : 'disconnected',
            phone_number: statusData.instance?.profilePictureUrl ? statusData.instance.owner : null,
          })
          .eq('instance_name', instanceName)

        result = {
          status: isConnected ? 'connected' : 'disconnected',
          connected: isConnected,
          state: statusData.state,
        }
        break
      }

      case 'send_message': {
        if ((!instance_name && !session_id) || !to || !message) {
          throw new Error('instance_name (ou session_id), to e message são obrigatórios')
        }

        // O `instance_name` vinha do corpo e ia direto para a Evolution API:
        // bastava saber o nome da instância de outra clínica para disparar
        // mensagem em nome dela, para os pacientes dela.
        const instanceName = await resolverInstanciaDaClinica()
        if (!instanceName) return naoEncontrada()

        const sendResponse = await fetch(`${evolutionApiUrl}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionApiKey,
          },
          body: JSON.stringify({
            number: to,
            text: message,
          }),
        })

        if (!sendResponse.ok) {
          const errorText = await sendResponse.text()
          throw new Error(`Erro ao enviar mensagem: ${errorText}`)
        }

        result = await sendResponse.json()
        break
      }

      case 'delete_instance': {
        if (!instance_name && !session_id) throw new Error('instance_name ou session_id é obrigatório')

        const instanceName = await resolverInstanciaDaClinica()
        if (!instanceName) return naoEncontrada()

        // Deletar da Evolution API
        await fetch(`${evolutionApiUrl}/instance/delete/${instanceName}`, {
          method: 'DELETE',
          headers: {
            'apikey': evolutionApiKey,
          },
        })

        // Deletar do banco
        await supabase
          .from('whatsapp_sessions')
          .delete()
          .eq('instance_name', instanceName)

        result = { deleted: true }
        break
      }

      case 'list_instances': {
        // Devolvia a lista de TODAS as instâncias da Evolution API — de todas
        // as clínicas do servidor. Era o mapa que tornava os outros ataques
        // triviais: dava os nomes de instância de todo mundo.
        const { data: sessoesDaClinica } = await supabase
          .from('whatsapp_sessions')
          .select('instance_name')
          .eq('clinica_id', clinicaId)

        const nomesPermitidos = new Set(
          (sessoesDaClinica || []).map((s: any) => s.instance_name),
        )

        if (nomesPermitidos.size === 0) {
          result = []
          break
        }

        const listResponse = await fetch(`${evolutionApiUrl}/instance/fetchInstances`, {
          method: 'GET',
          headers: {
            'apikey': evolutionApiKey,
          },
        })

        if (listResponse.ok) {
          const todas = await listResponse.json()
          result = Array.isArray(todas)
            ? todas.filter((i: any) =>
                nomesPermitidos.has(i?.instance?.instanceName ?? i?.instanceName ?? i?.name),
              )
            : []
        } else {
          result = []
        }
        break
      }

      default:
        throw new Error(`Ação desconhecida: ${action}`)
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[WhatsApp Evolution] Error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
