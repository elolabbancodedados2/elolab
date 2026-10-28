export type NivelEspera = 'sem_registro' | 'no_prazo' | 'atencao' | 'atrasado';

/** Minutos desde a chegada; nulo quando não há horário válido. */
export function minutosDeEspera(desde: string | null | undefined, agora: number = Date.now()): number | null {
  if (!desde) return null;
  const instante = Date.parse(desde);
  if (!Number.isFinite(instante)) return null;
  return Math.max(0, Math.floor((agora - instante) / 60_000));
}

export function formatarEspera(minutos: number | null): string {
  if (minutos === null) return '—';
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)}h ${minutos % 60}min`;
}

/** Mesmos limites de cor já usados na fila (15 e 30 min), agora com rótulo. */
export function nivelEspera(minutos: number | null): { nivel: NivelEspera; rotulo: string } {
  if (minutos === null) return { nivel: 'sem_registro', rotulo: 'Sem horário de chegada' };
  if (minutos < 15) return { nivel: 'no_prazo', rotulo: 'No prazo' };
  if (minutos < 30) return { nivel: 'atencao', rotulo: 'Espera longa' };
  return { nivel: 'atrasado', rotulo: 'Atrasado' };
}
