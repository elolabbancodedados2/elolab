import { describe, expect, it } from 'vitest';
import { isPatientTimelineSummaryNavigation } from '../patientTimelineSummaryNavigation';

const history = { pathname: '/pacientes/patient-1', search: '?tab=historico' };

describe('navegação do resumo clínico do histórico', () => {
  it('permite abrir e fechar apenas a página de resumo no mesmo paciente', () => {
    const summary = { ...history, search: '?tab=historico&timeline=summary' };
    expect(isPatientTimelineSummaryNavigation(history, summary)).toBe(true);
    expect(isPatientTimelineSummaryNavigation(summary, history)).toBe(true);
  });

  it('não permite alterar paciente, rota ou outros parâmetros junto do resumo', () => {
    expect(isPatientTimelineSummaryNavigation(history, { ...history, pathname: '/pacientes/patient-2' })).toBe(false);
    expect(isPatientTimelineSummaryNavigation(history, { ...history, search: '?tab=historico&timeline=other' })).toBe(false);
    expect(isPatientTimelineSummaryNavigation(history, { ...history, search: '?timeline=summary&tab=consultas' })).toBe(false);
  });
});
