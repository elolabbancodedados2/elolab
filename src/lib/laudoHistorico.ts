import { normalizarTexto } from '@/lib/buscaPaciente';
import { parseResultadoNumerico } from '@/lib/laudoWorkflow';

export type ResultadoAnterior = { parametro: string | null; resultado: string | null; unidade?: string | null; created_at: string | null };
export type SerieParametro = { anterior: ResultadoAnterior; valores: number[] };

/**
 * Resultados anteriores do paciente agrupados por parâmetro, do mais antigo
 * para o mais recente. `anterior` é o último antes do laudo atual.
 */
export function seriesPorParametro(anteriores: ResultadoAnterior[], limite = 6): Map<string, SerieParametro> {
  const grupos = new Map<string, ResultadoAnterior[]>();
  for (const item of anteriores) {
    const chave = normalizarTexto(item.parametro ?? '');
    if (!chave) continue;
    const lista = grupos.get(chave) ?? [];
    lista.push(item);
    grupos.set(chave, lista);
  }
  const series = new Map<string, SerieParametro>();
  for (const [chave, lista] of grupos) {
    const ordenada = [...lista].sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
    const valores = ordenada.map(item => parseResultadoNumerico(item.resultado)).filter((valor): valor is number => valor !== null).slice(-limite);
    series.set(chave, { anterior: ordenada[ordenada.length - 1], valores });
  }
  return series;
}

export function chaveParametro(parametro: string | null | undefined): string {
  return normalizarTexto(parametro ?? '');
}

/** Variação percentual do atual sobre o anterior; nula quando não dá para comparar. */
export function variacaoPercentual(atual: unknown, anterior: unknown): number | null {
  const a = parseResultadoNumerico(atual);
  const b = parseResultadoNumerico(anterior);
  if (a === null || b === null || b === 0) return null;
  return ((a - b) / Math.abs(b)) * 100;
}

/** Pontos "x,y" de uma linha para um SVG de largura × altura. */
export function pontosSparkline(valores: number[], largura = 80, altura = 24): string {
  if (valores.length < 2) return '';
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const faixa = max - min || 1;
  const passo = largura / (valores.length - 1);
  return valores.map((valor, indice) => {
    const x = Math.round(indice * passo * 10) / 10;
    const y = Math.round((altura - ((valor - min) / faixa) * altura) * 10) / 10;
    return `${x},${y}`;
  }).join(' ');
}
