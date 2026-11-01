import { describe, expect, it } from 'vitest';
import { dataHoraSP, horaSP, rotuloForma, textoSeguroCsv } from '../caixaFormatacao';

describe('caixaFormatacao', () => {
  it('mostra a hora no fuso de São Paulo, independente do fuso do navegador', () => {
    expect(horaSP('2026-11-01T03:30:00Z')).toBe('00:30');
    expect(dataHoraSP('2026-11-01T02:05:00Z')).toBe('31/10/2026, 23:05');
    expect(horaSP(null)).toBe('—');
    expect(horaSP('invalido')).toBe('—');
  });

  it('traduz a forma de pagamento', () => {
    expect(rotuloForma('cartao_credito')).toBe('Crédito');
    expect(rotuloForma('transferencia')).toBe('Transferência');
    expect(rotuloForma('outra_forma')).toBe('outra forma');
  });

  it('neutraliza textos que o Excel leria como fórmula', () => {
    expect(textoSeguroCsv('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(textoSeguroCsv('-10')).toBe(`'-10`);
    expect(textoSeguroCsv('Consulta')).toBe('Consulta');
    expect(textoSeguroCsv(null)).toBe('');
  });
});

describe('movimentoCorrespondeBusca', () => {
  it('busca por paciente, forma e valor, sem acento', async () => {
    const { movimentoCorrespondeBusca } = await import('@/lib/caixaFormatacao');
    const mov = { descricao: 'Consulta', tipo: 'receita', forma_pagamento: 'pix', valor: 150, paciente_nome: 'João Simões' };
    expect(movimentoCorrespondeBusca(mov, 'joao')).toBe(true);
    expect(movimentoCorrespondeBusca(mov, 'simoes pix')).toBe(true);
    expect(movimentoCorrespondeBusca(mov, '150,00')).toBe(true);
    expect(movimentoCorrespondeBusca(mov, 'dinheiro')).toBe(false);
    expect(movimentoCorrespondeBusca(mov, '   ')).toBe(true);
  });
});
