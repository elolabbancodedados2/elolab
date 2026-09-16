/** Divide em centavos e distribui o resto nas primeiras parcelas. */
export function parcelarCobranca(total: number, quantidade: number): number[] {
  const centavos = Math.round((total + Number.EPSILON) * 100);
  if (!Number.isFinite(total) || !Number.isSafeInteger(centavos) || centavos <= 0) {
    throw new Error('O total da cobrança deve ser maior que zero.');
  }
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 48) {
    throw new Error('Informe de 1 a 48 parcelas inteiras.');
  }
  if (quantidade > centavos) {
    throw new Error('Cada parcela deve ter pelo menos R$ 0,01.');
  }
  const base = Math.floor(centavos / quantidade);
  const resto = centavos % quantidade;
  return Array.from({ length: quantidade }, (_, i) => (base + (i < resto ? 1 : 0)) / 100);
}
