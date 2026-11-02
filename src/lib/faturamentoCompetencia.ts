import { formatCsvCell } from '@/lib/csv';
import { emCentavos } from '@/lib/dinheiro';

export type SituacaoFaturamento = 'faturados' | 'todos_exceto_cancelados' | 'todos';

export const SITUACOES_FATURAMENTO: Record<SituacaoFaturamento, { label: string; status: string[] | null }> = {
  faturados: { label: 'Faturados (enviados, em processamento, pagos ou rejeitados)', status: ['enviado', 'processando', 'pago_parcial', 'pago', 'rejeitado'] },
  todos_exceto_cancelados: { label: 'Todos, exceto cancelados (inclui rascunhos)', status: ['rascunho', 'enviado', 'processando', 'pago_parcial', 'pago', 'rejeitado'] },
  todos: { label: 'Todos, inclusive cancelados', status: null },
};

export interface FiltrosFaturamento {
  competenciaInicial: string; // YYYY-MM
  competenciaFinal: string; // YYYY-MM
  convenioId: string | 'todos';
  situacao: SituacaoFaturamento;
}

export interface LoteFaturamento {
  id: string;
  numero_lote: string;
  competencia: string; // YYYY-MM-DD
  convenio_id: string;
  convenio_nome: string;
  status: string;
  quantidade_guias: number;
  valor_apresentado: number;
  valor_pago: number;
}

export interface GlosaFaturamento { lote_id: string; status: string; valor_glosado: number; valor_recuperado: number }

const CAMPOS = ['apresentado', 'recebido', 'glosado', 'recuperado', 'aReceber'] as const;
type Valores = Record<(typeof CAMPOS)[number], number>;
export type LinhaFaturamento = { competencia: string; convenio: string; lotes: number; guias: number } & Valores;
export type TotaisFaturamento = { lotes: number; guias: number } & Valores;

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Totais por competência e convênio calculados em centavos e em ordem fixa,
 * para que a mesma seleção de filtros produza sempre o mesmo resultado.
 */
export function relatorioFaturamentoCompetencia(
  lotes: ReadonlyArray<LoteFaturamento>,
  glosas: ReadonlyArray<GlosaFaturamento>,
  filtros: FiltrosFaturamento,
) {
  const vazio = { linhas: [] as LinhaFaturamento[], totais: null as TotaisFaturamento | null, lotes: [] as LoteFaturamento[] };
  if (!MES.test(filtros.competenciaInicial) || !MES.test(filtros.competenciaFinal)) {
    return { ...vazio, erro: 'Informe competências inicial e final válidas.' };
  }
  if (filtros.competenciaInicial > filtros.competenciaFinal) {
    return { ...vazio, erro: 'A competência inicial deve ser igual ou anterior à final.' };
  }
  const status = SITUACOES_FATURAMENTO[filtros.situacao].status;
  const incluidos = lotes
    .filter((l) => {
      const mes = l.competencia.slice(0, 7);
      return mes >= filtros.competenciaInicial && mes <= filtros.competenciaFinal
        && (filtros.convenioId === 'todos' || l.convenio_id === filtros.convenioId)
        && (!status || status.includes(l.status));
    })
    .sort((a, b) => a.competencia.localeCompare(b.competencia)
      || a.convenio_nome.localeCompare(b.convenio_nome, 'pt-BR')
      || a.numero_lote.localeCompare(b.numero_lote, 'pt-BR', { numeric: true })
      || a.id.localeCompare(b.id));

  const glosaPorLote = new Map<string, { glosado: number; recuperado: number }>();
  for (const g of glosas) {
    if (g.status === 'cancelada') continue;
    const atual = glosaPorLote.get(g.lote_id) ?? { glosado: 0, recuperado: 0 };
    atual.glosado += emCentavos(g.valor_glosado);
    atual.recuperado += emCentavos(g.valor_recuperado);
    glosaPorLote.set(g.lote_id, atual);
  }

  const grupos = new Map<string, LinhaFaturamento>();
  const total: TotaisFaturamento = { lotes: 0, guias: 0, apresentado: 0, recebido: 0, glosado: 0, recuperado: 0, aReceber: 0 };
  for (const l of incluidos) {
    const chave = `${l.competencia.slice(0, 7)}|${l.convenio_nome}`;
    const linha = grupos.get(chave) ?? { competencia: l.competencia.slice(0, 7), convenio: l.convenio_nome, lotes: 0, guias: 0, apresentado: 0, recebido: 0, glosado: 0, recuperado: 0, aReceber: 0 };
    const glosa = glosaPorLote.get(l.id) ?? { glosado: 0, recuperado: 0 };
    const valores: Valores = {
      apresentado: emCentavos(l.valor_apresentado),
      recebido: emCentavos(l.valor_pago),
      glosado: glosa.glosado,
      recuperado: glosa.recuperado,
      aReceber: Math.max(0, emCentavos(l.valor_apresentado) - emCentavos(l.valor_pago)),
    };
    for (const alvo of [linha, total]) {
      alvo.lotes += 1;
      alvo.guias += Number(l.quantidade_guias) || 0;
      for (const campo of CAMPOS) alvo[campo] += valores[campo];
    }
    grupos.set(chave, linha);
  }
  const emReais = <T extends Valores>(v: T): T => ({ ...v, ...Object.fromEntries(CAMPOS.map((c) => [c, v[c] / 100])) });
  return {
    erro: null,
    lotes: incluidos,
    linhas: [...grupos.values()].map(emReais),
    totais: incluidos.length ? emReais(total) : null,
  };
}

const reais = (valor: number) => valor.toFixed(2).replace('.', ',');
const mesBr = (mes: string) => `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;

export function csvFaturamentoCompetencia(
  relatorio: ReturnType<typeof relatorioFaturamentoCompetencia>,
  filtros: FiltrosFaturamento,
  convenioNome: string,
): string {
  const linhas: unknown[][] = [
    ['Relatório de faturamento por competência'],
    ['Competência', `${mesBr(filtros.competenciaInicial)} a ${mesBr(filtros.competenciaFinal)}`],
    ['Convênio', convenioNome],
    ['Situação', SITUACOES_FATURAMENTO[filtros.situacao].label],
    ['Glosas', 'Somadas exceto canceladas; a receber = apresentado - recebido'],
    [],
    ['Competência', 'Convênio', 'Lotes', 'Guias', 'Apresentado', 'Recebido', 'Glosado', 'Recuperado', 'A receber'],
    ...relatorio.linhas.map((l) => [mesBr(l.competencia), l.convenio, l.lotes, l.guias, ...CAMPOS.map((c) => reais(l[c]))]),
  ];
  if (relatorio.totais) {
    const t = relatorio.totais;
    linhas.push(['Total', '', t.lotes, t.guias, ...CAMPOS.map((c) => reais(t[c]))]);
  }
  linhas.push([], ['Lotes incluídos'], ['Lote', 'Convênio', 'Competência', 'Status', 'Guias', 'Apresentado', 'Recebido']);
  for (const l of relatorio.lotes) {
    linhas.push([l.numero_lote, l.convenio_nome, mesBr(l.competencia.slice(0, 7)), l.status.replace(/_/g, ' '), l.quantidade_guias, reais(Number(l.valor_apresentado)), reais(Number(l.valor_pago))]);
  }
  return linhas.map((linha) => linha.map(formatCsvCell).join(';')).join('\r\n');
}

export interface GlosaAnalise extends GlosaFaturamento { codigo_glosa?: string | null; motivo?: string | null }
export interface LinhaAnaliseGlosa {
  convenio: string;
  codigo: string;
  motivo: string;
  quantidade: number;
  glosado: number;
  recuperado: number;
  perdido: number;
}

/**
 * Glosas dos lotes do relatório agrupadas por convênio e código do motivo,
 * da maior perda para a menor. Canceladas ficam de fora, como nos totais.
 */
export function analiseGlosasPorMotivo(
  lotesIncluidos: ReadonlyArray<LoteFaturamento>,
  glosas: ReadonlyArray<GlosaAnalise>,
): LinhaAnaliseGlosa[] {
  const convenioDoLote = new Map(lotesIncluidos.map((l) => [l.id, l.convenio_nome]));
  const grupos = new Map<string, { convenio: string; codigo: string; motivo: string; quantidade: number; glosado: number; recuperado: number }>();
  for (const g of glosas) {
    if (g.status === 'cancelada') continue;
    const convenio = convenioDoLote.get(g.lote_id);
    if (!convenio) continue;
    const codigo = (g.codigo_glosa ?? '').trim() || 'Sem código';
    const chave = `${convenio}|${codigo}`;
    const atual = grupos.get(chave) ?? { convenio, codigo, motivo: (g.motivo ?? '').trim(), quantidade: 0, glosado: 0, recuperado: 0 };
    atual.quantidade += 1;
    atual.glosado += emCentavos(g.valor_glosado);
    atual.recuperado += emCentavos(g.valor_recuperado);
    if (!atual.motivo && g.motivo) atual.motivo = g.motivo.trim();
    grupos.set(chave, atual);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, glosado: g.glosado / 100, recuperado: g.recuperado / 100, perdido: Math.max(0, g.glosado - g.recuperado) / 100 }))
    .sort((a, b) => b.perdido - a.perdido || a.convenio.localeCompare(b.convenio, 'pt-BR') || a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
}

export function csvAnaliseGlosas(linhas: ReadonlyArray<LinhaAnaliseGlosa>, filtros: FiltrosFaturamento, convenioNome: string): string {
  const tabela: unknown[][] = [
    ['Análise de glosas por convênio e motivo'],
    ['Competência', `${mesBr(filtros.competenciaInicial)} a ${mesBr(filtros.competenciaFinal)}`],
    ['Convênio', convenioNome],
    [],
    ['Convênio', 'Código', 'Motivo', 'Glosas', 'Glosado', 'Recuperado', 'Perdido'],
    ...linhas.map((l) => [l.convenio, l.codigo, l.motivo, l.quantidade, reais(l.glosado), reais(l.recuperado), reais(l.perdido)]),
  ];
  return tabela.map((linha) => linha.map(formatCsvCell).join(';')).join('\r\n');
}
