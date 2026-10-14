// Domínio persistido em lista_espera.prioridade (CHECK normal/preferencial/urgente).
export const PRIORIDADES_LISTA_ESPERA = ['normal', 'preferencial', 'urgente'] as const;

export type PrioridadeListaEspera = (typeof PRIORIDADES_LISTA_ESPERA)[number];

export interface PrioridadeListaEsperaInfo {
  value: PrioridadeListaEspera | null;
  label: string;
  className: string;
}

const PRIORIDADE_INFO: Record<PrioridadeListaEspera, Omit<PrioridadeListaEsperaInfo, 'value'>> = {
  normal: { label: 'Normal', className: 'bg-muted text-muted-foreground border-border' },
  preferencial: { label: 'Preferencial', className: 'bg-info/10 text-info border-info/20' },
  urgente: { label: 'Urgente', className: 'bg-destructive/10 text-destructive border-destructive/20' },
};

const PRIORIDADE_DESCONHECIDA_CLASS = 'bg-warning/10 text-warning-foreground border-warning/20';

export function isPrioridadeListaEspera(value: unknown): value is PrioridadeListaEspera {
  return typeof value === 'string' && (PRIORIDADES_LISTA_ESPERA as readonly string[]).includes(value);
}

/** Vazio equivale ao default do banco (normal); valor fora do domínio fica sinalizado, sem cor de prioridade real. */
export function getPrioridadeListaEspera(prioridade: string | null | undefined): PrioridadeListaEsperaInfo {
  if (!prioridade) return { value: 'normal', ...PRIORIDADE_INFO.normal };
  if (isPrioridadeListaEspera(prioridade)) return { value: prioridade, ...PRIORIDADE_INFO[prioridade] };
  return { value: null, label: `Prioridade desconhecida (${prioridade})`, className: PRIORIDADE_DESCONHECIDA_CLASS };
}
