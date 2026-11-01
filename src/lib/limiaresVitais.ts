/**
 * Limiares únicos de sinais vitais (adulto) usados pela faixa do atendimento,
 * pelo painel de contexto clínico, pelo histórico e pelos gráficos.
 *
 * Antes cada tela tinha os seus números: a mesma PA aparecia normal num lugar
 * e alterada em outro. Aqui ficam três níveis:
 * - "normal": dentro da faixa usual;
 * - "atencao": fora da faixa usual, sem urgência (âmbar);
 * - "alerta": valor que pede revisão antes de seguir (vermelho).
 *
 * São referências gerais para adultos e não substituem o julgamento clínico.
 */

export type SinalVital =
  | 'pressao_sistolica'
  | 'pressao_diastolica'
  | 'frequencia_cardiaca'
  | 'frequencia_respiratoria'
  | 'temperatura'
  | 'saturacao'
  | 'glicemia';

export type NivelVital = 'normal' | 'atencao' | 'alerta';

interface Limiar {
  /** Faixa usual, usada também como faixa de referência nos gráficos. */
  normal: [number, number];
  /** Abaixo deste valor (exclusivo) o sinal está em alerta. */
  alertaAbaixo?: number;
  /** A partir deste valor (inclusivo) o sinal está em alerta. */
  alertaAcima?: number;
  unidade: string;
  rotulo: string;
}

export const LIMIARES_VITAIS: Record<SinalVital, Limiar> = {
  pressao_sistolica: { normal: [90, 139], alertaAbaixo: 90, alertaAcima: 180, unidade: 'mmHg', rotulo: 'Pressão sistólica' },
  pressao_diastolica: { normal: [60, 89], alertaAbaixo: 60, alertaAcima: 120, unidade: 'mmHg', rotulo: 'Pressão diastólica' },
  frequencia_cardiaca: { normal: [60, 100], alertaAbaixo: 50, alertaAcima: 121, unidade: 'bpm', rotulo: 'Frequência cardíaca' },
  frequencia_respiratoria: { normal: [12, 20], alertaAbaixo: 8, alertaAcima: 30, unidade: 'irpm', rotulo: 'Frequência respiratória' },
  temperatura: { normal: [35, 37.4], alertaAbaixo: 35, alertaAcima: 38, unidade: '°C', rotulo: 'Temperatura' },
  saturacao: { normal: [94, 100], alertaAbaixo: 90, unidade: '%', rotulo: 'Saturação' },
  glicemia: { normal: [70, 179], alertaAbaixo: 70, alertaAcima: 250, unidade: 'mg/dL', rotulo: 'Glicemia' },
};

/** Converte "120", "36,8" ou número em número finito; vazio vira null. */
export function numeroVital(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const numero = Number(valor.trim().replace(',', '.'));
  return Number.isFinite(numero) ? numero : null;
}

export function classificarSinalVital(sinal: SinalVital, valor: unknown): NivelVital | null {
  const numero = numeroVital(valor);
  if (numero === null) return null;
  const limiar = LIMIARES_VITAIS[sinal];
  if (limiar.alertaAbaixo !== undefined && numero < limiar.alertaAbaixo) return 'alerta';
  if (limiar.alertaAcima !== undefined && numero >= limiar.alertaAcima) return 'alerta';
  const [minimo, maximo] = limiar.normal;
  if (numero < minimo || numero > maximo) return 'atencao';
  return 'normal';
}

export function faixaNormalVital(sinal: SinalVital): [number, number] {
  return LIMIARES_VITAIS[sinal].normal;
}

/** Classe de texto: neutro no normal, âmbar na atenção, vermelho no alerta. */
export function classeTextoNivelVital(nivel: NivelVital | null): string {
  if (nivel === 'alerta') return 'text-destructive';
  if (nivel === 'atencao') return 'text-warning-foreground';
  return 'text-foreground';
}

/** Classe de selo (badge) com a mesma regra de cor. */
export function classeSeloNivelVital(nivel: NivelVital | null): string {
  if (nivel === 'alerta') return 'border-destructive/30 bg-destructive/10 text-destructive';
  if (nivel === 'atencao') return 'border-warning/40 bg-warning/10 text-warning-foreground';
  return 'border-border bg-secondary text-foreground';
}

/** O pior nível entre vários (ex.: sistólica e diastólica da mesma PA). */
export function piorNivelVital(...niveis: Array<NivelVital | null>): NivelVital | null {
  if (niveis.includes('alerta')) return 'alerta';
  if (niveis.includes('atencao')) return 'atencao';
  if (niveis.includes('normal')) return 'normal';
  return null;
}
