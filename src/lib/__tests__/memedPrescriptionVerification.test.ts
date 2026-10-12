import { describe, expect, it } from 'vitest';
import { extrairIdentificadoresCallbackMemed, verificarPrescricaoMemedOficial } from '../../../supabase/functions/_shared/memedPrescriptionVerification';

const expected = {
  prescriptionId: '1234',
  prescriptionUuid: 'uuid-1',
  patientExternalId: 'patient-1',
  prescriberCpf: '123.456.789-00',
  prescriberCrm: '9999',
  prescriberUf: 'SP',
};

const officialRecord = {
  data: { attributes: { prescricao: {
    id: 1234,
    prescriptionUuid: 'uuid-1',
    paciente: { external_id: 'patient-1' },
    medicos: { cpf: '12345678900', crm: '9999', uf: 'SP' },
    medicamentos: [{ nome: 'Medicamento validado no servidor Memed' }],
  } } },
};

describe('verificacao server-to-server de prescricoes Memed', () => {
  it('extrai apenas os identificadores do callback do navegador', () => {
    expect(extrairIdentificadoresCallbackMemed({ prescricao: { id: 1234, prescriptionUuid: 'uuid-1' }, medicamentos: [{ nome: 'falso' }] }))
      .toEqual({ id: '1234', uuid: 'uuid-1' });
  });

  it('aceita o registro retornado pela API Memed quando paciente, prescritor e IDs correspondem', () => {
    expect(verificarPrescricaoMemedOficial(officialRecord, expected)).toEqual(officialRecord.data.attributes);
  });

  it.each([
    ['paciente', { ...officialRecord.data.attributes, prescricao: { ...officialRecord.data.attributes.prescricao, paciente: { external_id: 'outro' } } }],
    ['prescritor', { ...officialRecord.data.attributes, prescricao: { ...officialRecord.data.attributes.prescricao, medicos: { cpf: '000', crm: '9999', uf: 'SP' } } }],
    ['UUID', { ...officialRecord.data.attributes, prescricao: { ...officialRecord.data.attributes.prescricao, prescriptionUuid: 'outro' } }],
  ])('rejeita divergencia de %s no registro oficial', (_label, record) => {
    expect(verificarPrescricaoMemedOficial(record, expected)).toBeNull();
  });

  it('rejeita callback sem identificador confiavel', () => {
    expect(extrairIdentificadoresCallbackMemed({ medicamentos: [{ nome: 'falso' }] })).toBeNull();
  });
});
