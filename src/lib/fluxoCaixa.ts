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

export function totaisMovimentoCaixa(movimentos: Array<{ tipo: string; valor: number }>) {
  const totais = { receitas: 0, despesas: 0, suprimentos: 0, sangrias: 0 };
  for (const movimento of movimentos) {
    const grupo = grupoMovimentoCaixa(movimento.tipo);
    if (grupo) totais[grupo] += Number(movimento.valor) || 0;
  }
  const entradas = totais.receitas + totais.suprimentos;
  const saidas = totais.despesas + totais.sangrias;
  return { ...totais, entradas, saidas, saldo: entradas - saidas };
}
