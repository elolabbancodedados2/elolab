import { describe, expect, it } from 'vitest';
import {
  linkEmailPedido, pedidoAtrasado, previsaoEntrega, textoPedidoCompra, textoVariacao, variacaoPercentual,
} from '@/lib/pedidoCompraDocumento';
import { calcularEstouros } from '@/lib/compras';

const pedido = {
  id: 'abcdef12-3456', total: 229, created_at: '2026-10-31T02:00:00Z', fornecedores: { nome: 'Beta' },
  pedido_compra_itens: [{ descricao: 'Luva', quantidade: 10, preco_unitario: 22.9 }],
};

describe('pedido de compra: documento', () => {
  it('prevê a entrega pelo dia da emissão no fuso da clínica', () => {
    // 02:00 UTC de 31/10 ainda é 30/10 em São Paulo.
    expect(previsaoEntrega(pedido.created_at, 5)).toBe('2026-11-04');
    expect(previsaoEntrega(pedido.created_at, null)).toBeNull();
    expect(pedidoAtrasado('2026-11-04', 'emitido', '2026-11-05')).toBe(true);
    expect(pedidoAtrasado('2026-11-04', 'recebido', '2026-11-05')).toBe(false);
  });

  it('monta o texto e o link de e-mail do pedido', () => {
    const texto = textoPedidoCompra(pedido, { previsao: '2026-11-04' });
    expect(texto).toContain('Pedido de compra nº ABCDEF12');
    expect(texto).toContain('Fornecedor: Beta');
    expect(texto).toContain('Entrega prevista: 04/11/2026');
    expect(texto).toMatch(/10 × Luva — R\$\s22,90/);
    expect(linkEmailPedido('compras@beta.com', pedido, texto)).toMatch(/^mailto:compras%40beta\.com\?subject=Pedido/);
  });

  it('calcula a variação sobre o último preço pago', () => {
    expect(variacaoPercentual(25.5, 20)).toBe(27.5);
    expect(variacaoPercentual(null, 20)).toBeNull();
    expect(textoVariacao(-10)).toBe('-10% sobre a última compra');
    expect(textoVariacao(0)).toBe('mesmo preço da última compra');
  });

  it('aponta os itens que passam do estoque máximo no recebimento', () => {
    expect(calcularEstouros(
      [{ estoque_id: 'a', quantidade: 10 }, { estoque_id: 'b', quantidade: 1 }],
      [{ id: 'a', nome: 'Luva', quantidade: 45, quantidade_maxima: 50 }, { id: 'b', nome: 'Gaze', quantidade: 1, quantidade_maxima: null }],
    )).toEqual([{ id: 'a', nome: 'Luva', saldo: 45, entrada: 10, maximo: 50, novoMaximo: 55 }]);
  });
});
