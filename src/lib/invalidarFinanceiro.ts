import type { QueryClient } from '@tanstack/react-query';

/**
 * Raízes das consultas que mostram dinheiro: contas, pagamentos, caixa, painel,
 * fluxo de caixa, DRE, cobrança e as páginas de detalhe.
 *
 * Cada tela invalidava só uma parte delas. Depois de pagar uma despesa, o
 * painel e a DRE continuavam com o valor antigo até o próximo recarregamento.
 */
export const CHAVES_FINANCEIRO = [
  'lancamentos',
  'caixa-diario',
  'pagamentos-do-dia',
  'pagamentos-contas-receber',
  'pagamentos-contas-pagar',
  'financeiro-pagamentos',
  'pagamentos-fluxo-caixa',
  'dre-lancamentos',
  'dre-pagamentos',
  'dre-ano',
  'inadimplentes',
  'extrato-paciente',
  'receivable-detail',
  'receivable-detail-payments',
  'payable-detail',
  'payable-detail-payments',
  'payable-payment-record',
  'lancamento-estorno',
  'pagamentos-estornaveis',
  'historico-lancamento',
  'recorrencias-financeiras',
] as const;

/** Invalida todas as consultas financeiras de uma vez. */
export function invalidarFinanceiro(queryClient: Pick<QueryClient, 'invalidateQueries'>): Promise<unknown> {
  return Promise.all(CHAVES_FINANCEIRO.map(chave => queryClient.invalidateQueries({ queryKey: [chave] })));
}
