import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsPadrao } from '../_shared/cors.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ref = (type: string, id: string) => ({ reference: `${type}/${id}` })
const escapeXhtml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const narrative = (value: unknown) => ({ status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml">${escapeXhtml(value).replace(/\r?\n/g, '<br/>')}</div>` })
const decimal = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Number(value.trim().replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}
const PAGE_SIZE = 1000
async function carregarPaginado<T>(montarConsulta: (inicio: number, fim: number) => any): Promise<T[]> {
  const registros: T[] = []
  let total: number | null = null
  while (true) {
    const { data, error, count } = await montarConsulta(registros.length, registros.length + PAGE_SIZE - 1)
    if (error) throw error
    if (total === null) total = count ?? null
    const pagina = (data ?? []) as T[]
    registros.push(...pagina)
    if (pagina.length === 0 || (total !== null && registros.length >= total)) return registros
    if (total === null && pagina.length < PAGE_SIZE) return registros
  }
}

Deno.serve(async (req) => {
  const cors = { ...corsPadrao(req), 'Content-Type': 'application/fhir+json; charset=utf-8' };
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
    const { data: roles, error: rolesError } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
    if (rolesError) return new Response(JSON.stringify({ error: 'Não foi possível validar as permissões' }), { status: 500, headers: cors })
    if (!(roles ?? []).some((item: { role: string }) => ['admin', 'medico'].includes(item.role))) {
      return new Response(JSON.stringify({ error: 'Acesso não autorizado' }), { status: 403, headers: cors })
    }
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object' || !uuid.test(body.paciente_id || '')) return new Response(JSON.stringify({ error: 'paciente_id inválido' }), { status: 400, headers: cors })

    const { data: paciente, error } = await client.from('pacientes').select('id,clinica_id,nome,nome_social,data_nascimento,sexo,telefone,email,logradouro,numero,cidade,estado,cep,alergias').eq('id', body.paciente_id).single()
    if (error || !paciente?.clinica_id) return new Response(JSON.stringify({ error: 'Paciente não encontrado ou sem permissão' }), { status: 404, headers: cors })
    const [agendas, exames, prontuarios, prescricoes, triagens] = await Promise.all([
      carregarPaginado<any>((inicio, fim) => client.from('agendamentos').select('id,data,hora_inicio,hora_fim,status,tipo,medico_id', { count: 'exact' })
        .eq('paciente_id', paciente.id).eq('clinica_id', paciente.clinica_id)
        .order('data', { ascending: true }).order('id', { ascending: true }).range(inicio, fim)),
      carregarPaginado<any>((inicio, fim) => client.from('exames').select('id,tipo_exame,status,data_solicitacao,data_realizacao,resultado,arquivo_resultado,descricao,medico_solicitante_id,urgencia', { count: 'exact' })
        .eq('paciente_id', paciente.id).eq('clinica_id', paciente.clinica_id)
        .order('created_at', { ascending: true }).order('id', { ascending: true }).range(inicio, fim)),
      carregarPaginado<any>((inicio, fim) => client.from('prontuarios').select('id,data,agendamento_id,medico_id,queixa_principal,historia_doenca_atual,historia_patologica_pregressa,historia_familiar,historia_social,revisao_sistemas,alergias_relatadas,medicamentos_em_uso,sinais_vitais,exames_fisicos,exame_cabeca_pescoco,exame_torax,exame_abdomen,exame_membros,exame_neurologico,exame_pele,hipotese_diagnostica,diagnostico_principal,diagnosticos_secundarios,conduta,plano_terapeutico,orientacoes_paciente,assinado', { count: 'exact' })
        .eq('paciente_id', paciente.id).eq('clinica_id', paciente.clinica_id)
        .order('data', { ascending: true }).order('id', { ascending: true }).range(inicio, fim)),
      carregarPaginado<any>((inicio, fim) => client.from('prescricoes').select('id,prontuario_id,medico_id,medicamento,dosagem,posologia,quantidade,duracao,data_emissao,tipo', { count: 'exact' })
        .eq('paciente_id', paciente.id).eq('clinica_id', paciente.clinica_id)
        .order('data_emissao', { ascending: true }).order('id', { ascending: true }).range(inicio, fim)),
      carregarPaginado<any>((inicio, fim) => client.from('triagens').select('id,agendamento_id,pressao_arterial,frequencia_cardiaca,frequencia_respiratoria,temperatura,saturacao,peso,altura,imc,glicemia,dor_escala,data_hora', { count: 'exact' })
        .eq('paciente_id', paciente.id).eq('clinica_id', paciente.clinica_id)
        .order('data_hora', { ascending: true }).order('id', { ascending: true }).range(inicio, fim)),
    ])
    const medicoIds = [...new Set([
      ...(agendas ?? []).map((item: any) => item.medico_id),
      ...(exames ?? []).map((item: any) => item.medico_solicitante_id),
      ...(prontuarios ?? []).map((item: any) => item.medico_id),
      ...(prescricoes ?? []).map((item: any) => item.medico_id),
    ].filter((id): id is string => !!id))]
    const medicosQuery = medicoIds.length
      ? await client.from('medicos').select('id,nome,crm,crm_uf,especialidade').eq('clinica_id', paciente.clinica_id).in('id', medicoIds)
      : { data: [], error: null }
    if (medicosQuery.error) throw new Error('Falha ao consultar os profissionais vinculados ao prontuário')
    const medicos = new Map((medicosQuery.data ?? []).map((medico: any) => [medico.id, medico]))
    const laudosComArquivo = (exames ?? []).filter((exame: any) =>
      ['realizado', 'laudo_disponivel'].includes(exame.status || '') && exame.arquivo_resultado,
    )
    const urlsLaudo = new Map<string, string>()
    // Assina em lotes para não abrir uma chamada concorrente por exame em
    // pacientes com histórico extenso. O bucket continua privado; os links
    // dão acesso temporário somente aos arquivos deste Bundle.
    for (let inicio = 0; inicio < laudosComArquivo.length; inicio += 25) {
      const lote = laudosComArquivo.slice(inicio, inicio + 25)
      const urls = await Promise.all(lote.map(async (exame: any) => {
        const { data, error } = await admin.storage
          .from('medical-attachments')
          .createSignedUrl(exame.arquivo_resultado, 60 * 60)
        if (error || !data?.signedUrl) throw new Error('Não foi possível incluir um laudo anexado na exportação.')
        return [exame.id, data.signedUrl] as const
      }))
      for (const [exameId, url] of urls) urlsLaudo.set(exameId, url)
    }
    const entries: any[] = []
    const patientTelecom = [
      paciente.telefone && { system: 'phone', value: paciente.telefone },
      paciente.email && { system: 'email', value: paciente.email },
    ].filter(Boolean)
    entries.push({ resource: {
      resourceType: 'Patient',
      id: paciente.id,
      name: [{ use: 'official', text: paciente.nome }, ...(paciente.nome_social ? [{ use: 'usual', text: paciente.nome_social }] : [])],
      birthDate: paciente.data_nascimento || undefined,
      gender: paciente.sexo === 'masculino' ? 'male' : paciente.sexo === 'feminino' ? 'female' : 'unknown',
      telecom: patientTelecom.length ? patientTelecom : undefined,
      address: paciente.logradouro ? [{ line: [`${paciente.logradouro}${paciente.numero ? `, ${paciente.numero}` : ''}`], city: paciente.cidade, state: paciente.estado, postalCode: paciente.cep, country: 'BR' }] : undefined,
    } })

    for (const [index, alergia] of (paciente.alergias ?? []).entries()) {
      if (typeof alergia !== 'string' || !alergia.trim()) continue
      entries.push({ resource: {
        resourceType: 'AllergyIntolerance',
        id: `allergy-${paciente.id}-${index}`,
        clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] },
        code: { text: alergia.trim() },
        patient: ref('Patient', paciente.id),
      } })
    }

    for (const medico of medicos.values()) {
      entries.push({ resource: {
        resourceType: 'Practitioner',
        id: medico.id,
        identifier: medico.crm ? [{ value: `CRM ${medico.crm}${medico.crm_uf ? `/${medico.crm_uf}` : ''}` }] : undefined,
        name: [{ text: medico.nome || `CRM ${medico.crm || ''}`.trim() }],
        qualification: medico.especialidade ? [{ code: { text: medico.especialidade } }] : undefined,
      } })
    }

    const statusAgendamento = (status: string | null) => {
      if (['finalizado', 'concluido'].includes(status || '')) return 'finished'
      if (status === 'cancelado') return 'cancelled'
      if (['em_atendimento', 'em_andamento'].includes(status || '')) return 'in-progress'
      if (status === 'aguardando') return 'arrived'
      return 'planned'
    }
    const statusSolicitacao = (status: string | null) => status === 'cancelado' ? 'revoked' : ['realizado', 'laudo_disponivel'].includes(status || '') ? 'completed' : 'active'
    const urgenciaSolicitacao = (urgencia: string | null) => urgencia === 'emergencia' ? 'stat' : urgencia === 'urgente' ? 'urgent' : 'routine'
    const encounterIds = new Set((agendas ?? []).map((agenda: any) => agenda.id))

    for (const a of agendas ?? []) {
      const medico = a.medico_id ? medicos.get(a.medico_id) : null
      const horario = a.hora_inicio ? ` às ${String(a.hora_inicio).slice(0, 5)}` : ''
      entries.push({ resource: {
        resourceType: 'Encounter',
        id: a.id,
        status: statusAgendamento(a.status),
        class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
        type: [{ text: `${a.tipo || 'Consulta'}${horario}` }],
        subject: ref('Patient', paciente.id),
        participant: medico ? [{ individual: ref('Practitioner', medico.id) }] : undefined,
        // A coluna é DATE; manter precisão de dia evita inventar fuso horário.
        period: a.data ? { start: a.data } : undefined,
      } })
    }

    for (const e of exames ?? []) {
      const medico = e.medico_solicitante_id ? medicos.get(e.medico_solicitante_id) : null
      const request = {
        resourceType: 'ServiceRequest',
        id: e.id,
        status: statusSolicitacao(e.status),
        intent: 'order',
        priority: urgenciaSolicitacao(e.urgencia),
        code: { text: e.tipo_exame },
        subject: ref('Patient', paciente.id),
        authoredOn: e.data_solicitacao || undefined,
        requester: medico ? ref('Practitioner', medico.id) : undefined,
        reasonCode: e.descricao ? [{ text: e.descricao }] : undefined,
      }
      entries.push({ resource: request })

      if (['realizado', 'laudo_disponivel'].includes(e.status || '')) {
        entries.push({ resource: {
          resourceType: 'DiagnosticReport',
          id: `report-${e.id}`,
          status: e.status === 'laudo_disponivel' ? 'final' : 'preliminary',
          code: { text: e.tipo_exame },
          subject: ref('Patient', paciente.id),
          basedOn: [ref('ServiceRequest', e.id)],
          effectiveDateTime: e.data_realizacao || e.data_solicitacao || undefined,
          issued: e.status === 'laudo_disponivel' && e.resultado ? (e.data_realizacao || e.data_solicitacao || undefined) : undefined,
          performer: medico ? [ref('Practitioner', medico.id)] : undefined,
          conclusion: e.resultado || undefined,
          presentedForm: urlsLaudo.has(e.id) ? [{
            contentType: (() => {
              const nome = e.arquivo_resultado.toLowerCase()
              if (nome.endsWith('.pdf')) return 'application/pdf'
              if (nome.endsWith('.jpg') || nome.endsWith('.jpeg')) return 'image/jpeg'
              if (nome.endsWith('.png')) return 'image/png'
              if (nome.endsWith('.webp')) return 'image/webp'
              if (nome.endsWith('.gif')) return 'image/gif'
              return 'application/octet-stream'
            })(),
            url: urlsLaudo.get(e.id),
            title: `Laudo: ${e.tipo_exame}`,
          }] : undefined,
        } })
      }
    }

    const vitalDefinitions: Record<string, { loinc: string; display: string; unit: string; code: string }> = {
      pressao_sistolica: { loinc: '8480-6', display: 'Systolic blood pressure', unit: 'mmHg', code: 'mm[Hg]' },
      pressao_diastolica: { loinc: '8462-4', display: 'Diastolic blood pressure', unit: 'mmHg', code: 'mm[Hg]' },
      frequencia_cardiaca: { loinc: '8867-4', display: 'Heart rate', unit: '/min', code: '/min' },
      frequencia_respiratoria: { loinc: '9279-1', display: 'Respiratory rate', unit: '/min', code: '/min' },
      temperatura: { loinc: '8310-5', display: 'Body temperature', unit: '°C', code: 'Cel' },
      saturacao: { loinc: '2708-6', display: 'Oxygen saturation', unit: '%', code: '%' },
      peso: { loinc: '29463-7', display: 'Body weight', unit: 'kg', code: 'kg' },
      altura: { loinc: '8302-2', display: 'Body height', unit: 'cm', code: 'cm' },
      imc: { loinc: '39156-5', display: 'Body mass index', unit: 'kg/m2', code: 'kg/m2' },
      glasgow: { loinc: '9269-2', display: 'Glasgow coma score total', unit: 'points', code: '{score}' },
      dor: { loinc: '72514-3', display: 'Pain severity - 0-10 verbal numeric rating', unit: 'points', code: '{score}' },
    }

    const compositionIds = new Set<string>()
    for (const p of prontuarios ?? []) {
      const medico = p.medico_id ? medicos.get(p.medico_id) : null
      const vitais = p.sinais_vitais && typeof p.sinais_vitais === 'object' ? p.sinais_vitais as Record<string, unknown> : {}
      for (const [key, definition] of Object.entries(vitalDefinitions)) {
        const value = decimal(vitais[key])
        if (value === null) continue
        entries.push({ resource: {
          resourceType: 'Observation',
          id: `vital-${p.id}-${key}`,
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: definition.loinc, display: definition.display }] },
          subject: ref('Patient', paciente.id),
          encounter: p.agendamento_id && encounterIds.has(p.agendamento_id) ? ref('Encounter', p.agendamento_id) : undefined,
          effectiveDateTime: p.data || undefined,
          valueQuantity: { value, unit: definition.unit, system: 'http://unitsofmeasure.org', code: definition.code },
        } })
      }

      const conditions = [
        p.diagnostico_principal && { id: `diagnosis-${p.id}-principal`, text: p.diagnostico_principal, verification: 'confirmed' },
        p.hipotese_diagnostica && { id: `diagnosis-${p.id}-hypothesis`, text: p.hipotese_diagnostica, verification: 'unconfirmed' },
        ...((Array.isArray(p.diagnosticos_secundarios) ? p.diagnosticos_secundarios : []).map((text: string, index: number) => ({ id: `diagnosis-${p.id}-${index}`, text, verification: 'confirmed' }))),
      ].filter(Boolean) as Array<{ id: string; text: string; verification: string }>
      for (const condition of conditions) entries.push({ resource: {
        resourceType: 'Condition',
        id: condition.id,
        clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
        verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: condition.verification }] },
        code: { text: condition.text },
        subject: ref('Patient', paciente.id),
        encounter: p.agendamento_id && encounterIds.has(p.agendamento_id) ? ref('Encounter', p.agendamento_id) : undefined,
        recordedDate: p.data || undefined,
      } })

      const sections = [
        ['Queixa principal', p.queixa_principal],
        ['História da doença atual', p.historia_doenca_atual],
        ['História patológica pregressa', p.historia_patologica_pregressa],
        ['História familiar', p.historia_familiar],
        ['História social', p.historia_social],
        ['Revisão de sistemas', p.revisao_sistemas],
        ['Alergias relatadas', p.alergias_relatadas],
        ['Medicamentos em uso', p.medicamentos_em_uso],
        ['Exame físico', p.exames_fisicos],
        ['Cabeça e pescoço', p.exame_cabeca_pescoco],
        ['Tórax', p.exame_torax],
        ['Abdome', p.exame_abdomen],
        ['Membros', p.exame_membros],
        ['Exame neurológico', p.exame_neurologico],
        ['Pele', p.exame_pele],
        ['Conduta', p.conduta],
        ['Plano terapêutico', p.plano_terapeutico],
        ['Orientações ao paciente', p.orientacoes_paciente],
      ].filter(([, value]) => typeof value === 'string' && value.trim())
      if (sections.length > 0) {
        const compositionId = `composition-${p.id}`
        compositionIds.add(p.id)
        entries.push({ resource: {
        resourceType: 'Composition',
        id: compositionId,
        status: p.assinado ? 'final' : 'preliminary',
        type: { text: 'Evolução clínica ambulatorial' },
        subject: ref('Patient', paciente.id),
        encounter: p.agendamento_id && encounterIds.has(p.agendamento_id) ? ref('Encounter', p.agendamento_id) : undefined,
        date: p.data,
        author: medico ? [ref('Practitioner', medico.id)] : [{ display: 'Profissional solicitante' }],
        title: `Evolução clínica — ${p.data}`,
        section: sections.map(([title, value]) => ({ title, text: narrative(value) })),
        } })
      }
    }

    // O fluxo atual grava as medições da triagem em `triagens`, separado dos
    // sinais anotados dentro do prontuário. Exportar apenas `sinais_vitais`
    // deixava de fora boa parte do histórico clínico já registrado.
    const triageVitalDefinitions: Record<string, { loinc: string; display: string; unit: string; code: string }> = {
      frequencia_cardiaca: { loinc: '8867-4', display: 'Heart rate', unit: '/min', code: '/min' },
      frequencia_respiratoria: { loinc: '9279-1', display: 'Respiratory rate', unit: '/min', code: '/min' },
      temperatura: { loinc: '8310-5', display: 'Body temperature', unit: '°C', code: 'Cel' },
      saturacao: { loinc: '2708-6', display: 'Oxygen saturation', unit: '%', code: '%' },
      peso: { loinc: '29463-7', display: 'Body weight', unit: 'kg', code: 'kg' },
      altura: { loinc: '8302-2', display: 'Body height', unit: 'cm', code: 'cm' },
      imc: { loinc: '39156-5', display: 'Body mass index', unit: 'kg/m2', code: 'kg/m2' },
      glicemia: { loinc: '2339-0', display: 'Glucose [Mass/volume] in Blood', unit: 'mg/dL', code: 'mg/dL' },
      dor_escala: { loinc: '72514-3', display: 'Pain severity - 0-10 verbal numeric rating', unit: 'points', code: '{score}' },
    }
    for (const triagem of triagens ?? []) {
      const common = {
        status: 'final',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
        subject: ref('Patient', paciente.id),
        encounter: triagem.agendamento_id && encounterIds.has(triagem.agendamento_id) ? ref('Encounter', triagem.agendamento_id) : undefined,
        effectiveDateTime: triagem.data_hora || undefined,
      }
      const pressure = typeof triagem.pressao_arterial === 'string'
        ? triagem.pressao_arterial.match(/^\s*(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)\s*$/)
        : null
      if (pressure) {
        const systolic = decimal(pressure[1])
        const diastolic = decimal(pressure[2])
        if (systolic !== null && diastolic !== null) entries.push({ resource: {
          resourceType: 'Observation',
          id: `triage-${triagem.id}-blood-pressure`,
          ...common,
          code: { coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure panel' }] },
          component: [
            { code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' }] }, valueQuantity: { value: systolic, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' } },
            { code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' }] }, valueQuantity: { value: diastolic, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' } },
          ],
        } })
      }
      for (const [key, definition] of Object.entries(triageVitalDefinitions)) {
        const value = decimal(triagem[key])
        if (value === null) continue
        entries.push({ resource: {
          resourceType: 'Observation',
          id: `triage-${triagem.id}-${key}`,
          ...common,
          code: { coding: [{ system: 'http://loinc.org', code: definition.loinc, display: definition.display }] },
          valueQuantity: { value, unit: definition.unit, system: 'http://unitsofmeasure.org', code: definition.code },
        } })
      }
    }

    for (const prescription of prescricoes ?? []) {
      const medico = prescription.medico_id ? medicos.get(prescription.medico_id) : null
      const prescriptionNotes = [prescription.tipo && `Tipo: ${prescription.tipo}`, prescription.quantidade && `Quantidade: ${prescription.quantidade}`]
        .filter(Boolean).map((text) => ({ text: text as string }))
      entries.push({ resource: {
        resourceType: 'MedicationRequest',
        id: prescription.id,
        status: 'unknown',
        intent: 'order',
        subject: ref('Patient', paciente.id),
        supportingInformation: prescription.prontuario_id && compositionIds.has(prescription.prontuario_id)
          ? [ref('Composition', `composition-${prescription.prontuario_id}`)]
          : undefined,
        medicationCodeableConcept: { text: prescription.medicamento },
        authoredOn: prescription.data_emissao || undefined,
        requester: medico ? ref('Practitioner', medico.id) : undefined,
        dosageInstruction: [prescription.dosagem, prescription.posologia, prescription.duracao && `Duração: ${prescription.duracao}`].filter(Boolean).length
          ? [{ text: [prescription.dosagem, prescription.posologia, prescription.duracao && `Duração: ${prescription.duracao}`].filter(Boolean).join(' — ') }]
          : undefined,
        note: prescriptionNotes.length ? prescriptionNotes : undefined,
      } })
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
