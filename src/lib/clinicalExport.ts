import { format } from 'date-fns';

/**
 * Export patient clinical data as a FHIR R4 Bundle or simplified clinical XML.
 */

export interface ExportPaciente {
  id: string;
  nome: string;
  nome_social?: string;
  cpf?: string;
  data_nascimento?: string;
  sexo?: string;
  telefone?: string;
  email?: string;
  alergias?: string[];
}

export interface ExportProntuario {
  id: string;
  data: string;
  queixa_principal?: string;
  historia_doenca_atual?: string;
  historia_patologica_pregressa?: string;
  historia_familiar?: string;
  historia_social?: string;
  revisao_sistemas?: string;
  exames_fisicos?: string;
  alergias_relatadas?: string;
  medicamentos_em_uso?: string;
  hipotese_diagnostica?: string;
  diagnostico_principal?: string;
  diagnosticos_secundarios?: string[];
  conduta?: string;
  sinais_vitais?: Record<string, string>;
  medico_nome?: string;
  medico_crm?: string;
  assinado_por?: string;
  crm_assinante?: string;
  assinado?: boolean;
}

export interface ExportData {
  paciente: ExportPaciente;
  prontuarios: ExportProntuario[];
  exames?: Array<{ id: string; tipo: string; data?: string; status?: string; resultado?: string; observacoes?: string; conteudoBase64?: string; nomeArquivo?: string; tipoArquivo?: string }>;
  anexos?: Array<{ id: string; nome: string; tipo: string; categoria?: string; descricao?: string; data?: string; conteudoBase64: string }>;
  adendos?: Array<{ id: string; tipo: string; motivo: string; texto: string; medico_nome: string; crm: string; data: string }>;
  prescricoes?: Array<{ medicamento: string; dosagem?: string; posologia?: string; duracao?: string; quantidade?: string; observacoes?: string; prontuario_id?: string }>;
}

function escapeXhtml(value?: string): string {
  return (value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
}

function mapSexo(sexo?: string): string {
  if (sexo === 'masculino') return 'male';
  if (sexo === 'feminino') return 'female';
  return 'unknown';
}

function criarCondicoesDiagnosticas(texto: string | undefined, tipo: 'principal' | 'hipotese' | 'secundario', prontuarioId: string, data: string, pacienteRef: { reference: string }, encounterRef: { reference: string }) {
  if (!texto?.trim()) return [];
  return texto.split(/[;\n]/).map(item => item.trim()).filter(Boolean).map((descricao, index) => {
    const coded = descricao.match(/^([A-Z]\d{2}(?:\.[A-Z0-9]{1,4})?)\s*[-–—]\s*(.+)$/i);
    const display = coded?.[2]?.trim() || descricao;
    const verification = tipo === 'hipotese' ? 'provisional' : 'confirmed';
    return {
      resourceType: 'Condition',
      id: `condition-${prontuarioId}-${tipo}-${index + 1}`,
      subject: pacienteRef,
      encounter: encounterRef,
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'encounter-diagnosis' }] }],
      code: {
        ...(coded ? { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: coded[1].toUpperCase(), display }] } : {}),
        text: display,
      },
      verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: verification }] },
      recordedDate: data,
    };
  });
}

/**
 * Generate FHIR-compatible JSON export
 */
export function exportToFHIR(data: ExportData): string {
  const agora = new Date().toISOString();
  const criarUuid = () => {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  const criarFullUrl = () => `urn:uuid:${criarUuid()}`;
  const adicionarEntry = (resource: any) => ({ fullUrl: criarFullUrl(), resource });
  const entradasClinicas: any[] = [];
  const referenciasAtendimentos: Array<{ reference: string }> = [];
  const referenciasDiagnosticas: Array<{ reference: string }> = [];
  const referenciasPrescricoes: Array<{ reference: string }> = [];
  const referenciasAlergias: Array<{ reference: string }> = [];
  const referenciasSinaisVitais: Array<{ reference: string }> = [];
  const referenciasExames: Array<{ reference: string }> = [];
  const referenciasAnexos: Array<{ reference: string }> = [];
  const bundle: any = {
    resourceType: 'Bundle',
    type: 'document',
    identifier: { system: 'urn:ietf:rfc:3986', value: criarFullUrl() },
    timestamp: agora,
    meta: {
      source: 'EloLab Clínica Médica',
      versionId: '1',
      lastUpdated: agora,
    },
    entry: [],
  };

  // Patient resource
  const patient: any = {
    resource: {
      resourceType: 'Patient',
      id: data.paciente.id,
      name: [
        {
          use: 'official',
          text: data.paciente.nome,
        },
      ],
      gender: mapSexo(data.paciente.sexo),
      birthDate: data.paciente.data_nascimento || undefined,
      telecom: [],
      identifier: [],
    },
  };

  if (data.paciente.nome_social) {
    patient.resource.name.push({
      use: 'usual',
      text: data.paciente.nome_social,
    });
  }

  if (data.paciente.cpf) {
    patient.resource.identifier.push({
      system: 'urn:oid:2.16.840.1.113883.13.237',
      value: data.paciente.cpf,
      type: { text: 'CPF' },
    });
  }

  if (data.paciente.telefone) {
    patient.resource.telecom.push({ system: 'phone', value: data.paciente.telefone });
  }
  if (data.paciente.email) {
    patient.resource.telecom.push({ system: 'email', value: data.paciente.email });
  }

  const pacienteEntry = adicionarEntry(patient.resource);
  const referenciaPaciente = { reference: pacienteEntry.fullUrl };

  // Allergy resources
  if (data.paciente.alergias?.length) {
    data.paciente.alergias.forEach((alergia, i) => {
      const allergyEntry = adicionarEntry({
          resourceType: 'AllergyIntolerance',
          id: `allergy-${i + 1}`,
          patient: referenciaPaciente,
          code: { text: alergia },
          clinicalStatus: {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }],
          },
        });
      entradasClinicas.push(allergyEntry);
      referenciasAlergias.push({ reference: allergyEntry.fullUrl });
    });
  }

  // Encounter/Prontuario resources
  const secoesAtendimentos: any[] = [];
  data.prontuarios.forEach((p) => {
    const encounter = {
        resourceType: 'Encounter',
        id: p.id,
        status: p.assinado ? 'finished' : 'in-progress',
        class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
        period: { start: p.data },
        subject: referenciaPaciente,
        reasonCode: p.queixa_principal ? [{ text: p.queixa_principal }] : undefined,
    };
    const encounterEntry = adicionarEntry(encounter);
    entradasClinicas.push(encounterEntry);
    referenciasAtendimentos.push({ reference: encounterEntry.fullUrl });
    const camposClinicos: Array<[string, string | undefined]> = [
      ['Queixa principal', p.queixa_principal], ['História da doença atual', p.historia_doenca_atual],
      ['História patológica pregressa', p.historia_patologica_pregressa], ['História familiar', p.historia_familiar],
      ['História social', p.historia_social], ['Revisão de sistemas', p.revisao_sistemas],
      ['Exame físico', p.exames_fisicos], ['Alergias relatadas', p.alergias_relatadas],
      ['Medicamentos em uso', p.medicamentos_em_uso], ['Hipótese diagnóstica', p.hipotese_diagnostica],
      ['Diagnóstico principal', p.diagnostico_principal], ['Diagnósticos secundários', p.diagnosticos_secundarios?.join('; ')],
      ['Conduta', p.conduta],
    ];
    const narrativa = camposClinicos.filter(([, value]) => value?.trim())
      .map(([label, value]) => `<p><b>${escapeXhtml(label)}:</b> ${escapeXhtml(value)}</p>`).join('');
    if (narrativa) secoesAtendimentos.push({
      title: `Atendimento ${p.data}`,
      text: { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml">${narrativa}</div>` },
      entry: [{ reference: encounterEntry.fullUrl }],
    });

    // Clinical diagnoses retain their code and verification stage in FHIR.
    const referenciaAtendimento = { reference: encounterEntry.fullUrl };
    [
      ...criarCondicoesDiagnosticas(p.diagnostico_principal, 'principal', p.id, p.data, referenciaPaciente, referenciaAtendimento),
      ...criarCondicoesDiagnosticas(p.hipotese_diagnostica, 'hipotese', p.id, p.data, referenciaPaciente, referenciaAtendimento),
      ...criarCondicoesDiagnosticas(p.diagnosticos_secundarios?.join('\n'), 'secundario', p.id, p.data, referenciaPaciente, referenciaAtendimento),
    ].forEach(condition => {
      const conditionEntry = adicionarEntry(condition);
      entradasClinicas.push(conditionEntry);
      referenciasDiagnosticas.push({ reference: conditionEntry.fullUrl });
    });

    // Vital signs
    if (p.sinais_vitais) {
      const vitals = p.sinais_vitais;
      const vitalEntries: Array<{ code: string; display: string; value?: string; unit: string; ucum?: string; category?: string }> = [
        { code: '8480-6', display: 'Systolic blood pressure', value: vitals.pressao_sistolica, unit: 'mmHg' },
        { code: '8462-4', display: 'Diastolic blood pressure', value: vitals.pressao_diastolica, unit: 'mmHg' },
        { code: '8867-4', display: 'Heart rate', value: vitals.frequencia_cardiaca, unit: 'bpm' },
        { code: '8310-5', display: 'Body temperature', value: vitals.temperatura, unit: '°C' },
        { code: '2708-6', display: 'Oxygen saturation', value: vitals.saturacao, unit: '%' },
        { code: '29463-7', display: 'Body weight', value: vitals.peso, unit: 'kg' },
        { code: '8302-2', display: 'Body height', value: vitals.altura, unit: 'cm' },
        { code: '9279-1', display: 'Respiratory rate', value: vitals.frequencia_respiratoria, unit: '/min', ucum: '/min' },
        { code: '39156-5', display: 'Body mass index', value: vitals.imc, unit: 'kg/m2', ucum: 'kg/m2' },
        { code: '2345-7', display: 'Glucose [Mass/volume] in Serum or Plasma', value: vitals.glicemia, unit: 'mg/dL', ucum: 'mg/dL', category: 'laboratory' },
        { code: '8280-0', display: 'Waist circumference', value: vitals.circunferencia_abdominal, unit: 'cm', ucum: 'cm' },
        { code: '9843-4', display: 'Head circumference', value: vitals.circunferencia_craniana, unit: 'cm', ucum: 'cm' },
        { code: '9269-2', display: 'Glasgow coma score total', value: vitals.glasgow, unit: '{score}', ucum: '{score}', category: 'survey' },
        { code: '72514-3', display: 'Pain severity - 0-10 verbal numeric rating [Score]', value: vitals.dor, unit: '{score}', ucum: '{score}', category: 'survey' },
      ];

      vitalEntries.filter(v => v.value && Number.isFinite(Number(v.value.replace(',', '.')))).forEach((v, i) => {
        const observationEntry = adicionarEntry({
            resourceType: 'Observation',
            id: `obs-${p.id}-${i}`,
            status: 'final',
            category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: v.category || 'vital-signs' }] }],
            code: { coding: [{ system: 'http://loinc.org', code: v.code, display: v.display }] },
            subject: referenciaPaciente,
            encounter: { reference: encounterEntry.fullUrl },
            effectiveDateTime: p.data,
            valueQuantity: {
              value: Number(v.value!.replace(',', '.')),
              unit: v.unit,
              system: 'http://unitsofmeasure.org',
              code: v.ucum || (v.code === '8310-5' ? 'Cel' : v.unit === 'mmHg' ? 'mm[Hg]' : v.unit === 'bpm' ? '/min' : v.unit),
            },
          });
        entradasClinicas.push(observationEntry);
        referenciasSinaisVitais.push({ reference: observationEntry.fullUrl });
      });
    }
  });

  // MedicationRequest resources
  data.prescricoes?.forEach((presc, i) => {
    const encounterIndex = presc.prontuario_id
      ? data.prontuarios.findIndex(p => p.id === presc.prontuario_id)
      : -1;
    const medicationEntry = adicionarEntry({
        resourceType: 'MedicationRequest',
        id: `med-${i}`,
        status: 'active',
        intent: 'order',
        subject: referenciaPaciente,
        encounter: encounterIndex >= 0 ? referenciasAtendimentos[encounterIndex] : undefined,
        medicationCodeableConcept: { text: presc.medicamento },
        dosageInstruction: presc.posologia ? [{ text: [presc.dosagem, presc.posologia, presc.duracao, presc.quantidade].filter(Boolean).join(' · ') }] : undefined,
        note: presc.observacoes ? [{ text: presc.observacoes }] : undefined,
      });
    entradasClinicas.push(medicationEntry);
    referenciasPrescricoes.push({ reference: medicationEntry.fullUrl });
  });

  data.exames?.forEach((exame, index) => {
    const status = ['concluido', 'laudo_disponivel'].includes(exame.status || '') ? 'final'
      : ['em_andamento', 'em processamento'].includes(exame.status || '') ? 'partial' : 'registered';
    const report = adicionarEntry({
      resourceType: 'DiagnosticReport', id: exame.id || `exame-${index}`, status,
      code: { text: exame.tipo }, subject: referenciaPaciente,
      effectiveDateTime: exame.data, conclusion: exame.resultado || undefined,
      note: exame.observacoes ? [{ text: exame.observacoes }] : undefined,
      presentedForm: exame.conteudoBase64 ? [{
        contentType: exame.tipoArquivo || 'application/octet-stream', title: exame.nomeArquivo,
        data: exame.conteudoBase64,
      }] : undefined,
    });
    entradasClinicas.push(report);
    referenciasExames.push({ reference: report.fullUrl });
  });

  data.anexos?.forEach((anexo, index) => {
    const documento = adicionarEntry({
      resourceType: 'DocumentReference', id: anexo.id || `anexo-${index}`,
      status: 'current', docStatus: 'final', subject: referenciaPaciente,
      date: anexo.data, description: anexo.descricao || anexo.categoria || undefined,
      content: [{ attachment: {
        contentType: anexo.tipo || 'application/octet-stream', title: anexo.nome,
        creation: anexo.data, data: anexo.conteudoBase64,
      } }],
    });
    entradasClinicas.push(documento);
    referenciasAnexos.push({ reference: documento.fullUrl });
  });

  const secoesAdendos = (data.adendos || []).map(adendo => ({
    title: `${adendo.tipo} — ${adendo.data}`,
    text: { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml"><p><b>Motivo:</b> ${escapeXhtml(adendo.motivo)}</p><p>${escapeXhtml(adendo.texto)}</p><p>${escapeXhtml(adendo.medico_nome)} — CRM ${escapeXhtml(adendo.crm)}</p></div>` },
  }));

  const composition = {
    resourceType: 'Composition',
    id: 'documento-clinico',
    status: data.prontuarios.length > 0 && data.prontuarios.every(p => p.assinado) ? 'final' : 'preliminary',
    type: { coding: [{ system: 'http://loinc.org', code: '34133-9', display: 'Summarization of Episode Note' }] },
    subject: referenciaPaciente,
    date: agora,
    title: 'Prontuário clínico EloLab',
    author: [...new Set(data.prontuarios.map(p => p.assinado ? (p.assinado_por || 'Assinante não identificado') : p.medico_nome).filter(Boolean))]
      .map(display => ({ display })),
    section: [{
      title: 'Atendimentos',
      text: { status: 'generated', div: '<div xmlns="http://www.w3.org/1999/xhtml">Resumo dos atendimentos clínicos exportados.</div>' },
      entry: referenciasAtendimentos,
    }, ...(referenciasAlergias.length ? [{ title: 'Alergias', entry: referenciasAlergias }] : []),
       ...(referenciasSinaisVitais.length ? [{ title: 'Sinais vitais', entry: referenciasSinaisVitais }] : []), ...(referenciasDiagnosticas.length ? [{ title: 'Diagnósticos', entry: referenciasDiagnosticas }] : []),
       ...(referenciasExames.length ? [{ title: 'Exames', entry: referenciasExames }] : []),
       ...(referenciasAnexos.length ? [{ title: 'Anexos', entry: referenciasAnexos }] : []),
       ...secoesAtendimentos, ...secoesAdendos,
       ...(referenciasPrescricoes.length ? [{ title: 'Prescricoes', entry: referenciasPrescricoes }] : [])],
  };
  if (composition.author.length === 0) composition.author.push({ display: 'EloLab' });
  bundle.entry = [adicionarEntry(composition), pacienteEntry, ...entradasClinicas];

  return JSON.stringify(bundle, null, 2);
}

/**
 * Generate XML export (simplified CDA-like structure)
 */
export function exportToXML(data: ExportData): string {
  const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<EloLabClinicalExport version="1">
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  <id root="${data.paciente.id}"/>
  <code code="34133-9" displayName="Summarization of Episode Note" codeSystem="2.16.840.1.113883.6.1"/>
  <title>Prontuário Clínico — ${escapeXml(data.paciente.nome)}</title>
  <effectiveTime value="${format(new Date(), 'yyyyMMddHHmmss')}"/>
  <confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25"/>
  
  <recordTarget>
    <patientRole>
      <id extension="${escapeXml(data.paciente.cpf || '')}" root="2.16.840.1.113883.13.237"/>
      <patient>
        <name>${escapeXml(data.paciente.nome_social || data.paciente.nome)}</name>
        <administrativeGenderCode code="${mapSexo(data.paciente.sexo)}"/>
        ${data.paciente.data_nascimento ? `<birthTime value="${data.paciente.data_nascimento.replace(/-/g, '')}"/>` : ''}
      </patient>
    </patientRole>
  </recordTarget>

  <component>
    <structuredBody>`;

  // Allergies section
  if (data.paciente.alergias?.length) {
    xml += `
      <component>
        <section>
          <code code="48765-2" displayName="Allergies"/>
          <title>Alergias</title>
          <text>
            <list>
              ${data.paciente.alergias.map(a => `<item>${escapeXml(a)}</item>`).join('\n              ')}
            </list>
          </text>
        </section>
      </component>`;
  }

  // Encounters section
  data.prontuarios.forEach(p => {
    xml += `
      <component>
        <section>
          <code code="46240-8" displayName="Encounter"/>
          <title>Atendimento — ${escapeXml(p.data)}</title>
          <text>
            ${p.queixa_principal ? `<paragraph><caption>Queixa Principal</caption>${escapeXml(p.queixa_principal)}</paragraph>` : ''}
            ${p.historia_doenca_atual ? `<paragraph><caption>História da Doença Atual</caption>${escapeXml(p.historia_doenca_atual)}</paragraph>` : ''}
            ${p.historia_patologica_pregressa ? `<paragraph><caption>História Patológica Pregressa</caption>${escapeXml(p.historia_patologica_pregressa)}</paragraph>` : ''}
            ${p.historia_familiar ? `<paragraph><caption>História Familiar</caption>${escapeXml(p.historia_familiar)}</paragraph>` : ''}
            ${p.historia_social ? `<paragraph><caption>História Social</caption>${escapeXml(p.historia_social)}</paragraph>` : ''}
            ${p.revisao_sistemas ? `<paragraph><caption>Revisão de Sistemas</caption>${escapeXml(p.revisao_sistemas)}</paragraph>` : ''}
            ${p.exames_fisicos ? `<paragraph><caption>Exame Físico</caption>${escapeXml(p.exames_fisicos)}</paragraph>` : ''}
            ${p.alergias_relatadas ? `<paragraph><caption>Alergias relatadas</caption>${escapeXml(p.alergias_relatadas)}</paragraph>` : ''}
            ${p.medicamentos_em_uso ? `<paragraph><caption>Medicamentos em uso</caption>${escapeXml(p.medicamentos_em_uso)}</paragraph>` : ''}
            ${p.hipotese_diagnostica ? `<paragraph><caption>Hipótese Diagnóstica</caption>${escapeXml(p.hipotese_diagnostica)}</paragraph>` : ''}
            ${p.diagnostico_principal ? `<paragraph><caption>Diagnóstico</caption>${escapeXml(p.diagnostico_principal)}</paragraph>` : ''}
            ${p.conduta ? `<paragraph><caption>Conduta</caption>${escapeXml(p.conduta)}</paragraph>` : ''}
            ${p.medico_nome ? `<paragraph><caption>Médico</caption>${escapeXml(p.medico_nome)} — CRM: ${escapeXml(p.medico_crm || '')}</paragraph>` : ''}
          </text>
        </section>
      </component>`;
  });

  if (data.prescricoes?.length) {
    xml += `<component><section><code code="10160-0" displayName="History of Medication Use"/><title>Prescrições</title><text><list>${data.prescricoes.map(p => `<item>${escapeXml([p.medicamento, p.dosagem, p.posologia, p.duracao, p.quantidade, p.observacoes].filter(Boolean).join(' — '))}</item>`).join('')}</list></text></section></component>`;
  }

  if (data.exames?.length) {
    xml += `<component><section><code code="30954-2" displayName="Relevant diagnostic tests/laboratory data"/><title>Exames e resultados</title><text><list>${data.exames.map(exame => `<item>${escapeXml([exame.tipo, exame.data, exame.status, exame.resultado, exame.observacoes].filter(Boolean).join(' — '))}</item>`).join('')}</list></text></section></component>`;
  }

  if (data.adendos?.length) {
    xml += `<component><section><code code="55107-7" displayName="Addendum Document"/><title>Adendos e retificações</title><text><list>${data.adendos.map(adendo => `<item>${escapeXml([adendo.data, adendo.tipo, adendo.motivo, adendo.texto, `${adendo.medico_nome} — CRM ${adendo.crm}`].filter(Boolean).join(' — '))}</item>`).join('')}</list></text></section></component>`;
  }

  const arquivos = [
    ...(data.anexos || []).map(anexo => ({ nome: anexo.nome, tipo: anexo.tipo, conteudo: anexo.conteudoBase64 })),
    ...(data.exames || []).filter(exame => exame.conteudoBase64).map(exame => ({ nome: exame.nomeArquivo || exame.tipo, tipo: exame.tipoArquivo || 'application/octet-stream', conteudo: exame.conteudoBase64! })),
  ];
  if (arquivos.length) {
    xml += `<component><section><code code="55108-5" displayName="Clinical information attachment"/><title>Arquivos anexos</title><text><list>${arquivos.map(arquivo => `<item>${escapeXml(arquivo.nome)}</item>`).join('')}</list></text>${arquivos.map(arquivo => `<entry><observationMedia classCode="OBS" moodCode="EVN"><value mediaType="${escapeXml(arquivo.tipo)}" representation="B64">${arquivo.conteudo}</value></observationMedia></entry>`).join('')}</section></component>`;
  }

  xml += `
    </structuredBody>
  </component>
</EloLabClinicalExport>`;

  return xml;
}

/**
 * Download exported data as a file
 */
export function downloadClinicalExport(content: string, filename: string, type: 'json' | 'xml') {
  const mimeType = type === 'json' ? 'application/json' : 'application/xml';
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.${type}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
