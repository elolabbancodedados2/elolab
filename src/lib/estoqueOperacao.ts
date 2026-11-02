/**
 * Regras e formatações da tela de estoque que não dependem do React:
 * rótulos, filtros da URL, previsão de ruptura, Curva ABC, inventário,
 * exportação e saldo do histórico.
 */
import { classifyAbcItem, type AbcClass } from '@/lib/abcClassification';
import { formatCsvCell } from '@/lib/csv';

export const CATEGORIAS_ESTOQUE = ['medicamentos', 'materiais_hospitalares', 'epis', 'escritorio', 'limpeza', 'outros'] as const;
export const UNIDADES_ESTOQUE = ['unidade', 'comprimido', 'caixa', 'frasco', 'ampola', 'pacote', 'litro', 'kg', 'ml'] as const;

const ROTULOS_CATEGORIA: Record<string, string> = {
  medicamentos: 'Medicamentos',
  materiais_hospitalares: 'Materiais hospitalares',
  epis: 'EPIs',
  escritorio: 'Escritório',
  limpeza: 'Limpeza',
  outros: 'Outros',
};

const ROTULOS_UNIDADE: Record<string, string> = {
  unidade: 'Unidade',
  comprimido: 'Comprimido',
  caixa: 'Caixa',
  frasco: 'Frasco',
  ampola: 'Ampola',
  pacote: 'Pacote',
  litro: 'Litro',
  kg: 'kg',
  ml: 'mL',
  g: 'g',
  mg: 'mg',
};

const capitalizar = (texto: string) => {
  const limpo = texto.replace(/_/g, ' ').trim();
  return limpo ? limpo.charAt(0).toLocaleUpperCase('pt-BR') + limpo.slice(1) : '';
};

/** "epis" → "EPIs", "materiais_hospitalares" → "Materiais hospitalares". */
export function rotuloCategoriaEstoque(categoria: string | null | undefined): string {
  const chave = String(categoria ?? '').trim();
  return ROTULOS_CATEGORIA[chave] ?? capitalizar(chave);
}

/** "ml" → "mL", "kg" → "kg": unidades de medida não ganham maiúscula. */
export function rotuloUnidadeEstoque(unidade: string | null | undefined): string {
  const chave = String(unidade ?? '').trim();
  return ROTULOS_UNIDADE[chave.toLowerCase()] ?? chave;
}

export const FILTROS_ALERTA_ESTOQUE = ['todos', 'critico', 'vencidos', 'validade', 'ponto_pedido'] as const;
export type FiltroAlertaEstoque = typeof FILTROS_ALERTA_ESTOQUE[number];

/** Lê o `?alerta=` da URL aceitando os cinco filtros da tela. */
export function lerFiltroAlerta(valor: string | null | undefined): FiltroAlertaEstoque {
  return (FILTROS_ALERTA_ESTOQUE as readonly string[]).includes(String(valor)) ? valor as FiltroAlertaEstoque : 'todos';
}

interface ItemSaldo {
  id: string;
  nome: string;
  quantidade: number;
  quantidade_minima?: number | null;
  ponto_pedido?: number | null;
  valor_unitario?: number | null;
}

/** Mesmo critério de `itensParaCotar`: saldo no mínimo ou no ponto de pedido. */
export function precisaReposicao(item: ItemSaldo): boolean {
  return Number(item.quantidade) <= Math.max(Number(item.ponto_pedido || 0), Number(item.quantidade_minima || 0));
}

/** Leitor de código de barras: EAN-8, UPC-12, EAN-13 ou GTIN-14. */
export function pareceCodigoBarras(texto: string): boolean {
  return /^\d{8}$|^\d{12,14}$/.test(texto.trim());
}

// ─── Consumo e ruptura ─────────────────────────────────────────────────────

export interface MovimentacaoConsumo { item_id: string; tipo: string; quantidade: number }

export const DIAS_CONSUMO = 90;

/** Soma das saídas por item na janela carregada (padrão: 90 dias). */
export function consumoPorItem(movimentacoes: MovimentacaoConsumo[]): Map<string, number> {
  const total = new Map<string, number>();
  for (const mov of movimentacoes) {
    if (mov.tipo !== 'saida') continue;
    const quantidade = Number(mov.quantidade);
    if (!Number.isFinite(quantidade) || quantidade <= 0) continue;
    total.set(mov.item_id, (total.get(mov.item_id) ?? 0) + quantidade);
  }
  return total;
}

/** Quantos dias o saldo atual dura no ritmo médio de consumo. null quando não há consumo. */
export function diasAteRuptura(saldo: number, consumoNoPeriodo: number, dias = DIAS_CONSUMO): number | null {
  if (!(consumoNoPeriodo > 0) || dias <= 0) return null;
  const porDia = consumoNoPeriodo / dias;
  return Math.max(0, Math.floor(Number(saldo) / porDia));
}

/**
 * Quantidade para cobrir `cobertura` dias de consumo acima do mínimo.
 * Sem consumo registrado devolve 0 (a regra do mínimo/máximo decide).
 */
export function sugestaoPorConsumo(item: ItemSaldo, consumoNoPeriodo: number, cobertura = 30, dias = DIAS_CONSUMO): number {
  if (!(consumoNoPeriodo > 0)) return 0;
  const necessidade = (consumoNoPeriodo / dias) * cobertura + Number(item.quantidade_minima || 0);
  return Math.max(0, Math.ceil(necessidade - Number(item.quantidade)));
}

export function textoDuracao(dias: number | null): string | null {
  if (dias === null) return null;
  if (dias === 0) return 'acaba hoje no ritmo atual';
  return `dura ~${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

// ─── Curva ABC ─────────────────────────────────────────────────────────────

export type BaseAbc = 'valor' | 'consumo';

export interface LinhaAbc { id: string; nome: string; categoria: string; valor: number; percentAcc: number; classe: AbcClass }

/**
 * `valor`: dinheiro parado (saldo × custo). `consumo`: o que saiu em 90 dias × custo,
 * que mostra onde está o gasto de reposição.
 */
export function curvaAbc(
  itens: Array<ItemSaldo & { categoria: string }>,
  base: BaseAbc,
  consumo: Map<string, number> = new Map(),
): LinhaAbc[] {
  const linhas = itens.map(p => ({
    id: p.id,
    nome: p.nome,
    categoria: p.categoria,
    valor: (base === 'valor' ? Number(p.quantidade) : consumo.get(p.id) ?? 0) * Number(p.valor_unitario || 0),
  })).filter(l => l.valor > 0).sort((a, b) => b.valor - a.valor);
  const total = linhas.reduce((acc, l) => acc + l.valor, 0);
  if (total === 0) return [];
  let acumulado = 0;
  return linhas.map(linha => {
    const classe = classifyAbcItem(acumulado, total);
    acumulado += linha.valor;
    return { ...linha, percentAcc: Math.round((acumulado / total) * 100), classe };
  });
}

// ─── Inventário ────────────────────────────────────────────────────────────

export interface AjusteInventario { id: string; nome: string; sistema: number; contado: number; diferenca: number; tipo: 'entrada' | 'saida' }

/** Itens cuja contagem física difere do sistema. Contagem vazia ou inválida fica de fora. */
export function ajustesInventario(itens: ItemSaldo[], contagens: Record<string, string>): AjusteInventario[] {
  const ajustes: AjusteInventario[] = [];
  for (const item of itens) {
    const texto = contagens[item.id]?.trim();
    if (!texto || !/^\d+$/.test(texto)) continue;
    const contado = Number(texto);
    const sistema = Number(item.quantidade);
    if (!Number.isSafeInteger(contado) || contado === sistema) continue;
    ajustes.push({ id: item.id, nome: item.nome, sistema, contado, diferenca: contado - sistema, tipo: contado > sistema ? 'entrada' : 'saida' });
  }
  return ajustes;
}

// ─── Histórico ─────────────────────────────────────────────────────────────

/**
 * Saldo logo após cada movimentação, partindo do saldo atual e voltando no
 * tempo. Exige a lista em ordem decrescente e contígua a partir da mais recente.
 */
export function saldosAposMovimentacoes<T extends { tipo: string; quantidade: number }>(saldoAtual: number, movimentacoes: T[]): number[] {
  const saldos: number[] = [];
  let saldo = Number(saldoAtual);
  for (const mov of movimentacoes) {
    saldos.push(saldo);
    const quantidade = Number(mov.quantidade) || 0;
    saldo = mov.tipo === 'entrada' ? saldo - quantidade : saldo + quantidade;
  }
  return saldos;
}

// ─── Exportação ────────────────────────────────────────────────────────────

export interface ItemPosicao extends ItemSaldo {
  categoria: string;
  unidade?: string | null;
  lote?: string | null;
  validade?: string | null;
  localizacao?: string | null;
  fornecedor?: string | null;
  codigo_ean?: string | null;
}

const formatarDataIso = (valor: string | null | undefined) => {
  const iso = valor?.slice(0, 10);
  return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
};

/** Linhas da posição do estoque com cabeçalhos em português (Excel e CSV usam as mesmas). */
export function linhasPosicaoEstoque(itens: ItemPosicao[]): Array<Record<string, string | number>> {
  return itens.map(item => {
    const custo = Number(item.valor_unitario || 0);
    return {
      Produto: item.nome,
      Categoria: rotuloCategoriaEstoque(item.categoria),
      'Código EAN': item.codigo_ean ?? '',
      Saldo: Number(item.quantidade),
      Unidade: rotuloUnidadeEstoque(item.unidade ?? 'unidade'),
      Mínimo: Number(item.quantidade_minima || 0),
      'Ponto de pedido': item.ponto_pedido ?? '',
      Lote: item.lote ?? '',
      Validade: formatarDataIso(item.validade),
      Localização: item.localizacao ?? '',
      Fornecedor: item.fornecedor ?? '',
      'Custo unitário (R$)': Math.round(custo * 100) / 100,
      'Valor em estoque (R$)': Math.round(custo * Number(item.quantidade) * 100) / 100,
      Situação: precisaReposicao(item) ? 'Repor' : 'OK',
    };
  });
}

/** CSV com ponto e vírgula e BOM, que o Excel em português abre com acentos. */
export function csvPosicaoEstoque(itens: ItemPosicao[]): string {
  const linhas = linhasPosicaoEstoque(itens);
  const cabecalho = linhas[0] ? Object.keys(linhas[0]) : Object.keys(linhasPosicaoEstoque([{ id: '', nome: '', quantidade: 0, categoria: '' }])[0]);
  const corpo = linhas.map(linha => cabecalho.map(chave => {
    const valor = linha[chave];
    return formatCsvCell(typeof valor === 'number' ? String(valor).replace('.', ',') : valor);
  }).join(';'));
  return `\uFEFF${[cabecalho.map(formatCsvCell).join(';'), ...corpo].join('\r\n')}`;
}

/** Motivo pré-preenchido para descartar um item vencido. */
export function motivoDescarteVencido(validade: string | null | undefined): string {
  const data = formatarDataIso(validade);
  return data ? `Descarte por vencimento (validade ${data})` : 'Descarte por vencimento';
}
