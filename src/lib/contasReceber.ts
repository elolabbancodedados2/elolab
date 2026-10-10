import { valorRealizado, type LancamentoValores } from '@/lib/lancamentos';

/**
 * Usa o livro de pagamentos detalhado quando a leitura está completa.
 * Se a tela atingiu o teto de paginação, usa `valor_pago` consolidado no
 * lançamento em vez de somar uma lista parcial e exibir saldo maior que o real.
 */
export function valorRecebidoDaConta(
  conta: LancamentoValores,
  pagamentosCompletos: boolean,
  temLinhasDePagamento: boolean,
  totalPagamentosAtivos: number,
): number {
  if (!pagamentosCompletos || !temLinhasDePagamento) return valorRealizado(conta);
  return Number.isFinite(totalPagamentosAtivos) ? totalPagamentosAtivos : 0;
}
