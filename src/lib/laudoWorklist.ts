export type CursorLaudo = { created_at: string; id: string } | null;

export function cursorAposAtualizacaoWorklist(
  cursorAtual: CursorLaudo,
  cursorMaisRecente: CursorLaudo,
  historicoCarregado: boolean,
): CursorLaudo {
  return historicoCarregado && cursorAtual ? cursorAtual : cursorMaisRecente;
}

type ColetaOrdenavel = { id: string; created_at: string };

function anteriorAo(coleta: ColetaOrdenavel, limite: { created_at: string; id: string }): boolean {
  const a = new Date(coleta.created_at).getTime();
  const b = new Date(limite.created_at).getTime();
  return a < b || (a === b && coleta.id < limite.id);
}

/**
 * Atualiza a janela mais recente sem misturar dados velhos.
 *
 * A atualização relê só as coletas mais novas (até o fim da janela). Tudo
 * nesse trecho é substituído pelo que veio do banco — inclusive o que deixou
 * de ter resultado ou mudou. Só as páginas antigas carregadas à parte, abaixo
 * do fim da janela, são preservadas.
 */
export function mesclarJanelaLaudos<T extends ColetaOrdenavel>(
  atuais: T[],
  janelaComResultados: T[],
  fimDaJanela: CursorLaudo,
  janelaCompleta: boolean,
): T[] {
  const antigas = janelaCompleta && fimDaJanela ? atuais.filter(coleta => anteriorAo(coleta, fimDaJanela)) : [];
  const porId = new Map<string, T>();
  for (const coleta of antigas) porId.set(coleta.id, coleta);
  for (const coleta of janelaComResultados) porId.set(coleta.id, coleta);
  return [...porId.values()].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

/** Texto do WhatsApp conforme o laudo; nulo quando há resultado crítico (contato cabe ao médico). */
export function mensagemWhatsAppLaudo(
  nome: string,
  codigo: string,
  estado: 'liberado' | 'parcial' | 'pendente',
  temCritico: boolean,
): string | null {
  if (temCritico) return null;
  if (estado === 'liberado') return `Olá, ${nome}! Seu laudo laboratorial (${codigo}) está disponível. Entre em contato para mais informações.`;
  if (estado === 'parcial') return `Olá, ${nome}! Parte dos resultados do seu exame (${codigo}) já está disponível; os demais ainda estão em análise.`;
  return `Olá, ${nome}! Seu exame (${codigo}) está em análise no laboratório. Avisaremos quando o laudo estiver disponível.`;
}
