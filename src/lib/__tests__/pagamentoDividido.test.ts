import { describe, it, expect } from 'vitest';
import { montarPagamentos, somaDasExtras } from '@/lib/pagamentoDividido';

/**
 * Aritmética de dinheiro no caminho do caixa. Um centavo errado aqui aparece
 * como divergência no fechamento do dia, e a operadora reconta a gaveta
 * procurando um erro que está no código.
 */
describe('montarPagamentos', () => {
  it('sem divisão, a forma principal leva tudo', () => {
    expect(montarPagamentos('pix', [], 500)).toEqual([
      { forma_pagamento: 'pix', valor: 500 },
    ]);
  });

  /** O caso do enunciado: consulta de R$ 500, R$ 200 no Pix e R$ 300 no cartão. */
  it('a forma principal absorve o restante', () => {
    const r = montarPagamentos('credito', [{ forma: 'pix', valor: 200 }], 500);
    expect(r).toEqual([
      { forma_pagamento: 'credito', valor: 300 },
      { forma_pagamento: 'pix', valor: 200 },
    ]);
    expect(r.reduce((s, p) => s + Math.round(p.valor * 100), 0)).toBe(50000);
  });

  it('soma exatamente o devido com três formas', () => {
    const r = montarPagamentos('dinheiro', [
      { forma: 'pix', valor: 150.5 },
      { forma: 'debito', valor: 99.9 },
    ], 400);
    expect(r.reduce((s, p) => s + Math.round(p.valor * 100), 0)).toBe(40000);
    expect(r[0]).toEqual({ forma_pagamento: 'dinheiro', valor: 149.6 });
  });

  /**
   * 0.1 + 0.2 !== 0.3 em ponto flutuante. Se o restante fosse calculado por
   * subtração direta, sobrariam frações de centavo que a RPC recusaria por
   * exceder o saldo.
   */
  it('não deixa resíduo de ponto flutuante no restante', () => {
    const r = montarPagamentos('pix', [
      { forma: 'dinheiro', valor: 10.1 },
      { forma: 'debito', valor: 20.2 },
    ], 60.6);

    // 10.1 + 20.2 = 30.299999999999997 em ponto flutuante. Se o restante fosse
    // calculado por subtração direta, a primeira forma levaria 30.300000000004
    // e a RPC recusaria por exceder o saldo em fração de centavo.
    expect(r[0].valor).toBe(30.3);

    // A conferência é em CENTAVOS porque é assim que o Postgres compara: lá a
    // soma é `numeric`, exata. Somar em JavaScript aqui reintroduziria o
    // resíduo que a função acabou de eliminar — o defeito seria do teste.
    const somaEmCentavos = r.reduce((s, p) => s + Math.round(p.valor * 100), 0);
    expect(somaEmCentavos).toBe(6060);
  });

  it('extras cobrindo tudo dispensam a forma principal', () => {
    const r = montarPagamentos('pix', [
      { forma: 'dinheiro', valor: 200 },
      { forma: 'credito', valor: 300 },
    ], 500);
    expect(r).toHaveLength(2);
    expect(r.some(p => p.forma_pagamento === 'pix')).toBe(false);
  });

  it('ignora linha em branco que o operador deixou pela metade', () => {
    const r = montarPagamentos('pix', [
      { forma: '', valor: 0 },
      { forma: 'dinheiro', valor: 100 },
    ], 300);
    expect(r).toEqual([
      { forma_pagamento: 'pix', valor: 200 },
      { forma_pagamento: 'dinheiro', valor: 100 },
    ]);
  });

  it('nunca devolve valor negativo quando as extras passam do devido', () => {
    // A tela barra antes, mas se passasse a forma principal não pode entrar
    // negativa — seria recusada pelo CHECK `valor > 0` da tabela.
    const r = montarPagamentos('pix', [{ forma: 'dinheiro', valor: 600 }], 500);
    expect(r.every(p => p.valor > 0)).toBe(true);
  });
});

describe('somaDasExtras', () => {
  it('soma em centavos, sem resíduo', () => {
    expect(somaDasExtras([{ forma: 'pix', valor: 10.1 }, { forma: 'debito', valor: 20.2 }])).toBe(30.3);
  });

  it('lista vazia soma zero', () => {
    expect(somaDasExtras([])).toBe(0);
  });
});
