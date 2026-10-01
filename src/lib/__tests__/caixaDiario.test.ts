import { describe, expect, it } from 'vitest';
import { calcularSaldoGaveta, calcularTotaisCaixa, validarResultadoRpcCaixa } from '@/lib/caixaDiario';

describe('respostas das transições do caixa', () => {
  it.each(['aberto', 'fechado', 'reaberto'])('aceita o resultado %s', (code) => {
    expect(() => validarResultadoRpcCaixa({ code })).not.toThrow();
  });

  it('explica falta de permissão sem mostrar erro bruto do banco', () => {
    expect(() => validarResultadoRpcCaixa({ code: 'sem_permissao' }))
      .toThrow('Seu perfil não pode realizar esta operação no caixa.');
  });

  it('explica o motivo obrigatório para reabrir o caixa', () => {
    expect(() => validarResultadoRpcCaixa({ code: 'motivo_invalido' }))
      .toThrow('Explique por que o caixa precisa ser reaberto (mínimo 10 caracteres).');
  });

  it('fail closed se a RPC não confirmar um código conhecido', () => {
    expect(() => validarResultadoRpcCaixa(null)).toThrow('O servidor não confirmou');
    expect(() => validarResultadoRpcCaixa({ code: 'unknown' })).toThrow('Não foi possível atualizar o caixa');
  });
});

describe('totais do caixa pelos movimentos recebidos', () => {
  it('soma pagamentos parciais pela data de recebimento', () => {
    const totais = calcularTotaisCaixa(100, [
      { tipo: 'receita', valor: 35 },
      { tipo: 'receita', valor: 25 },
      { tipo: 'despesa', valor: 20 },
    ]);
    expect(totais).toEqual({ receita: 60, despesa: 20, sangria: 0, suprimento: 0, liquido: 40, final: 140 });
  });

  it('aplica estornos negativos sem inverter o tipo da cobrança', () => {
    const totais = calcularTotaisCaixa(50, [
      { tipo: 'receita', valor: 80 },
      { tipo: 'receita', valor: -30 },
      { tipo: 'sangria', valor: 10 },
      { tipo: 'suprimento', valor: 5 },
    ]);
    expect(totais.final).toBe(95);
    expect(totais.receita).toBe(50);
  });

  it('trata valores inválidos como zero sem propagar NaN', () => {
    expect(calcularTotaisCaixa(10, [{ tipo: 'receita', valor: Number.NaN }]).final).toBe(10);
  });
});

describe('saldo esperado em dinheiro', () => {
  it('compara o contado somente com dinheiro físico, sem Pix ou cartão', () => {
    expect(calcularSaldoGaveta(40, [
      { tipo: 'receita', valor: 25, forma_pagamento: 'dinheiro' },
      { tipo: 'receita', valor: 100, forma_pagamento: 'pix' },
      { tipo: 'despesa', valor: 5, forma_pagamento: 'dinheiro' },
      { tipo: 'sangria', valor: 10, forma_pagamento: 'dinheiro' },
      { tipo: 'suprimento', valor: 3, forma_pagamento: 'dinheiro' },
    ])).toBe(53);
  });

  it('subtrai estorno de receita em dinheiro da gaveta', () => {
    expect(calcularSaldoGaveta(20, [
      { tipo: 'receita', valor: 50, forma_pagamento: 'dinheiro' },
      { tipo: 'receita', valor: -12, forma_pagamento: 'dinheiro' },
    ])).toBe(58);
  });
});
