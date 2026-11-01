/**
 * Coloca a evolução salva na lista do histórico sem recarregar as demais,
 * mantendo a ordem da tela (data mais recente primeiro, depois id).
 */
export function atualizarEvolucaoNoHistorico<T extends { id: string; data?: string | null }>(lista: T[], evolucao: T): T[] {
  const semEla = lista.filter(item => item.id !== evolucao.id);
  return [...semEla, evolucao].sort((a, b) =>
    String(b.data ?? '').localeCompare(String(a.data ?? '')) || String(b.id).localeCompare(String(a.id)));
}
