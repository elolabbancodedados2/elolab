/**
 * Lê todas as linhas de uma consulta do PostgREST em blocos.
 *
 * O servidor devolve no máximo 1000 linhas por resposta (max_rows). Uma tela
 * que faz `.select()` sem paginar mostra só as primeiras 1000 — sem erro, sem
 * aviso. `montar` deve devolver a consulta já filtrada e ordenada (de
 * preferência com um desempate estável, como `id`), sem `.range()`.
 */
export async function buscarEmBlocos<T>(
  montar: () => any,
  opcoes: { bloco?: number; teto?: number } = {},
): Promise<T[]> {
  const bloco = opcoes.bloco ?? 1000;
  const teto = opcoes.teto ?? 20000;
  const linhas: T[] = [];
  while (linhas.length < teto) {
    const inicio = linhas.length;
    const { data, error } = await montar().range(inicio, inicio + bloco - 1);
    if (error) throw error;
    const lote = (data ?? []) as T[];
    linhas.push(...lote);
    if (lote.length < bloco) break;
  }
  return linhas;
}
