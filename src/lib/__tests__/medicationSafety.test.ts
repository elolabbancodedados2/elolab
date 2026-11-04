import { describe, expect, it } from 'vitest';
import { evaluateMedicationSafety } from '../clinicalAlerts';
import { prescriptionSafetyRecord } from '../allergyOverride';

describe('motor compartilhado de prontuário e prescrições', () => {
  it('detecta varfarina + AAS e mantém contraindicação absoluta na gestação', () => {
    expect(evaluateMedicationSafety(['Varfarina 5mg', 'AAS 100mg'], {}).some(a => a.id.startsWith('interaction-'))).toBe(true);
    expect(evaluateMedicationSafety(['Isotretinoína 20mg'], { gestante: true })).toEqual(expect.arrayContaining([expect.objectContaining({ id: expect.stringContaining('pregnancy-absolute'), canIgnore: false })]));
  });
  it('preserva alergias, idade e comorbidades e não colapsa medicamentos distintos', () => {
    const alerts = evaluateMedicationSafety(['Amoxicilina', 'Ibuprofeno'], { alergias: ['penicilina'], idade: 0, comorbidades: ['Úlcera gástrica'] });
    expect(alerts.some(a => a.id.startsWith('allergy-'))).toBe(true);
    expect(alerts.some(a => a.id.startsWith('age-'))).toBe(true);
    expect(alerts.some(a => a.id.startsWith('comorbidity-'))).toBe(true);
  });
  it('serializa a justificativa e o mesmo snapshot para os dois fluxos', () => {
    const alerts = evaluateMedicationSafety(['Varfarina', 'AAS'], {});
    const reason = ' Risco avaliado, com monitoramento clínico programado. ';
    const record = prescriptionSafetyRecord(alerts, reason);
    expect(record.justificativa_alerta).toBe(reason.trim());
    expect(record.alertas_seguranca).toEqual(expect.arrayContaining([expect.objectContaining({ id: expect.stringContaining('interaction-') })]));
    expect(prescriptionSafetyRecord([], reason).justificativa_alerta).toBeNull();
  });
});
