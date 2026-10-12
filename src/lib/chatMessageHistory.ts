export const LIMITE_HISTORICO_CHAT = 20_000;

export async function carregarHistoricoRecente<T>(
  buscarPagina: (offset: number, limit: number) => Promise<T[]>,
  options: { pageSize?: number; maxRows?: number } = {},
): Promise<{ messages: T[]; truncated: boolean }> {
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 1000, 1000));
  const maxRows = Math.max(pageSize, options.maxRows ?? LIMITE_HISTORICO_CHAT);
  const recentFirst: T[] = [];
  while (recentFirst.length < maxRows) {
    const limit = Math.min(pageSize, maxRows - recentFirst.length);
    const page = await buscarPagina(recentFirst.length, limit);
    recentFirst.push(...page);
    if (page.length < limit) return { messages: recentFirst.reverse(), truncated: false };
  }
  const extra = await buscarPagina(maxRows, 1);
  return { messages: recentFirst.reverse(), truncated: extra.length > 0 };
}
