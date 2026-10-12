import { describe, expect, it } from 'vitest';
import { grupoMovimentoCaixa, totaisMovimentoCaixa } from '@/lib/fluxoCaixa';

describe('movimentos do fluxo de caixa', () => {
  it('classifica recebimentos, despesas, suprimentos e sangrias', () => {
    expect(grupoMovimentoCaixa('receita')).toBe('receitas');
    expect(grupoMovimentoCaixa('despesa')).toBe('despesas');
    expect(grupoMovimentoCaixa('suprimento')).toBe('suprimentos');
    expect(grupoMovimentoCaixa('sangria')).toBe('sangrias');
    expect(grupoMovimentoCaixa('cancelado')).toBeNull();
  });

  it('inclui suprimentos nas entradas e sangrias nas saídas e no saldo', () => {
    expect(totaisMovimentoCaixa([
      { tipo: 'receita', valor: 1000 },
      { tipo: 'suprimento', valor: 100 },
      { tipo: 'despesa', valor: 400 },
      { tipo: 'sangria', valor: 50 },
      { tipo: 'receita', valor: -200 },
    ])).toEqual({
      receitas: 800,
      despesas: 400,
      suprimentos: 100,
      sangrias: 50,
      entradas: 900,
      saidas: 450,
      saldo: 450,
    });
  });
});
