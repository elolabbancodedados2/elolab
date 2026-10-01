/**
 * Montagem do pagamento dividido.
 *
 * Extraído da tela de Recepção para poder ser testado: é aritmética de dinheiro
 * no caminho do caixa, e um erro de centavo aqui vira divergência no fechamento.
 *
 * A REGRA
 * A primeira forma escolhida fica com o RESTANTE, não com um valor digitado.
 * O operador informa só as formas adicionais ("R$ 200 no Pix") e a primeira
 * absorve a diferença. Sem isso, numa conta de R$ 500 o total enviado seria
 * R$ 200 + R$ 500 = R$ 700, e a RPC recusaria por exceder o saldo.
 */

export interface FormaExtra {
  forma: string;
  valor: number;
}

export interface PagamentoParaRpc {
  forma_pagamento: string;
  valor: number;
}

/** Returns the entered installment when it is a valid portion of the balance. */
export function validarValorRecebido(valor: string, saldo: number): number | null {
  if (!valor.trim()) return null;
  const centavos = Math.round(Number(valor) * 100);
  const saldoCentavos = emCentavos(saldo);
  if (!Number.isFinite(centavos) || centavos <= 0 || centavos > saldoCentavos) return null;
  return centavos / 100;
}

export function calcularSaldoPagamento(
  valor: number,
  desconto = 0,
  acrescimo = 0,
  valorPago = 0,
): number {
  return Math.max(0, (emCentavos(valor) - emCentavos(desconto) + emCentavos(acrescimo) - emCentavos(valorPago)) / 100);
}

/** Centavos, para não somar float. */
function emCentavos(v: number): number {
  return Math.round((Number(v) || 0) * 100);
}

/**
 * @param formaPrincipal  forma escolhida nos botões grandes
 * @param extras          formas adicionais informadas pelo operador
 * @param valorDevido     total a receber, já com desconto e acréscimo
 */
export function montarPagamentos(
  formaPrincipal: string,
  extras: FormaExtra[],
  valorDevido: number,
): PagamentoParaRpc[] {
  const validas = extras
    .filter(f => f.forma && Number(f.valor) > 0)
    .map(f => ({ forma_pagamento: f.forma, valor: emCentavos(f.valor) / 100 }));

  const somaExtras = validas.reduce((s, e) => s + emCentavos(e.valor), 0);
  const restante = emCentavos(valorDevido) - somaExtras;

  // Restante zero significa que as extras já cobriram tudo — a forma principal
  // simplesmente não entra, em vez de entrar com R$ 0 e ser recusada.
  return restante > 0
    ? [{ forma_pagamento: formaPrincipal, valor: restante / 100 }, ...validas]
    : validas;
}

/** Soma das formas adicionais, para a tela avisar antes de mandar. */
export function somaDasExtras(extras: FormaExtra[]): number {
  return extras.reduce((s, f) => s + emCentavos(f.valor), 0) / 100;
}

/** Human-readable receipt detail for every tender in a split payment. */
export function resumirPagamentos(
  pagamentos: PagamentoParaRpc[],
  rotulos: Record<string, string> = {},
): string {
  const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  return pagamentos
    .map((pagamento) => `${rotulos[pagamento.forma_pagamento] || pagamento.forma_pagamento}: ${moeda.format(pagamento.valor)}`)
    .join(' + ');
}
