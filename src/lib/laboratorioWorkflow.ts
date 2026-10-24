const STATUS_COM_RESULTADO_ABERTO = new Set(['coletado', 'em_analise']);

export const STATUS_COLETA_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  coletado: 'Coletado',
  em_analise: 'Em Análise',
  validado: 'Validado',
  liberado: 'Liberado',
  cancelado: 'Cancelado',
  recoleta: 'Recoleta',
  rejeitada: 'Rejeitada',
};

export function podeGerenciarLaboratorioPorPapel(roles: readonly string[] | null | undefined): boolean {
  return roles?.some((role) => role === 'admin' || role === 'enfermagem') ?? false;
}

export function dadosAoRegistrarColeta(instante: Date, usuarioId: string | null | undefined) {
  return { data_coleta: instante.toISOString(), coletado_por: usuarioId ?? null };
}

export function podeRegistrarResultado(status: string | null | undefined): boolean {
  return status != null && STATUS_COM_RESULTADO_ABERTO.has(status);
}

/** Amostras que ainda exigem trabalho do laboratório. */
export const STATUS_COLETA_PENDENTES = ['pendente', 'coletado', 'em_analise', 'validado'] as const;

export type FiltrosWorklist = { status: string; setor: string; periodo: string; urgente: boolean };
const PERIODOS_WORKLIST = new Set(['hoje', 'ontem', '7dias', 'todos']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PADRAO_WORKLIST: FiltrosWorklist = { status: 'todos', setor: 'todos', periodo: 'hoje', urgente: false };

/** Filtros vêm da URL para sobreviver a recarga e atualização; a busca textual fica fora (dados do paciente). */
export function lerFiltrosWorklist(params: URLSearchParams): FiltrosWorklist {
  const status = params.get('status') ?? '';
  const setor = params.get('setor') ?? '';
  const periodo = params.get('periodo') ?? '';
  return {
    status: Object.prototype.hasOwnProperty.call(STATUS_COLETA_LABELS, status) ? status : PADRAO_WORKLIST.status,
    setor: UUID.test(setor) ? setor : PADRAO_WORKLIST.setor,
    periodo: PERIODOS_WORKLIST.has(periodo) ? periodo : PADRAO_WORKLIST.periodo,
    urgente: params.get('urgente') === '1',
  };
}

export function gravarFiltrosWorklist(params: URLSearchParams, filtros: FiltrosWorklist): URLSearchParams {
  const proximo = new URLSearchParams(params);
  const valores: Record<string, string> = {
    status: filtros.status, setor: filtros.setor, periodo: filtros.periodo, urgente: filtros.urgente ? '1' : '',
  };
  for (const [chave, valor] of Object.entries(valores)) {
    const padrao = chave === 'urgente' ? '' : String(PADRAO_WORKLIST[chave as keyof FiltrosWorklist]);
    if (valor && valor !== padrao) proximo.set(chave, valor);
    else proximo.delete(chave);
  }
  return proximo;
}

export type PendenciaSetor = { id: string | null; nome: string; total: number; urgentes: number };

export function resumirPendenciasPorSetor(
  amostras: Array<{ setor_id: string | null; urgente: boolean | null }>,
  setores: Array<{ id: string; nome: string }>,
): PendenciaSetor[] {
  const nomes = new Map(setores.map(setor => [setor.id, setor.nome]));
  const porSetor = new Map<string | null, PendenciaSetor>();
  for (const amostra of amostras) {
    const id = amostra.setor_id && nomes.has(amostra.setor_id) ? amostra.setor_id : null;
    const item = porSetor.get(id) ?? { id, nome: id ? nomes.get(id)! : 'Sem setor', total: 0, urgentes: 0 };
    item.total += 1;
    if (amostra.urgente) item.urgentes += 1;
    porSetor.set(id, item);
  }
  return [...porSetor.values()].sort((a, b) =>
    b.urgentes - a.urgentes || b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));
}
