/**
 * Regras da dispensação de medicamentos na clínica (prescrição → estoque).
 *
 * A busca antiga usava `ilike` na primeira palavra do nome e pegava o primeiro
 * item com saldo, mesmo vencido e mesmo de outra clínica: "Dipirona gotas"
 * podia baixar "Dipirona 1 g injetável". Aqui a escolha é feita por nome
 * inteiro normalizado, só entre lotes dentro da validade, e qualquer dúvida
 * vira alerta em vez de baixa.
 */

export interface ItemEstoqueDispensacao {
  id: string;
  nome: string;
  quantidade: number;
  quantidade_minima?: number | null;
  validade?: string | null;
  lote?: string | null;
  unidade?: string | null;
}

export type EscolhaDispensacao =
  | { tipo: 'ok'; item: ItemEstoqueDispensacao }
  | { tipo: 'nao_encontrado' }
  | { tipo: 'ambiguo'; nomes: string[] }
  | { tipo: 'vencido'; item: ItemEstoqueDispensacao }
  | { tipo: 'insuficiente'; item: ItemEstoqueDispensacao; disponivel: number };

/** Minúsculas, sem acentos e com espaços simples: compara "Dipirona  500MG" com "dipirona 500mg". */
export function normalizarNomeItem(valor: string | null | undefined): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Só aceita inteiro positivo ("2", " 10 "). "½", "meia caixa", "1,5" ou "2 cx"
 * devolvem null: chutar 1 faria o estoque divergir do armário.
 */
export function lerQuantidadeDispensacao(texto: string | null | undefined): number | null {
  const limpo = String(texto ?? '').trim();
  if (!/^\d+$/.test(limpo)) return null;
  const valor = Number(limpo);
  return Number.isSafeInteger(valor) && valor > 0 && valor <= 2_147_483_647 ? valor : null;
}

/** Lote vencido é o que tem validade antes de hoje (data no fuso da clínica). */
export function loteVencido(item: Pick<ItemEstoqueDispensacao, 'validade'>, hoje: string): boolean {
  const validade = item.validade?.slice(0, 10);
  return Boolean(validade && /^\d{4}-\d{2}-\d{2}$/.test(validade) && validade < hoje);
}

/** Primeiro o que vence antes (FEFO); sem validade vai para o fim. */
export function ordenarFefo<T extends Pick<ItemEstoqueDispensacao, 'validade' | 'nome'>>(itens: T[]): T[] {
  return [...itens].sort((a, b) => {
    const va = a.validade?.slice(0, 10) || '9999-12-31';
    const vb = b.validade?.slice(0, 10) || '9999-12-31';
    return va.localeCompare(vb) || a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

/**
 * Itens que correspondem ao nome prescrito: primeiro os de nome idêntico
 * (normalizado); se não houver, os que contêm o nome ou estão contidos nele.
 * Devolve também quantos nomes distintos sobraram, para detectar ambiguidade.
 */
export function itensCorrespondentes<T extends ItemEstoqueDispensacao>(nome: string, candidatos: T[]): { itens: T[]; nomesDistintos: string[] } {
  const alvo = normalizarNomeItem(nome);
  if (!alvo) return { itens: [], nomesDistintos: [] };
  const exatos = candidatos.filter(c => normalizarNomeItem(c.nome) === alvo);
  const itens = exatos.length > 0
    ? exatos
    : candidatos.filter(c => {
      const nomeItem = normalizarNomeItem(c.nome);
      return nomeItem.length > 0 && (nomeItem.includes(alvo) || alvo.includes(nomeItem));
    });
  const nomes = new Map<string, string>();
  for (const item of itens) nomes.set(normalizarNomeItem(item.nome), item.nome);
  return { itens, nomesDistintos: [...nomes.values()] };
}

/**
 * Escolhe o lote para baixar `quantidade` do medicamento `nome`.
 * Nunca escolhe lote vencido e nunca decide entre dois produtos diferentes.
 */
export function escolherItemDispensacao(
  nome: string,
  quantidade: number,
  candidatos: ItemEstoqueDispensacao[],
  hoje: string,
): EscolhaDispensacao {
  const { itens, nomesDistintos } = itensCorrespondentes(nome, candidatos.filter(c => Number(c.quantidade) > 0));
  if (itens.length === 0) return { tipo: 'nao_encontrado' };
  if (nomesDistintos.length > 1) return { tipo: 'ambiguo', nomes: nomesDistintos };

  const dentroDaValidade = ordenarFefo(itens.filter(item => !loteVencido(item, hoje)));
  if (dentroDaValidade.length === 0) return { tipo: 'vencido', item: ordenarFefo(itens)[0] };

  const suficiente = dentroDaValidade.find(item => Number(item.quantidade) >= quantidade);
  if (suficiente) return { tipo: 'ok', item: suficiente };
  const maior = dentroDaValidade.reduce((a, b) => (Number(b.quantidade) > Number(a.quantidade) ? b : a));
  return { tipo: 'insuficiente', item: maior, disponivel: Number(maior.quantidade) };
}

/** Texto do alerta mostrado quando a escolha não resulta em baixa. */
export function alertaDaEscolha(nome: string, escolha: EscolhaDispensacao, quantidade: number): string | null {
  switch (escolha.tipo) {
    case 'ok': return null;
    case 'nao_encontrado': return `${nome}: não encontrado no estoque`;
    case 'ambiguo': return `${nome}: mais de um item corresponde (${escolha.nomes.join(', ')}); escolha o item para dar baixa`;
    case 'vencido': return `${escolha.item.nome}: apenas lote vencido em estoque; nada foi baixado`;
    case 'insuficiente': return `${escolha.item.nome}: estoque insuficiente (${escolha.disponivel} disponível, ${quantidade} solicitado)`;
  }
}

/** Escapa os curingas do `ilike` para a busca ampla pela primeira palavra. */
export function termoBuscaAmpla(nome: string): string {
  const primeira = nome.trim().split(/\s+/)[0] ?? '';
  return primeira.replace(/[\\%_]/g, ch => `\\${ch}`);
}
