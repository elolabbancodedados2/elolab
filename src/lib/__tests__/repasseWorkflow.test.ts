import { describe, expect, it } from 'vitest';
import { podeAprovarRepasse, podePagarRepasse, receitaOrigemQuitada } from '../repasseWorkflow';

describe('proteção do fluxo de repasses', () => {
  it('considera elegível somente uma receita ainda quitada', () => {
    expect(receitaOrigemQuitada('pago')).toBe(true);
    expect(receitaOrigemQuitada('parcial')).toBe(false);
    expect(receitaOrigemQuitada('pendente')).toBe(false);
    expect(receitaOrigemQuitada(null)).toBe(false);
  });

  it('só permite aprovar um repasse pendente ligado a uma receita quitada', () => {
    expect(podeAprovarRepasse('pendente', 'pago')).toBe(true);
    expect(podeAprovarRepasse('pendente', 'pendente')).toBe(false);
    expect(podeAprovarRepasse('aprovado', 'pago')).toBe(false);
  });

  it('só permite pagar um repasse aprovado ligado a uma receita quitada', () => {
    expect(podePagarRepasse('aprovado', 'pago')).toBe(true);
    expect(podePagarRepasse('aprovado', 'parcial')).toBe(false);
    expect(podePagarRepasse('pendente', 'pago')).toBe(false);
  });
});
