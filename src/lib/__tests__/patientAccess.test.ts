import { describe, expect, it } from 'vitest';
import * as patientBasicData from '@/lib/patientBasicData';

describe('acesso ao extrato financeiro da ficha do paciente', () => {
  it('reserva a aba para administracao e recepcao', () => {
    expect(patientBasicData.canViewPatientFinancialTab(['admin'])).toBe(true);
    expect(patientBasicData.canViewPatientFinancialTab(['recepcao'])).toBe(true);
    expect(patientBasicData.canViewPatientFinancialTab(['enfermagem'])).toBe(false);
    expect(patientBasicData.canViewPatientFinancialTab(['medico'])).toBe(false);
    expect(patientBasicData.canViewPatientFinancialTab(['financeiro'])).toBe(false);
  });
});

describe('acesso à timeline clínica do paciente', () => {
  it('reserva o histórico clínico para administracao e medico', () => {
    expect(patientBasicData.canViewPatientClinicalTimeline(['admin'])).toBe(true);
    expect(patientBasicData.canViewPatientClinicalTimeline(['medico'])).toBe(true);
    expect(patientBasicData.canViewPatientClinicalTimeline(['recepcao'])).toBe(false);
    expect(patientBasicData.canViewPatientClinicalTimeline(['enfermagem'])).toBe(false);
    expect(patientBasicData.canViewPatientClinicalTimeline(['financeiro'])).toBe(false);
  });
});
