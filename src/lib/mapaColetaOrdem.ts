/**
 * Ordem de coleta dos tubos (CLSI GP41): hemocultura, citrato, soro/seco,
 * heparina, EDTA e fluoreto. Materiais que não são sangue vão por último.
 */
const ORDEM_CLSI: Array<{ chave: RegExp; posicao: number }> = [
  { chave: /hemocultura|cultura/i, posicao: 0 },
  { chave: /citrato|azul/i, posicao: 1 },
  { chave: /seco|vermelho|soro|amarelo|gel/i, posicao: 2 },
  { chave: /heparina|verde/i, posicao: 3 },
  { chave: /edta|roxo|lil[aá]s/i, posicao: 4 },
  { chave: /fluoreto|cinza/i, posicao: 5 },
  { chave: /urina/i, posicao: 7 },
  { chave: /fezes/i, posicao: 8 },
  { chave: /swab|laranja/i, posicao: 9 },
];

export function posicaoTuboClsi(tubo: string | null | undefined): number {
  const texto = tubo ?? '';
  if (!texto.trim()) return 6;
  return ORDEM_CLSI.find(item => item.chave.test(texto))?.posicao ?? 6;
}

type ItemColeta = { id: string; paciente_id?: string | null; tubo?: string | null; pacientes?: { nome?: string | null; nome_social?: string | null } | null };

/**
 * Agrupa as coletas por paciente mantendo a prioridade de chegada (o primeiro
 * item de cada paciente define a posição do grupo) e ordena os tubos de cada
 * paciente pela ordem CLSI.
 */
export function agruparPorPaciente<T extends ItemColeta>(itens: T[]): Array<{ chave: string; nome: string; itens: T[] }> {
  const grupos = new Map<string, { chave: string; nome: string; itens: T[] }>();
  for (const item of itens) {
    const chave = item.paciente_id ?? `sem-paciente-${item.id}`;
    const nome = item.pacientes?.nome_social?.trim() || item.pacientes?.nome || '—';
    const grupo = grupos.get(chave) ?? { chave, nome, itens: [] };
    grupo.itens.push(item);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()].map(grupo => ({
    ...grupo,
    itens: grupo.itens
      .map((item, indice) => ({ item, indice }))
      .sort((a, b) => posicaoTuboClsi(a.item.tubo) - posicaoTuboClsi(b.item.tubo) || a.indice - b.indice)
      .map(({ item }) => item),
  }));
}
