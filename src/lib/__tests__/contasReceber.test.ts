import { describe, expect, it } from 'vitest';
import { valorRecebidoDaConta } from '@/lib/contasReceber';

describe('valor recebido por conta', () => {
  it('usa pagamentos individuais quando a leitura está completa', () => {
    expect(valorRecebidoDaConta(
      { valor: 200, valor_pago: 80 }, true, true, 75,
    )).toBe(75);
  });

  it('usa o total consolidado quando a lista de pagamentos atingiu o limite', () => {
    expect(valorRecebidoDaConta(
      { valor: 200, valor_pago: 125 }, false, true, 80,
    )).toBe(125);
  });

  it('mantém compatibilidade com contas antigas sem pagamentos individuais', () => {
    expect(valorRecebidoDaConta(
      { valor: 200, valor_pago: null }, true, false, 0,
    )).toBe(200);
  });
});
