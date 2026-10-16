import { describe, expect, it } from 'vitest';
import { criticalAcknowledgementIsPending } from '../criticalResultAcknowledgement';

describe('ciência de resultado crítico', () => {
  it('não exige ciência para um resultado não crítico', () => {
    expect(criticalAcknowledgementIsPending({ critico: false, numero_versao: 2, confirmacoes: [] })).toBe(false);
  });

  it('mantém pendente quando não há confirmação da versão atual', () => {
    expect(criticalAcknowledgementIsPending({ critico: true, numero_versao: 3, confirmacoes: [] })).toBe(true);
  });

  it('considera confirmada somente a versão atual do resultado', () => {
    expect(criticalAcknowledgementIsPending({
      critico: true,
      numero_versao: 3,
      confirmacoes: [{ numero_versao: 2 }, { numero_versao: 3 }],
    })).toBe(false);
  });

  it('volta a exigir ciência após a versão do resultado mudar', () => {
    expect(criticalAcknowledgementIsPending({
      critico: true,
      numero_versao: 4,
      confirmacoes: [{ numero_versao: 3 }],
    })).toBe(true);
  });
});
