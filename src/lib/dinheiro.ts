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

/**
 * Lê um valor digitado em reais: aceita "1.234,56", "1234,56" e "1234.56".
 * Devolve null para vazio ou formato inválido (mais de duas casas, letras,
 * sinal negativo). Era copiada em cinco telas do caixa com pequenas diferenças.
 */
export function parseMoneyInput(valor: string | null | undefined): number | null {
  const compacto = String(valor ?? '').trim().replace(/\s/g, '');
  if (!compacto) return null;
  const formatoBrasileiro = /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/;
  const formatoDecimal = /^\d+(?:\.\d{1,2})?$/;
  if (!formatoBrasileiro.test(compacto) && !formatoDecimal.test(compacto)) return null;
  const normalizado = compacto.includes(',') ? compacto.replace(/\./g, '').replace(',', '.') : compacto;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? arredondarReais(numero) : null;
}

/** Valor em reais para preencher um campo de texto ("1234,5" → "1234,50"). */
export function formatarCampoReais(valor: number): string {
  return (emCentavos(valor) / 100).toFixed(2).replace('.', ',');
}

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function ate999(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    if (resto < 20) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(' e ');
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return 'zero';
  const grupos: Array<[number, string, string]> = [
    [1_000_000_000, 'bilhão', 'bilhões'],
    [1_000_000, 'milhão', 'milhões'],
    [1_000, 'mil', 'mil'],
  ];
  const partes: string[] = [];
  let resto = n;
  for (const [base, singular, plural] of grupos) {
    const q = Math.floor(resto / base);
    if (!q) continue;
    resto %= base;
    partes.push(base === 1_000 && q === 1 ? 'mil' : `${ate999(q)} ${q === 1 ? singular : plural}`);
  }
  if (resto) partes.push(ate999(resto));
  if (partes.length === 1) return partes[0];
  // "mil e cem", "mil duzentos e trinta": o "e" final só entra quando o último
  // grupo é uma centena redonda ou menor que cem.
  const ultimo = partes[partes.length - 1];
  const ligaComE = resto > 0 && (resto < 100 || resto % 100 === 0);
  return `${partes.slice(0, -1).join(' ')}${ligaComE ? ' e ' : ' '}${ultimo}`;
}

/** Valor por extenso para recibos: 1234,56 → "mil duzentos e trinta e quatro reais e cinquenta e seis centavos". */
export function valorPorExtenso(valor: number): string {
  const centavosTotais = Math.abs(emCentavos(valor));
  const reais = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;
  const partes: string[] = [];
  if (reais > 0) {
    const redondoEmMilhao = reais >= 1_000_000 && reais % 1_000_000 === 0;
    partes.push(`${inteiroPorExtenso(reais)}${redondoEmMilhao ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (centavos > 0) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  return partes.length ? partes.join(' e ') : 'zero real';
}

/** Parses a counted cash amount. Blank or invalid values are not zero. */
export function parseValorContado(valor: string): number | null {
  if (!valor.trim()) return null;
  const parsed = Number(valor);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return arredondarReais(parsed);
}
