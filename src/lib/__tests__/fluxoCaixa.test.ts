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

  it('trata suprimentos e sangrias como transferência, fora do saldo de resultado', () => {
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
      entradas: 800,
      saidas: 400,
      saldo: 400,
      transferenciasLiquidas: 50,
    });
  });

  it('dá o mesmo saldo que receita menos despesa usado no Financeiro', () => {
    const movimentos = [
      { tipo: 'receita', valor: 300 },
      { tipo: 'despesa', valor: 120 },
      { tipo: 'sangria', valor: 500 },
    ];
    const receitaMenosDespesa = 300 - 120;
    expect(totaisMovimentoCaixa(movimentos).saldo).toBe(receitaMenosDespesa);
    expect(totaisMovimentoCaixa(movimentos).transferenciasLiquidas).toBe(-500);
  });
});
