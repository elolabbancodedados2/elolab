/**
 * Regras de leitura de valores financeiros.
 *
 * A tabela `lancamentos` guarda dois valores distintos e é importante não
 * confundi-los nos relatórios:
 *
 *   valor       → o que foi COBRADO (o lançamento original)
 *   valor_pago  → o que de fato ENTROU ou SAIU do caixa, já com desconto e
 *                 acréscimo aplicados no momento da baixa
 *
 * Antes da migration 20260728010000 a coluna `valor_pago` não existia: a tela
 * de baixa calculava o valor final, mostrava na tela e gravava apenas o
 * status, jogando o desconto como texto livre em `observacoes`. Resultado: uma
 * conta de R$ 200 recebida com R$ 20 de desconto seguia somando R$ 200 na
 * receita, e DRE, fluxo de caixa e relatórios ficavam inflados pelo total de
 * descontos concedidos.
 */

export interface LancamentoValores {
  valor: number | string;
  valor_pago?: number | string | null;
}

/**
 * Valor realizado de um lançamento — use em tudo que representa dinheiro que
 * efetivamente circulou (recebido, pago, DRE, fluxo de caixa).
 *
 * Para "a receber" e "a pagar" continue usando `valor`: ali o que importa é o
 * que ainda está em aberto, não o que foi quitado.
 *
 * Lançamentos antigos têm `valor_pago` nulo e caem no `valor`, então nenhum
 * número histórico muda com esta função.
 */
export function valorRealizado(lancamento: LancamentoValores): number {
  const pago = lancamento.valor_pago;
  if (pago !== null && pago !== undefined && pago !== '') {
    const n = Number(pago);
    if (Number.isFinite(n)) return n;
  }
  return Number(lancamento.valor) || 0;
}
