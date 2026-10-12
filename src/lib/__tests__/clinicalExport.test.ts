import { describe, expect, it } from 'vitest';
import { exportToFHIR, exportToXML } from '@/lib/clinicalExport';

const data = {
  paciente: { id: 'patient-1', nome: 'Ana Souza' },
  prontuarios: [
    { id: 'visit-1', data: '2026-10-10T10:00:00Z', queixa_principal: 'Dor de cabeça', assinado: false },
  ],
};

describe('exportação FHIR R4 do prontuário', () => {
  it('gera um documento cujo primeiro recurso é uma Composition', () => {
    const bundle = JSON.parse(exportToFHIR(data));

    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('document');
    expect(bundle.identifier?.value).toBeTruthy();
    expect(bundle.entry[0].resource.resourceType).toBe('Composition');
    expect(bundle.entry[0].resource.status).toBe('preliminary');
    expect(bundle.entry[0].resource.author).toHaveLength(1);
    expect(bundle.entry.every((entry: any) => /^urn:uuid:[0-9a-f-]{36}$/i.test(entry.fullUrl))).toBe(true);
  });

  it('mantém encontros sem assinatura em andamento', () => {
    const bundle = JSON.parse(exportToFHIR(data));
    const encounter = bundle.entry.find((item: any) => item.resource.resourceType === 'Encounter').resource;

    expect(encounter.status).toBe('in-progress');
  });

  it('exporta HDA na narrativa da Composition com escape XHTML', () => {
    const bundle = JSON.parse(exportToFHIR({
      ...data,
      prontuarios: [{ ...data.prontuarios[0], historia_doenca_atual: '<dor & febre>' }],
    }));
    const composition = bundle.entry[0].resource;
    const narrativa = composition.section.map((section: any) => section.text?.div || '').join('');

    expect(narrativa).toContain('&lt;dor &amp; febre&gt;');
    expect(narrativa).not.toContain('<dor & febre>');
  });

  it('vincula a prescrição exportada ao atendimento de origem', () => {
    const bundle = JSON.parse(exportToFHIR({
      ...data,
      prescricoes: [{ prontuario_id: 'visit-1', medicamento: 'Exemplo', dosagem: '500 mg', posologia: '8/8h', duracao: '5 dias' }],
    }));
    const encounter = bundle.entry.find((item: any) => item.resource.resourceType === 'Encounter');
    const medication = bundle.entry.find((item: any) => item.resource.resourceType === 'MedicationRequest');
    const prescriptionSection = bundle.entry[0].resource.section.find((section: any) => section.title === 'Prescricoes');

    expect(medication.resource.encounter.reference).toBe(encounter.fullUrl);
    expect(medication.resource.dosageInstruction[0].text).toContain('5 dias');
    expect(prescriptionSection.entry[0].reference).toBe(medication.fullUrl);
  });

  it('exporta sinais vitais ampliados com códigos LOINC e unidades UCUM', () => {
    const bundle = JSON.parse(exportToFHIR({
      ...data,
      prontuarios: [{
        ...data.prontuarios[0],
        sinais_vitais: {
          frequencia_respiratoria: '18', glicemia: '98', circunferencia_abdominal: '82',
          circunferencia_craniana: '54', glasgow: '15', dor: '2', imc: '22.5',
        },
      }],
    }));
    const observations = bundle.entry.filter((item: any) => item.resource.resourceType === 'Observation').map((item: any) => item.resource);
    const observationByCode = (code: string) => observations.find((item: any) => item.code.coding[0].code === code);

    expect(observationByCode('9279-1').valueQuantity).toMatchObject({ value: 18, unit: '/min', system: 'http://unitsofmeasure.org', code: '/min' });
    expect(observationByCode('2345-7').valueQuantity).toMatchObject({ value: 98, unit: 'mg/dL', system: 'http://unitsofmeasure.org', code: 'mg/dL' });
    expect(observationByCode('8280-0').valueQuantity).toMatchObject({ value: 82, unit: 'cm' });
    expect(observationByCode('9843-4').valueQuantity).toMatchObject({ value: 54, unit: 'cm' });
    expect(observationByCode('9269-2').valueQuantity.value).toBe(15);
    expect(observationByCode('72514-3').valueQuantity.value).toBe(2);
    expect(observationByCode('39156-5').valueQuantity).toMatchObject({ value: 22.5, unit: 'kg/m2' });
  });

  it('exporta CID-10 codificado e preserva hipótese como provisória', () => {
    const bundle = JSON.parse(exportToFHIR({
      ...data,
      prontuarios: [{
        ...data.prontuarios[0],
        hipotese_diagnostica: 'J06.9 - Infecção aguda das vias aéreas superiores',
        diagnostico_principal: 'I10 - Hipertensão essencial (primária)',
      }],
    }));
    const conditions = bundle.entry.filter((item: any) => item.resource.resourceType === 'Condition').map((item: any) => item.resource);
    const diagnosisSection = bundle.entry[0].resource.section.find((section: any) => section.title === 'Diagnósticos');

    expect(conditions).toHaveLength(2);
    expect(diagnosisSection.entry).toHaveLength(2);
    expect(conditions.find((item: any) => item.code.coding[0].code === 'J06.9').verificationStatus.coding[0].code).toBe('provisional');
    expect(conditions.find((item: any) => item.code.coding[0].code === 'I10').verificationStatus.coding[0].code).toBe('confirmed');
  });

  it('usa o profissional que assinou, não apenas o médico relacionado ao atendimento', () => {
    const bundle = JSON.parse(exportToFHIR({
      ...data,
      prontuarios: [{ ...data.prontuarios[0], assinado: true, medico_nome: 'Profissional atual', assinado_por: 'Assinante registrado' }],
    }));

    expect(bundle.entry[0].resource.author).toEqual([{ display: 'Assinante registrado' }]);
  });

  it('não atribui assinatura legada ao médico vinculado quando o assinante não foi registrado', () => {
    const bundle = JSON.parse(exportToFHIR({
      ...data,
      prontuarios: [{ ...data.prontuarios[0], assinado: true, medico_nome: 'Médico vinculado' }],
    }));

    expect(bundle.entry[0].resource.author).toEqual([{ display: 'Assinante não identificado' }]);
  });
  it('includes exams, embedded attachments, and addenda in the FHIR bundle', () => {
    const bundle = JSON.parse(exportToFHIR({
      ...data,
      exames: [{ id: 'exam-1', tipo: 'Hemograma', data: '2026-10-10', status: 'laudo_disponivel', resultado: 'Dentro do esperado' }],
      anexos: [{ id: 'file-1', nome: 'laudo.pdf', tipo: 'application/pdf', categoria: 'laudo', data: '2026-10-10', conteudoBase64: 'JVBERi0x' }],
      adendos: [{ id: 'addendum-1', tipo: 'complemento', motivo: 'Informação posterior', texto: 'Paciente retornou.', medico_nome: 'Dra. Ana', crm: '123', data: '2026-10-11' }],
    }));
    const resources = bundle.entry.map((item: any) => item.resource);
    const diagnosticReport = resources.find((item: any) => item.resourceType === 'DiagnosticReport');
    const documentReference = resources.find((item: any) => item.resourceType === 'DocumentReference');
    const composition = resources.find((item: any) => item.resourceType === 'Composition');

    expect(diagnosticReport.conclusion).toBe('Dentro do esperado');
    expect(documentReference.content[0].attachment.data).toBe('JVBERi0x');
    expect(composition.section.find((section: any) => section.title.startsWith('complemento')).text.div).toContain('Paciente retornou.');
  });

  it('includes exam results, addenda, and embedded files in the XML document', () => {
    const xml = exportToXML({
      ...data,
      exames: [{ id: 'exam-1', tipo: 'Hemograma', data: '2026-10-10', resultado: 'Dentro do esperado' }],
      anexos: [{ id: 'file-1', nome: 'laudo.pdf', tipo: 'application/pdf', categoria: 'laudo', conteudoBase64: 'JVBERi0x' }],
      adendos: [{ id: 'addendum-1', tipo: 'complemento', motivo: 'Informação posterior', texto: 'Paciente retornou.', medico_nome: 'Dra. Ana', crm: '123', data: '2026-10-11' }],
    });

    expect(xml).toContain('Dentro do esperado');
    expect(xml).toContain('Paciente retornou.');
    expect(xml).toContain('JVBERi0x');
    expect(xml).toContain('<EloLabClinicalExport version="1">');
    expect(xml).not.toContain('<ClinicalDocument');
  });
});
