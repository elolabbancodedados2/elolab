import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Content-Type': 'application/fhir+json; charset=utf-8',
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ref = (type: string, id: string) => ({ reference: `${type}/${id}` })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Método não permitido' }), { status: 405, headers: cors })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: cors })
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const client = createClient(url, anon, { global: { headers: { Authorization: auth } } })
    const admin = createClient(url, service)
    const { data: userData, error: authError } = await client.auth.getUser(auth.slice(7))
    if (authError || !userData.user) return new Response(JSON.stringify({ error: 'Sessão inválida' }), { status: 401, headers: cors })
    const body = await req.json().catch(() => ({}))
    if (!uuid.test(body.paciente_id || '')) return new Response(JSON.stringify({ error: 'paciente_id inválido' }), { status: 400, headers: cors })

    const { data: paciente, error } = await client.from('pacientes').select('id,clinica_id,nome,nome_social,data_nascimento,sexo,telefone,email,logradouro,numero,cidade,estado,cep').eq('id', body.paciente_id).single()
    if (error || !paciente?.clinica_id) return new Response(JSON.stringify({ error: 'Paciente não encontrado ou sem permissão' }), { status: 404, headers: cors })
    const [{ data: agendas }, { data: exames }, { data: prontuarios }] = await Promise.all([
      client.from('agendamentos').select('id,data,hora_inicio,hora_fim,status,tipo,medico_id').eq('paciente_id', paciente.id).order('data'),
      client.from('exames').select('id,tipo_exame,status,data_solicitacao,data_realizacao,resultado,descricao,medico_solicitante_id').eq('paciente_id', paciente.id).order('created_at'),
      client.from('prontuarios').select('id,data,agendamento_id,medico_id,sinais_vitais').eq('paciente_id', paciente.id).order('data'),
    ])
    const entries: any[] = []
    entries.push({ resource: { resourceType: 'Patient', id: paciente.id, name: [{ use: 'official', text: paciente.nome }, ...(paciente.nome_social ? [{ use: 'usual', text: paciente.nome_social }] : [])], birthDate: paciente.data_nascimento || undefined, gender: paciente.sexo === 'masculino' ? 'male' : paciente.sexo === 'feminino' ? 'female' : 'unknown', telecom: [paciente.telefone && { system: 'phone', value: paciente.telefone }, paciente.email && { system: 'email', value: paciente.email }].filter(Boolean), address: paciente.logradouro ? [{ line: [`${paciente.logradouro}${paciente.numero ? `, ${paciente.numero}` : ''}`], city: paciente.cidade, state: paciente.estado, postalCode: paciente.cep, country: 'BR' }] : undefined } })
    for (const a of agendas ?? []) entries.push({ resource: { resourceType: 'Encounter', id: a.id, status: ['finalizado','concluido'].includes(a.status || '') ? 'finished' : a.status === 'cancelado' ? 'cancelled' : 'planned', class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' }, type: [{ text: a.tipo || 'consulta' }], subject: ref('Patient', paciente.id), participant: a.medico_id ? [{ individual: ref('Practitioner', a.medico_id) }] : undefined, period: { start: `${a.data}T${a.hora_inicio || '00:00'}:00`, end: a.hora_fim ? `${a.data}T${a.hora_fim}:00` : undefined } } })
    for (const e of exames ?? []) entries.push({ resource: { resourceType: 'DiagnosticReport', id: e.id, status: e.status === 'concluido' ? 'final' : e.status === 'cancelado' ? 'cancelled' : 'registered', code: { text: e.tipo_exame }, subject: ref('Patient', paciente.id), effectiveDateTime: e.data_realizacao || e.data_solicitacao || undefined, performer: e.medico_solicitante_id ? [ref('Practitioner', e.medico_solicitante_id)] : undefined, conclusion: e.resultado || e.descricao || undefined } })
    for (const p of prontuarios ?? []) {
      const vitais = p.sinais_vitais && typeof p.sinais_vitais === 'object' ? p.sinais_vitais as Record<string, unknown> : {}
      for (const [key, value] of Object.entries(vitais)) if (typeof value === 'number' || typeof value === 'string') entries.push({ resource: { resourceType: 'Observation', id: crypto.randomUUID(), status: 'final', code: { text: key }, subject: ref('Patient', paciente.id), encounter: p.agendamento_id ? ref('Encounter', p.agendamento_id) : undefined, effectiveDateTime: p.data, valueString: String(value) } })
    }
    const { error: auditError } = await admin.from('interoperability_exports').insert({ clinica_id: paciente.clinica_id, paciente_id: paciente.id, formato: 'fhir-r4-json', quantidade_recursos: entries.length, exportado_por: userData.user.id })
    if (auditError) throw new Error('Falha ao registrar auditoria da exportação')
    const bundle = { resourceType: 'Bundle', id: crypto.randomUUID(), type: 'collection', timestamp: new Date().toISOString(), meta: { tag: [{ system: 'https://elolab.com.br/fhir/export-format', code: 'fhir-r4' }] }, entry: entries }
    return new Response(JSON.stringify(bundle), { status: 200, headers: { ...cors, 'Content-Disposition': `attachment; filename="fhir-${paciente.id}.json"`, 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('fhir-export', e instanceof Error ? e.message : 'erro')
    return new Response(JSON.stringify({ error: 'Não foi possível gerar a exportação' }), { status: 500, headers: cors })
  }
})
