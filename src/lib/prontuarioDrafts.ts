export interface RascunhoProntuario {
  id: string;
  medico_id: string | null;
  assinado: boolean | null;
  updated_at: string | null;
  [key: string]: unknown;
}

export function filtrarRascunhosAbertos<T extends RascunhoProntuario>(
  registros: T[],
  medicoId: string | null | undefined,
): T[] {
  if (!medicoId) return [];
  return registros
    .filter(registro => registro.medico_id === medicoId && registro.assinado !== true)
    .sort((a, b) => (Date.parse(b.updated_at || '') || 0) - (Date.parse(a.updated_at || '') || 0));
}
