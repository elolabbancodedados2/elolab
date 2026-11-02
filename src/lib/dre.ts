/**
 * DRE gerencial montada a partir do plano de contas.
 *
 * Tudo aqui é função pura: a tela busca contas, vínculos de categoria e os
 * valores realizados (pagos) e esta biblioteca monta a cascata.
 *
 * Critério dos valores: o mesmo do Painel Financeiro. Cada pagamento conta na
 * data em que entrou (e o estorno, negativo, na data do estorno). Lançamentos
 * antigos pagos sem registro em `pagamentos` contam pelo valor realizado na
 * data de pagamento (ou na data do lançamento, se não houver).
 */
import { formatCsvCell } from '@/lib/csv';
import { dateOnlyInTimeZone } from '@/lib/dateOnly';
import { valorRealizado } from '@/lib/lancamentos';
import { normalizarCategoria, rotuloCategoria } from '@/lib/financeiroRotulos';

export const GRUPOS_DRE = [
  'receita_bruta',
  'deducoes',
  'custos_servicos',
  'despesas_pessoal',
  'despesas_administrativas',
  'despesas_ocupacao',
  'despesas_marketing',
  'resultado_financeiro',
  'outras',
] as const;
export type GrupoDre = typeof GRUPOS_DRE[number];
export type NaturezaConta = 'receita' | 'despesa';

export const ROTULO_GRUPO_DRE: Record<GrupoDre, string> = {
  receita_bruta: 'Receita bruta',
  deducoes: 'Deduções',
  custos_servicos: 'Custos dos serviços',
  despesas_pessoal: 'Despesas com pessoal',
  despesas_administrativas: 'Despesas administrativas',
  despesas_ocupacao: 'Despesas de ocupação',
  despesas_marketing: 'Despesas de marketing',
  resultado_financeiro: 'Resultado financeiro',
  outras: 'Outras receitas e despesas',
};

/** Nomes legíveis das categorias: a tabela única fica em `financeiroRotulos`. */
export { rotuloCategoria };

/** Naturezas aceitas em cada grupo (espelha o CHECK da migration). */
export const NATUREZAS_DO_GRUPO: Record<GrupoDre, NaturezaConta[]> = {
  receita_bruta: ['receita'],
  deducoes: ['despesa'],
  custos_servicos: ['despesa'],
  despesas_pessoal: ['despesa'],
  despesas_administrativas: ['despesa'],
  despesas_ocupacao: ['despesa'],
  despesas_marketing: ['despesa'],
  resultado_financeiro: ['receita', 'despesa'],
  outras: ['receita', 'despesa'],
};

export interface ContaPlano {
  id: string;
  codigo: string;
  nome: string;
  natureza: NaturezaConta;
  grupo_dre: GrupoDre;
  pai_id: string | null;
  ativo: boolean;
}

export interface VinculoCategoria {
  natureza: NaturezaConta;
  categoria: string;
  conta_id: string;
}

export interface EventoRealizado {
  id: string;
  lancamentoId: string;
  tipo: string;
  categoria: string;
  /** Data local (America/Sao_Paulo) no formato YYYY-MM-DD. */
  data: string;
  /** Positivo para pagamento, negativo para estorno. */
  valor: number;
}

export interface LancamentoRealizavel {
  id: string;
  tipo: string;
  categoria: string | null;
  status: string | null;
  valor: number | string;
  valor_pago?: number | string | null;
  data: string;
  data_pagamento: string | null;
  data_vencimento?: string | null;
  competencia?: string | null;
  data_emissao?: string | null;
  desconto?: number | string | null;
  acrescimo?: number | string | null;
}

export interface PagamentoRealizado {
  id: string;
  lancamento_id: string;
  valor: number | string;
  data_pagamento: string;
  estornado_em: string | null;
  lancamentos: { tipo: string; categoria: string | null } | Array<{ tipo: string; categoria: string | null }> | null;
}

const FUSO = 'America/Sao_Paulo';

const paraDataLocal = (valor: string) => (valor.includes('T') || valor.includes(' ')
  ? dateOnlyInTimeZone(new Date(valor), FUSO)
  : valor.slice(0, 10));

/**
 * Eventos realizados no intervalo [inicio, fimExclusivo), datas YYYY-MM-DD.
 * Reproduz o critério do Painel Financeiro (`src/pages/Financeiro.tsx`).
 */
export function montarEventosRealizados(
  pagamentos: ReadonlyArray<PagamentoRealizado>,
  lancamentos: ReadonlyArray<LancamentoRealizavel>,
  inicio: string,
  fimExclusivo: string,
): EventoRealizado[] {
  const dentro = (data: string) => data >= inicio && data < fimExclusivo;
  const idsComPagamento = new Set(pagamentos.map(p => p.lancamento_id));

  const individuais = pagamentos.flatMap(pagamento => {
    const conta = Array.isArray(pagamento.lancamentos) ? pagamento.lancamentos[0] : pagamento.lancamentos;
    if (!conta || !['receita', 'despesa'].includes(conta.tipo)) return [];
    const eventos: EventoRealizado[] = [];
    const categoria = normalizarCategoria(conta.categoria);
    const dataPagamento = paraDataLocal(pagamento.data_pagamento);
    if (dentro(dataPagamento)) eventos.push({
      id: pagamento.id, lancamentoId: pagamento.lancamento_id, tipo: conta.tipo, categoria,
      data: dataPagamento, valor: Number(pagamento.valor) || 0,
    });
    if (pagamento.estornado_em) {
      const dataEstorno = paraDataLocal(pagamento.estornado_em);
      if (dentro(dataEstorno)) eventos.push({
        id: `${pagamento.id}:estorno`, lancamentoId: pagamento.lancamento_id, tipo: conta.tipo, categoria,
        data: dataEstorno, valor: -(Number(pagamento.valor) || 0),
      });
    }
    return eventos;
  });

  const legados = lancamentos
    .filter(l => (l.status === 'pago' || l.status === 'parcial') && !idsComPagamento.has(l.id))
    .filter(l => l.tipo === 'receita' || l.tipo === 'despesa')
    .flatMap(l => {
      const data = paraDataLocal(l.data_pagamento || l.data);
      return dentro(data)
        ? [{ id: l.id, lancamentoId: l.id, tipo: l.tipo, categoria: normalizarCategoria(l.categoria), data, valor: valorRealizado(l) }]
        : [];
    });

  return [...legados, ...individuais];
}

export const chaveCategoria = (natureza: string, categoria: string) => `${natureza}:${categoria}`;

export interface CategoriaSemConta {
  natureza: NaturezaConta;
  categoria: string;
  valor: number;
  lancamentos: number;
}

export interface AgregadoPorConta {
  porConta: Map<string, number>;
  semConta: CategoriaSemConta[];
  /** Lançamentos distintos sem conta. */
  lancamentosSemConta: number;
  valorSemConta: number;
}

/** Soma os eventos por conta e separa o que não tem conta. */
export function agregarPorConta(
  eventos: ReadonlyArray<EventoRealizado>,
  contas: ReadonlyArray<ContaPlano>,
  vinculos: ReadonlyArray<VinculoCategoria>,
): AgregadoPorConta {
  const contasPorId = new Map(contas.map(c => [c.id, c]));
  const contaDaCategoria = new Map<string, string>();
  for (const v of vinculos) {
    const conta = contasPorId.get(v.conta_id);
    if (conta && conta.natureza === v.natureza) contaDaCategoria.set(chaveCategoria(v.natureza, normalizarCategoria(v.categoria)), v.conta_id);
  }

  const porConta = new Map<string, number>();
  const semConta = new Map<string, CategoriaSemConta & { ids: Set<string> }>();
  const idsSemConta = new Set<string>();
  for (const evento of eventos) {
    if (evento.tipo !== 'receita' && evento.tipo !== 'despesa') continue;
    const chave = chaveCategoria(evento.tipo, evento.categoria);
    const contaId = contaDaCategoria.get(chave);
    if (contaId) {
      porConta.set(contaId, (porConta.get(contaId) ?? 0) + evento.valor);
      continue;
    }
    const atual = semConta.get(chave) ?? { natureza: evento.tipo, categoria: evento.categoria, valor: 0, lancamentos: 0, ids: new Set<string>() };
    atual.valor += evento.valor;
    atual.ids.add(evento.lancamentoId);
    atual.lancamentos = atual.ids.size;
    semConta.set(chave, atual);
    idsSemConta.add(evento.lancamentoId);
  }

  const lista = [...semConta.values()]
    .map(item => ({ natureza: item.natureza, categoria: item.categoria, valor: item.valor, lancamentos: item.lancamentos }))
    .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
  return {
    porConta,
    semConta: lista,
    lancamentosSemConta: idsSemConta.size,
    valorSemConta: lista.reduce((total, item) => total + (item.natureza === 'receita' ? item.valor : -item.valor), 0),
  };
}

/** Variação percentual sobre o valor anterior; null quando não há base. */
export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (!Number.isFinite(atual) || !Number.isFinite(anterior) || Math.abs(anterior) < 0.005) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

/** Margem sobre a receita líquida; null quando a receita líquida não é positiva. */
export function margemSobreReceitaLiquida(valor: number, receitaLiquida: number): number | null {
  if (!Number.isFinite(valor) || !(receitaLiquida > 0.005)) return null;
  return (valor / receitaLiquida) * 100;
}

export interface LinhaContaDre {
  contaId: string;
  codigo: string;
  nome: string;
  valor: number;
  anterior: number;
  variacao: number | null;
  margem: number | null;
}

export type IdLinhaDre =
  | GrupoDre
  | 'receita_liquida'
  | 'lucro_bruto'
  | 'resultado_operacional'
  | 'resultado_liquido';

export interface LinhaDre {
  id: IdLinhaDre;
  rotulo: string;
  tipo: 'grupo' | 'subtotal';
  /** Valor com sinal no resultado: receitas positivas, despesas negativas. */
  valor: number;
  anterior: number;
  variacao: number | null;
  margem: number | null;
  contas: LinhaContaDre[];
}

export interface Dre {
  linhas: LinhaDre[];
  receitaLiquida: number;
  resultadoLiquido: number;
  semConta: CategoriaSemConta[];
  lancamentosSemConta: number;
  valorSemConta: number;
}

const ESTRUTURA: Array<{ id: IdLinhaDre; rotulo: string; tipo: 'grupo' | 'subtotal' }> = [
  { id: 'receita_bruta', rotulo: 'Receita bruta', tipo: 'grupo' },
  { id: 'deducoes', rotulo: '(−) Deduções', tipo: 'grupo' },
  { id: 'receita_liquida', rotulo: '= Receita líquida', tipo: 'subtotal' },
  { id: 'custos_servicos', rotulo: '(−) Custos dos serviços', tipo: 'grupo' },
  { id: 'lucro_bruto', rotulo: '= Lucro bruto', tipo: 'subtotal' },
  { id: 'despesas_pessoal', rotulo: '(−) Despesas operacionais · Pessoal', tipo: 'grupo' },
  { id: 'despesas_administrativas', rotulo: '(−) Despesas operacionais · Administrativas', tipo: 'grupo' },
  { id: 'despesas_ocupacao', rotulo: '(−) Despesas operacionais · Ocupação', tipo: 'grupo' },
  { id: 'despesas_marketing', rotulo: '(−) Despesas operacionais · Marketing', tipo: 'grupo' },
  { id: 'resultado_operacional', rotulo: '= Resultado operacional', tipo: 'subtotal' },
  { id: 'resultado_financeiro', rotulo: '(±) Resultado financeiro', tipo: 'grupo' },
  { id: 'outras', rotulo: '(±) Outras receitas e despesas', tipo: 'grupo' },
  { id: 'resultado_liquido', rotulo: '= Resultado líquido', tipo: 'subtotal' },
];

const SUBTOTAIS: Record<'receita_liquida' | 'lucro_bruto' | 'resultado_operacional' | 'resultado_liquido', GrupoDre[]> = {
  receita_liquida: ['receita_bruta', 'deducoes'],
  lucro_bruto: ['receita_bruta', 'deducoes', 'custos_servicos'],
  resultado_operacional: ['receita_bruta', 'deducoes', 'custos_servicos', 'despesas_pessoal',
    'despesas_administrativas', 'despesas_ocupacao', 'despesas_marketing'],
  resultado_liquido: [...GRUPOS_DRE],
};

const arredondar = (n: number) => Math.round(n * 100) / 100;

/**
 * Monta a cascata da DRE da competência atual comparada à anterior.
 * Recebe os eventos já filtrados de cada mês.
 */
export function montarDre(input: {
  contas: ReadonlyArray<ContaPlano>;
  vinculos: ReadonlyArray<VinculoCategoria>;
  eventosMes: ReadonlyArray<EventoRealizado>;
  eventosMesAnterior: ReadonlyArray<EventoRealizado>;
}): Dre {
  const atual = agregarPorConta(input.eventosMes, input.contas, input.vinculos);
  const anterior = agregarPorConta(input.eventosMesAnterior, input.contas, input.vinculos);
  const sinal = (conta: ContaPlano) => (conta.natureza === 'receita' ? 1 : -1);

  const contasOrdenadas = [...input.contas].sort((a, b) => compararCodigo(a.codigo, b.codigo));
  const totaisGrupo = (mapa: Map<string, number>) => {
    const totais = Object.fromEntries(GRUPOS_DRE.map(g => [g, 0])) as Record<GrupoDre, number>;
    for (const conta of input.contas) {
      totais[conta.grupo_dre] += sinal(conta) * (mapa.get(conta.id) ?? 0);
    }
    return totais;
  };
  const gruposAtual = totaisGrupo(atual.porConta);
  const gruposAnterior = totaisGrupo(anterior.porConta);
  const somar = (totais: Record<GrupoDre, number>, grupos: GrupoDre[]) => grupos.reduce((t, g) => t + totais[g], 0);

  const receitaLiquida = arredondar(somar(gruposAtual, SUBTOTAIS.receita_liquida));

  const linhas = ESTRUTURA.map<LinhaDre>(item => {
    if (item.tipo === 'subtotal') {
      const grupos = SUBTOTAIS[item.id as keyof typeof SUBTOTAIS];
      const valor = arredondar(somar(gruposAtual, grupos));
      const valorAnterior = arredondar(somar(gruposAnterior, grupos));
      return {
        ...item, valor, anterior: valorAnterior,
        variacao: variacaoPercentual(valor, valorAnterior),
        margem: margemSobreReceitaLiquida(valor, receitaLiquida),
        contas: [],
      };
    }
    const grupo = item.id as GrupoDre;
    const contas = contasOrdenadas
      .filter(conta => conta.grupo_dre === grupo)
      .map<LinhaContaDre>(conta => {
        const valor = arredondar(sinal(conta) * (atual.porConta.get(conta.id) ?? 0));
        const valorAnterior = arredondar(sinal(conta) * (anterior.porConta.get(conta.id) ?? 0));
        return {
          contaId: conta.id, codigo: conta.codigo, nome: conta.nome, valor, anterior: valorAnterior,
          variacao: variacaoPercentual(valor, valorAnterior),
          margem: margemSobreReceitaLiquida(valor, receitaLiquida),
        };
      })
      .filter(linha => linha.valor !== 0 || linha.anterior !== 0);
    const valor = arredondar(gruposAtual[grupo]);
    const valorAnterior = arredondar(gruposAnterior[grupo]);
    return {
      ...item, valor, anterior: valorAnterior,
      variacao: variacaoPercentual(valor, valorAnterior),
      margem: margemSobreReceitaLiquida(valor, receitaLiquida),
      contas,
    };
  });

  return {
    linhas,
    receitaLiquida,
    resultadoLiquido: linhas[linhas.length - 1].valor,
    semConta: atual.semConta,
    lancamentosSemConta: atual.lancamentosSemConta,
    valorSemConta: arredondar(atual.valorSemConta),
  };
}

/** Ordena códigos como 1, 1.2, 1.10, 2 (numérico por segmento). */
export function compararCodigo(a: string, b: string): number {
  const pa = a.split('.');
  const pb = b.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const na = Number(pa[i]);
    const nb = Number(pb[i]);
    const diff = Number.isFinite(na) && Number.isFinite(nb) ? na - nb : pa[i].localeCompare(pb[i], 'pt-BR');
    if (diff !== 0) return diff;
  }
  return 0;
}

export interface NoArvoreConta {
  conta: ContaPlano;
  nivel: number;
}

/** Achata o plano em ordem de árvore (pai antes dos filhos). Órfãos ficam na raiz. */
export function arvoreDeContas(contas: ReadonlyArray<ContaPlano>): NoArvoreConta[] {
  const ids = new Set(contas.map(c => c.id));
  const filhos = new Map<string | null, ContaPlano[]>();
  for (const conta of contas) {
    const pai = conta.pai_id && ids.has(conta.pai_id) && conta.pai_id !== conta.id ? conta.pai_id : null;
    filhos.set(pai, [...(filhos.get(pai) ?? []), conta]);
  }
  const resultado: NoArvoreConta[] = [];
  const visitados = new Set<string>();
  const visitar = (pai: string | null, nivel: number) => {
    for (const conta of [...(filhos.get(pai) ?? [])].sort((a, b) => compararCodigo(a.codigo, b.codigo))) {
      if (visitados.has(conta.id)) continue;
      visitados.add(conta.id);
      resultado.push({ conta, nivel });
      visitar(conta.id, nivel + 1);
    }
  };
  visitar(null, 0);
  // Ciclo vindo de dados inconsistentes: mostra o que sobrou na raiz.
  for (const conta of contas) if (!visitados.has(conta.id)) resultado.push({ conta, nivel: 0 });
  return resultado;
}

// Números saem sem a proteção contra fórmula (que prefixaria "'" nos negativos):
// vêm de cálculo, não de texto digitado.
const numeroCsv = (n: number | null) => (n === null ? '""' : `"${n.toFixed(2).replace('.', ',')}"`);

/** CSV (separado por ponto e vírgula) com as linhas e as contas de cada grupo. */
export function dreParaCsv(dre: Dre, competencia: string, competenciaAnterior: string): string {
  const texto = (valor: string) => formatCsvCell(valor);
  const cabecalho = ['Linha', 'Conta', `Valor ${competencia}`, `Valor ${competenciaAnterior}`, 'Variação %', 'Margem % s/ receita líquida']
    .map(texto).join(';');
  const linhas: string[] = [];
  const montar = (rotulo: string, conta: string, l: { valor: number; anterior: number | null; variacao: number | null; margem: number | null }) =>
    [texto(rotulo), texto(conta), numeroCsv(l.valor), numeroCsv(l.anterior), numeroCsv(l.variacao), numeroCsv(l.margem)].join(';');
  for (const linha of dre.linhas) {
    linhas.push(montar(linha.rotulo, '', linha));
    for (const conta of linha.contas) linhas.push(montar(linha.rotulo, `${conta.codigo} ${conta.nome}`, conta));
  }
  if (dre.lancamentosSemConta > 0) {
    linhas.push(montar('Sem conta (fora da DRE)', `${dre.lancamentosSemConta} lançamentos`,
      { valor: dre.valorSemConta, anterior: null, variacao: null, margem: null }));
  }
  return [cabecalho, ...linhas].join('\r\n');
}

const MES = /^\d{4}-(0[1-9]|1[0-2])/;

/** Mês (AAAA-MM) a que o lançamento pertence: competência, emissão, vencimento, data. */
export function mesDeCompetencia(l: Pick<LancamentoRealizavel, 'competencia' | 'data_emissao' | 'data_vencimento' | 'data'>): string | null {
  for (const valor of [l.competencia, l.data_emissao, l.data_vencimento, l.data]) {
    const mes = MES.exec(valor ?? '')?.[0];
    if (mes) return mes;
  }
  return null;
}

const FORA_DA_COMPETENCIA = new Set(['cancelado', 'estornado']);

/**
 * Eventos por competência: cada lançamento entra no mês a que pertence
 * (`competencia`; sem ela, a data de emissão, o vencimento e por fim a data
 * do lançamento), pelo valor
 * líquido de desconto e acréscimo, pago ou não. Cancelados e estornados ficam
 * de fora. É a visão do resultado econômico; a de caixa continua sendo a
 * de `montarEventosRealizados`.
 */
export function montarEventosCompetencia(lancamentos: ReadonlyArray<LancamentoRealizavel>): EventoRealizado[] {
  return lancamentos.flatMap(l => {
    if (l.tipo !== 'receita' && l.tipo !== 'despesa') return [];
    if (FORA_DA_COMPETENCIA.has(String(l.status ?? ''))) return [];
    const mes = mesDeCompetencia(l);
    if (!mes) return [];
    const valor = (Number(l.valor) || 0) - (Number(l.desconto) || 0) + (Number(l.acrescimo) || 0);
    return [{ id: `${l.id}:competencia`, lancamentoId: l.id, tipo: l.tipo, categoria: normalizarCategoria(l.categoria), data: `${mes}-01`, valor }];
  });
}

export interface LinhaDreAnual {
  id: IdLinhaDre;
  rotulo: string;
  tipo: 'grupo' | 'subtotal';
  /** Doze valores, de janeiro a dezembro. */
  valores: number[];
  total: number;
}

export interface DreAnual {
  ano: number;
  meses: string[];
  linhas: LinhaDreAnual[];
}

/**
 * DRE do ano em doze colunas: a mesma cascata de `montarDre`, mês a mês.
 * Recebe os eventos do ano inteiro (caixa ou competência).
 */
export function montarDreAnual(input: {
  ano: number;
  contas: ReadonlyArray<ContaPlano>;
  vinculos: ReadonlyArray<VinculoCategoria>;
  eventos: ReadonlyArray<EventoRealizado>;
}): DreAnual {
  const meses = Array.from({ length: 12 }, (_, i) => `${input.ano}-${String(i + 1).padStart(2, '0')}`);
  const porMes = new Map<string, EventoRealizado[]>(meses.map(m => [m, []]));
  for (const evento of input.eventos) porMes.get(evento.data.slice(0, 7))?.push(evento);
  const dres = meses.map(m => montarDre({ contas: input.contas, vinculos: input.vinculos, eventosMes: porMes.get(m)!, eventosMesAnterior: [] }));
  const linhas = ESTRUTURA.map<LinhaDreAnual>((item, indice) => {
    const valores = dres.map(dre => dre.linhas[indice].valor);
    return { ...item, valores, total: arredondar(valores.reduce((t, v) => t + v, 0)) };
  });
  return { ano: input.ano, meses, linhas };
}

/** Eventos que compõem uma conta do plano, do maior para o menor valor. */
export function eventosDaConta(
  eventos: ReadonlyArray<EventoRealizado>,
  contaId: string,
  contas: ReadonlyArray<ContaPlano>,
  vinculos: ReadonlyArray<VinculoCategoria>,
): EventoRealizado[] {
  const conta = contas.find(c => c.id === contaId);
  if (!conta) return [];
  const categorias = new Set(vinculos
    .filter(v => v.conta_id === contaId && v.natureza === conta.natureza)
    .map(v => normalizarCategoria(v.categoria)));
  return eventos
    .filter(e => e.tipo === conta.natureza && categorias.has(e.categoria))
    .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor) || a.data.localeCompare(b.data));
}

/** CSV da DRE anual (separado por ponto e vírgula). */
export function dreAnualParaCsv(dre: DreAnual): string {
  const cabecalho = ['Linha', ...dre.meses, `Total ${dre.ano}`].map(v => formatCsvCell(v)).join(';');
  const linhas = dre.linhas.map(l => [formatCsvCell(l.rotulo), ...l.valores.map(numeroCsv), numeroCsv(l.total)].join(';'));
  return [cabecalho, ...linhas].join('\r\n');
}
