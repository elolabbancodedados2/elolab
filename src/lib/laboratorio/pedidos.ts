export function normalizarExamesSolicitados(nomes: string[]): string[] {
  if (nomes.length > 40) throw new Error('O pedido pode conter no máximo 40 exames.');
  const exames = nomes.map((nome) => nome.trim()).filter(Boolean);
  if (exames.length === 0) throw new Error('Adicione pelo menos um exame.');
  return exames;
}
