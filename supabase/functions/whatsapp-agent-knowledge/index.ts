import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsPadrao } from '../_shared/cors.ts'
import { recursoDoPlanoLiberado } from '../_shared/planEntitlement.ts'

type KnowledgeRequest = {
  action?: 'list' | 'save' | 'delete'
  agent_id?: string
  document_id?: string
  titulo?: string
  conteudo?: string
}

function response(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  const headers = { ...corsPadrao(req) }
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return response({ error: 'Método não permitido.' }, 405, headers)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return response({ error: 'Sessão inválida.' }, 401, headers)

    const url = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !anonKey || !serviceKey) return response({ error: 'Serviço indisponível.' }, 503, headers)

    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return response({ error: 'Sessão inválida.' }, 401, headers)

    const admin = createClient(url, serviceKey)
    const [{ data: profile }, { data: adminRole }] = await Promise.all([
      admin.from('profiles').select('clinica_id').eq('id', user.id).maybeSingle(),
      admin.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle(),
    ])
    const clinicId = profile?.clinica_id
    if (!clinicId || !adminRole) return response({ error: 'Apenas administradores da clínica podem gerenciar o conhecimento do agente.' }, 403, headers)
    if (!(await recursoDoPlanoLiberado(admin, clinicId, 'agente_ia'))) {
      return response({ error: 'O Agente de IA não está incluído no plano ativo da clínica.' }, 403, headers)
    }

    const body = await req.json() as KnowledgeRequest
    if (!body.agent_id || !/^[0-9a-f-]{36}$/i.test(body.agent_id)) {
      return response({ error: 'Agente inválido.' }, 400, headers)
    }

    const { data: agent, error: agentError } = await admin.from('whatsapp_agents')
      .select('id').eq('id', body.agent_id).eq('clinica_id', clinicId).maybeSingle()
    if (agentError || !agent) return response({ error: 'Agente não encontrado nesta clínica.' }, 404, headers)

    if (body.action === 'list') {
      const { data, error } = await admin.from('whatsapp_agent_knowledge')
        .select('id, titulo, conteudo, created_at, updated_at')
        .eq('clinica_id', clinicId).eq('agent_id', agent.id)
        .order('updated_at', { ascending: false }).limit(200)
      if (error) return response({ error: 'Não foi possível carregar a base de conhecimento.' }, 500, headers)
      return response({ data: data || [] }, 200, headers)
    }

    if (body.action === 'delete') {
      if (!body.document_id || !/^[0-9a-f-]{36}$/i.test(body.document_id)) {
        return response({ error: 'Documento inválido.' }, 400, headers)
      }
      const { data, error } = await admin.from('whatsapp_agent_knowledge').delete()
        .eq('id', body.document_id).eq('agent_id', agent.id).eq('clinica_id', clinicId)
        .select('id').maybeSingle()
      if (error) return response({ error: 'Não foi possível remover este item.' }, 500, headers)
      if (!data) return response({ error: 'Item não encontrado nesta clínica.' }, 404, headers)
      return response({ success: true }, 200, headers)
    }

    if (body.action !== 'save') return response({ error: 'Ação inválida.' }, 400, headers)
    const titulo = body.titulo?.trim() || ''
    const conteudo = body.conteudo?.trim() || ''
    if (!titulo || titulo.length > 160) return response({ error: 'O título deve ter de 1 a 160 caracteres.' }, 400, headers)
    if (!conteudo || conteudo.length > 12000) return response({ error: 'O conteúdo deve ter de 1 a 12.000 caracteres.' }, 400, headers)

    const openAiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openAiKey) return response({ error: 'A geração de embeddings não está configurada.' }, 503, headers)
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: `${titulo}\n${conteudo}` }),
      signal: AbortSignal.timeout(15000),
    })
    if (embeddingResponse.status === 401 || embeddingResponse.status === 403) {
      return response({ error: 'A integração de IA precisa de uma chave válida. O administrador deve atualizar a configuração do serviço.' }, 503, headers)
    }
    if (!embeddingResponse.ok) return response({ error: 'Não foi possível preparar a busca deste conteúdo.' }, 502, headers)
    const embeddingPayload = await embeddingResponse.json()
    const values = embeddingPayload?.data?.[0]?.embedding
    if (!Array.isArray(values) || values.length !== 1536 || values.some((value: unknown) => typeof value !== 'number' || !Number.isFinite(value))) {
      return response({ error: 'O serviço retornou um vetor inválido.' }, 502, headers)
    }

    const row = {
      clinica_id: clinicId,
      agent_id: agent.id,
      titulo,
      conteudo,
      embedding: `[${values.join(',')}]`,
    }
    if (body.document_id) {
      if (!/^[0-9a-f-]{36}$/i.test(body.document_id)) return response({ error: 'Documento inválido.' }, 400, headers)
      const { data, error } = await admin.from('whatsapp_agent_knowledge').update(row)
        .eq('id', body.document_id).eq('agent_id', agent.id).eq('clinica_id', clinicId)
        .select('id, titulo, conteudo, created_at, updated_at').maybeSingle()
      if (error) return response({ error: 'Não foi possível atualizar este conteúdo.' }, 500, headers)
      if (!data) return response({ error: 'Item não encontrado nesta clínica.' }, 404, headers)
      return response({ data }, 200, headers)
    }

    const { data, error } = await admin.from('whatsapp_agent_knowledge').insert(row)
      .select('id, titulo, conteudo, created_at, updated_at').single()
    if (error) return response({ error: 'Não foi possível salvar este conteúdo.' }, 500, headers)
    return response({ data }, 201, headers)
  } catch {
    // Payloads podem conter dados enviados pela clínica; não registrar corpo nem erros externos.
    return response({ error: 'Não foi possível concluir a operação de conhecimento.' }, 500, headers)
  }
})
