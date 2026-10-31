export type GrupoMovimentoCaixa = 'receitas' | 'despesas' | 'suprimentos' | 'sangrias';

export function grupoMovimentoCaixa(tipo: string): GrupoMovimentoCaixa | null {
  switch (tipo) {
    case 'receita': return 'receitas';
    case 'despesa': return 'despesas';
    case 'suprimento': return 'suprimentos';
    case 'sangria': return 'sangrias';
    default: return null;
  }
}

/**
 * Totais de resultado do fluxo de caixa.
 *
 * Sangria e suprimento são transferências internas (gaveta <-> cofre/banco):
 * o dinheiro muda de lugar, mas a clínica não ganha nem gasta. Por isso ficam
 * fora de entradas, saídas e saldo, que seguem a mesma regra do Financeiro
 * (receita - despesa) e do DRE. Os valores continuam disponíveis em
 * `suprimentos`, `sangrias` e `transferenciasLiquidas` para exibição separada.
 * O saldo da gaveta no Caixa diário usa outra regra (src/lib/caixaDiario.ts).
 */
export function totaisMovimentoCaixa(movimentos: Array<{ tipo: string; valor: number }>) {
  const totais = { receitas: 0, despesas: 0, suprimentos: 0, sangrias: 0 };
  for (const movimento of movimentos) {
    const grupo = grupoMovimentoCaixa(movimento.tipo);
    if (grupo) totais[grupo] += Number(movimento.valor) || 0;
  }
  const entradas = totais.receitas;
  const saidas = totais.despesas;
  return {
    ...totais,
    entradas,
    saidas,
    saldo: entradas - saidas,
    transferenciasLiquidas: totais.suprimentos - totais.sangrias,
  };
}
