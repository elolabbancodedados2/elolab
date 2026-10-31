// Comparação de propostas de uma cotação de compra.
//
// A regra é a mesma da RPC gerar_pedidos_da_cotacao: vence o menor preço
// unitário; no empate, o menor prazo (sem prazo conta como o maior); depois o
// nome do fornecedor e, por fim, o id. Propostas de fornecedores inativos não
// entram na comparação.

export type SituacaoCotacao = 'aberta' | 'fechada' | 'cancelada';
export type SituacaoPedidoCompra = 'emitido' | 'recebido' | 'cancelado';

export interface ItemCotacaoComparacao {
  id: string;
  descricao: string;
  quantidade: number;
  unidade?: string | null;
}

export interface PropostaComparacao {
  cotacao_item_id: string;
  fornecedor_id: string;
  preco_unitario: number;
  prazo_dias?: number | null;
}

export interface FornecedorComparacao {
  id: string;
  nome: string;
  ativo?: boolean | null;
}

export interface CelulaComparacao {
  precoUnitario: number;
  prazoDias: number | null;
  subtotal: number;
  menorPreco: boolean;
  vencedora: boolean;
}

export interface LinhaComparacao {
  item: ItemCotacaoComparacao;
  celulas: Record<string, CelulaComparacao>;
  vencedorId: string | null;
  menorPreco: number | null;
  empate: boolean;
  semProposta: boolean;
}

export interface TotalFornecedor {
  fornecedor: FornecedorComparacao;
  /** Soma de todos os itens que o fornecedor cotou. */
  totalCotado: number;
  itensCotados: number;
  /** Soma dos itens em que o fornecedor tem o menor preço (vai para o pedido). */
  totalVencido: number;
  itensVencidos: number;
  cotouTudo: boolean;
}

export interface ComparacaoCotacao {
  fornecedores: FornecedorComparacao[];
  linhas: LinhaComparacao[];
  totais: TotalFornecedor[];
  itensSemProposta: ItemCotacaoComparacao[];
  totalMenorPreco: number;
  podeGerarPedidos: boolean;
}

const centavos = (valor: number) => Math.round(Number(valor) * 100);
export const arredondarMoeda = (valor: number) => centavos(valor) / 100;

const compararTexto = (a: string, b: string) => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
};

export function compararCotacao(
  itens: ItemCotacaoComparacao[],
  propostas: PropostaComparacao[],
  fornecedores: FornecedorComparacao[],
): ComparacaoCotacao {
  const ativos = new Map(fornecedores.filter(f => f.ativo !== false).map(f => [f.id, f]));
  const itemIds = new Set(itens.map(i => i.id));
  const validas = propostas.filter(p => ativos.has(p.fornecedor_id) && itemIds.has(p.cotacao_item_id)
    && Number.isFinite(Number(p.preco_unitario)) && Number(p.preco_unitario) >= 0);

  const comProposta = new Set(validas.map(p => p.fornecedor_id));
  const colunas = [...ativos.values()]
    .filter(f => comProposta.has(f.id))
    .sort((a, b) => compararTexto(a.nome, b.nome) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const ordenar = (a: PropostaComparacao, b: PropostaComparacao) => {
    const preco = centavos(a.preco_unitario) - centavos(b.preco_unitario);
    if (preco !== 0) return preco;
    const prazoA = a.prazo_dias ?? Number.POSITIVE_INFINITY;
    const prazoB = b.prazo_dias ?? Number.POSITIVE_INFINITY;
    if (prazoA !== prazoB) return prazoA < prazoB ? -1 : 1;
    const nome = compararTexto(ativos.get(a.fornecedor_id)!.nome, ativos.get(b.fornecedor_id)!.nome);
    if (nome !== 0) return nome;
    return a.fornecedor_id < b.fornecedor_id ? -1 : a.fornecedor_id > b.fornecedor_id ? 1 : 0;
  };

  const linhas: LinhaComparacao[] = itens.map(item => {
    const doItem = validas.filter(p => p.cotacao_item_id === item.id).sort(ordenar);
    const vencedora = doItem[0];
    const menor = vencedora ? centavos(vencedora.preco_unitario) : null;
    const celulas: Record<string, CelulaComparacao> = {};
    for (const p of doItem) {
      celulas[p.fornecedor_id] = {
        precoUnitario: arredondarMoeda(p.preco_unitario),
        prazoDias: p.prazo_dias ?? null,
        subtotal: arredondarMoeda(item.quantidade * p.preco_unitario),
        menorPreco: centavos(p.preco_unitario) === menor,
        vencedora: p === vencedora,
      };
    }
    return {
      item,
      celulas,
      vencedorId: vencedora?.fornecedor_id ?? null,
      menorPreco: menor === null ? null : menor / 100,
      empate: doItem.filter(p => centavos(p.preco_unitario) === menor).length > 1,
      semProposta: doItem.length === 0,
    };
  });

  const totais: TotalFornecedor[] = colunas.map(fornecedor => {
    let cotado = 0;
    let vencido = 0;
    let itensCotados = 0;
    let itensVencidos = 0;
    for (const linha of linhas) {
      const celula = linha.celulas[fornecedor.id];
      if (!celula) continue;
      cotado += centavos(celula.subtotal);
      itensCotados += 1;
      if (celula.vencedora) {
        vencido += centavos(celula.subtotal);
        itensVencidos += 1;
      }
    }
    return {
      fornecedor,
      totalCotado: cotado / 100,
      itensCotados,
      totalVencido: vencido / 100,
      itensVencidos,
      cotouTudo: itens.length > 0 && itensCotados === itens.length,
    };
  });

  const itensSemProposta = linhas.filter(l => l.semProposta).map(l => l.item);
  const totalMenorPreco = linhas.reduce((acc, l) => acc + (l.vencedorId ? centavos(l.celulas[l.vencedorId].subtotal) : 0), 0) / 100;

  return {
    fornecedores: colunas,
    linhas,
    totais,
    itensSemProposta,
    totalMenorPreco,
    podeGerarPedidos: itens.length > 0 && itensSemProposta.length === 0,
  };
}

/**
 * Quanto o menor preço por item economiza sobre o fornecedor mais caro entre os
 * que cotaram todos os itens. Sem ao menos um fornecedor completo não há base
 * honesta de comparação.
 */
export function economiaSobreMaisCaro(comparacao: ComparacaoCotacao): number | null {
  const completos = comparacao.totais.filter(t => t.cotouTudo);
  if (completos.length === 0 || comparacao.itensSemProposta.length > 0) return null;
  const maisCaro = Math.max(...completos.map(t => t.totalCotado));
  return Math.max(0, arredondarMoeda(maisCaro - comparacao.totalMenorPreco));
}

export const ROTULO_SITUACAO_COTACAO: Record<SituacaoCotacao, string> = {
  aberta: 'Aberta',
  fechada: 'Pedidos gerados',
  cancelada: 'Cancelada',
};

export const ROTULO_SITUACAO_PEDIDO: Record<SituacaoPedidoCompra, string> = {
  emitido: 'Emitido',
  recebido: 'Recebido',
  cancelado: 'Cancelado',
};

/** Itens em estoque baixo (no mínimo ou abaixo) com a quantidade sugerida para repor. */
export function itensParaCotar<T extends {
  id: string; nome: string; quantidade: number; quantidade_minima?: number | null;
  quantidade_maxima?: number | null; ponto_pedido?: number | null; unidade?: string | null;
}>(estoque: T[]) {
  return estoque
    .filter(p => Number(p.quantidade) <= Number(p.quantidade_minima || 0))
    .map(p => {
      const alvo = Number(p.quantidade_maxima || 0) > 0
        ? Number(p.quantidade_maxima)
        : Math.max(Number(p.ponto_pedido || 0), Number(p.quantidade_minima || 0)) * 2;
      return {
        estoque_id: p.id,
        descricao: p.nome,
        unidade: p.unidade ?? null,
        quantidade: Math.max(1, Math.round(alvo - Number(p.quantidade))),
      };
    });
}

export function normalizarCnpj(valor: string) {
  return valor.replace(/\D/g, '');
}

export function formatarCnpj(valor: string | null | undefined) {
  const d = normalizarCnpj(valor ?? '');
  if (d.length !== 14) return valor ?? '';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Aceita 12,50 · 1.234,50 · 12.50. Devolve null quando o texto não é um valor. */
export function lerPreco(texto: string): number | null {
  const compacto = texto.trim().replace(/\s/g, '').replace(/^R\$/i, '');
  if (!compacto) return null;
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(compacto) && !/^\d+(?:\.\d{1,2})?$/.test(compacto)) return null;
  const valor = Number(compacto.includes(',') ? compacto.replace(/\./g, '').replace(',', '.') : compacto);
  return Number.isFinite(valor) && valor <= 9_999_999_999.99 ? valor : null;
}
