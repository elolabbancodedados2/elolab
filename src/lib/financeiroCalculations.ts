/** Returns null when a margin cannot be calculated because there is no revenue base. */
export function calcularMargemLucro(totalReceitas: number, lucroOperacional: number): number | null {
  if (!Number.isFinite(totalReceitas) || totalReceitas <= 0) return null;
  return (lucroOperacional / totalReceitas) * 100;
}

const numeroAbreviado = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function formatarPercentualFinanceiro(valor: number): string {
  return `${numeroAbreviado.format(valor)}%`;
}

export function formatarValorAbreviadoFinanceiro(valor: number): string {
  const absoluto = Math.abs(valor);
  if (absoluto >= 1_000_000) return `R$ ${numeroAbreviado.format(valor / 1_000_000)} mi`;
  if (absoluto >= 1_000) return `R$ ${numeroAbreviado.format(valor / 1_000)} mil`;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}
