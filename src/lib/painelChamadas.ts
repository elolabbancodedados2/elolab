const chaveStorage = (clinicaId: string) => `elolab:painel-tv:chamadas-anunciadas:${clinicaId}`;

/** Uma chamada = linha da fila + instante da gravação; rechamar gera chave nova. */
export function chaveChamada(item: { id: string; updated_at: string | null; horario_chegada: string }): string {
  return `${item.id}:${item.updated_at || item.horario_chegada}`;
}

/** Chamadas já anunciadas por este navegador; vazio se o armazenamento falhar. */
export function lerChamadasAnunciadas(clinicaId: string): Set<string> {
  try {
    const valor = JSON.parse(localStorage.getItem(chaveStorage(clinicaId)) ?? '[]');
    return new Set(Array.isArray(valor) ? valor.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

export function salvarChamadasAnunciadas(clinicaId: string, chaves: Iterable<string>): void {
  try {
    localStorage.setItem(chaveStorage(clinicaId), JSON.stringify([...chaves]));
  } catch {
    // Armazenamento bloqueado: o painel segue anunciando, só perde a memória na recarga.
  }
}
