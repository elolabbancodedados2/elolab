import { describe, it, expect } from 'vitest';
import { valorRealizado } from '@/lib/lancamentos';

/**
 * Regressão do bug em que a baixa de Contas a Receber calculava o valor final
 * (valor - desconto + acréscimo), mostrava na tela e não gravava: `valor`
 * continuava com o valor cobrado e o desconto virava texto em observações.
 * Receita, DRE e fluxo de caixa ficavam inflados pelo total de descontos.
 */
describe('valorRealizado', () => {
  it('usa valor_pago quando a baixa foi registrada', () => {
    expect(valorRealizado({ valor: 200, valor_pago: 180 })).toBe(180);
  });

  it('cai no valor cobrado em lançamento antigo (valor_pago nulo)', () => {
    // Garante que nenhum número histórico muda com a introdução da coluna
    expect(valorRealizado({ valor: 200, valor_pago: null })).toBe(200);
    expect(valorRealizado({ valor: 200 })).toBe(200);
    expect(valorRealizado({ valor: 200, valor_pago: undefined })).toBe(200);
  });

  it('aceita valores em string, como o Postgres numeric devolve', () => {
    expect(valorRealizado({ valor: '200.00', valor_pago: '180.50' })).toBe(180.5);
    expect(valorRealizado({ valor: '200.00' })).toBe(200);
  });

  it('reconhece acréscimo, não só desconto', () => {
    expect(valorRealizado({ valor: 200, valor_pago: 215.75 })).toBe(215.75);
  });

  it('trata baixa com valor zero como zero, não como ausência', () => {
    // 0 é um valor legítimo (ex.: cortesia) e não pode virar o valor cobrado
    expect(valorRealizado({ valor: 200, valor_pago: 0 })).toBe(0);
  });

  it('ignora string vazia e valor não numérico', () => {
    expect(valorRealizado({ valor: 200, valor_pago: '' })).toBe(200);
    expect(valorRealizado({ valor: 200, valor_pago: 'abc' })).toBe(200);
  });

  it('devolve 0 quando não há valor algum', () => {
    expect(valorRealizado({ valor: '' as any })).toBe(0);
  });

  it('soma de uma lista reflete o recebido, não o cobrado', () => {
    const lancamentos = [
      { valor: 200, valor_pago: 180 },  // R$ 20 de desconto
      { valor: 150, valor_pago: 150 },
      { valor: 100, valor_pago: null }, // antigo, sem baixa registrada
    ];
    const total = lancamentos.reduce((a, l) => a + valorRealizado(l), 0);
    expect(total).toBe(430); // e não 450, que era o comportamento antigo
  });
});
