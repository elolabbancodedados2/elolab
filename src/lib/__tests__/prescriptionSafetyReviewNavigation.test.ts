import { describe, expect, it } from 'vitest';
import { isPrescriptionSafetyReviewNavigation } from '../prescriptionSafetyReviewNavigation';

const form = { pathname: '/documentos-clinicos/nova-prescricao', search: '?paciente=123' };

describe('navegação da revisão de segurança da prescrição', () => {
  it('permite abrir e fechar apenas a etapa de revisão sem perder o paciente', () => {
    const review = { ...form, search: '?paciente=123&tela=alertas-seguranca' };
    expect(isPrescriptionSafetyReviewNavigation(form, review)).toBe(true);
    expect(isPrescriptionSafetyReviewNavigation(review, form)).toBe(true);
  });

  it('não permite alterar rota, paciente ou outros parâmetros junto da etapa', () => {
    expect(isPrescriptionSafetyReviewNavigation(form, { ...form, pathname: '/documentos-clinicos' })).toBe(false);
    expect(isPrescriptionSafetyReviewNavigation(form, { ...form, search: '?paciente=456&tela=alertas-seguranca' })).toBe(false);
    expect(isPrescriptionSafetyReviewNavigation(form, { ...form, search: '?tela=outro-passo' })).toBe(false);
  });
});
