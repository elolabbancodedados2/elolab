/**
 * Comparação e arredondamento de valores em reais.
 *
 * O PROBLEMA
 * Dinheiro em `number` é ponto flutuante binário, e reais não têm representação
 * exata em binário. Somas sucessivas acumulam resíduo:
 *
 *   0.1 + 0.2                    → 0.30000000000000004
 *   150.50 + 89.90 + 45.30       → 285.70000000000005
 *
 * O fechamento de caixa comparava `parseFloat(valorContado) === totais.final`.
 * A operadora contava o caixa certinho, digitava 285,70, e o painel ficava
 * VERMELHO exibindo "Diferença: R$ 0,00" — porque a exibição arredonda para
 * dois decimais mas a comparação não. Ela recontava o dinheiro procurando um
 * erro que não existia, e passava a desconfiar do sistema.
 *
 * A SOLUÇÃO
 * Comparar em centavos, que são inteiros. Todo valor que o usuário vê já está
 * arredondado a duas casas, então essa é a mesma precisão que ele enxerga.
 */

/** Reais → centavos inteiros. `Math.round` absorve o resíduo do float. */
export function emCentavos(valor: number): number {
  return Math.round((Number(valor) || 0) * 100);
}

/** Dois valores em reais representam a mesma quantia até o centavo? */
export function mesmoValor(a: number, b: number): boolean {
  return emCentavos(a) === emCentavos(b);
}

/**
 * Diferença entre dois valores, já arredondada ao centavo.
 *
 * Devolve exatamente 0 quando as quantias batem — sem o `-1.4210854715202004e-14`
 * que a subtração direta produziria e que a tela mostraria como "R$ -0,00".
 */
export function diferencaEmReais(a: number, b: number): number {
  return (emCentavos(a) - emCentavos(b)) / 100;
}

/** Arredonda para duas casas antes de gravar no banco. */
export function arredondarReais(valor: number): number {
  return emCentavos(valor) / 100;
}
