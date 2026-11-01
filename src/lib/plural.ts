/**
 * Quantidade com a palavra concordando: `contagem(1, 'exame')` → "1 exame",
 * `contagem(3, 'coleta')` → "3 coletas", `contagem(2, 'notificação', 'notificações')`.
 * Substitui os "(s)" e "(ões)" que apareciam nas mensagens.
 */
export function contagem(quantidade: number, singular: string, plural = `${singular}s`): string {
  return `${quantidade.toLocaleString('pt-BR')} ${quantidade === 1 ? singular : plural}`;
}

/** Só a palavra, para frases em que o número já aparece antes. */
export function palavra(quantidade: number, singular: string, plural = `${singular}s`): string {
  return quantidade === 1 ? singular : plural;
}
