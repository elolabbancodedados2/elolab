import { describe, expect, it } from 'vitest';
import { podeExportarContasCompletas, valorRecebidoDaConta } from '@/lib/contasReceber';

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

describe('exportação de contas a receber', () => {
  it('permite exportar quando a lista e o livro de pagamentos estão completos', () => {
    expect(podeExportarContasCompletas(false, false)).toBe(true);
  });

  it('bloqueia exportação quando qualquer conjunto atingiu o limite', () => {
    expect(podeExportarContasCompletas(true, false)).toBe(false);
    expect(podeExportarContasCompletas(false, true)).toBe(false);
    expect(podeExportarContasCompletas(true, true)).toBe(false);
  });
});
