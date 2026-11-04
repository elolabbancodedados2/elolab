export interface RascunhoProntuario {
  id: string;
  medico_id: string | null;
  assinado: boolean | null;
  updated_at: string | null;
  [key: string]: unknown;
}

export function rascunhoAntigo(registro: { assinado?: boolean | null; created_at?: string | null; updated_at?: string | null }, agora = Date.now()): boolean {
  const criado = Date.parse(registro.created_at || registro.updated_at || '');
  return registro.assinado !== true && Number.isFinite(criado) && agora - criado > 24 * 60 * 60 * 1000;
}

export function nomeAutorRascunho(
  medicoId: string | null | undefined,
  medicos: Array<{ id: string; nome?: string | null }>,
  nomePerfil?: string | null,
): string {
  if (!medicoId) return 'Profissional não identificado';
  const nomeMedico = medicos.find(medico => medico.id === medicoId)?.nome?.trim();
  return nomeMedico || nomePerfil?.trim() || 'Profissional não identificado';
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
