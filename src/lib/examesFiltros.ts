export type FiltrosExames = { status: string; tipo: string; indicador: string };

const STATUS = new Set(['solicitado', 'agendado', 'realizado', 'laudo_disponivel', 'cancelado']);
const INDICADORES = new Set(['aguardando', 'hoje', 'agendado', 'laudo_disponivel', 'criticos']);

/** Filtros vêm da URL para sobreviver à recarga; a busca textual fica fora (dados do paciente). */
export function lerFiltrosExames(params: URLSearchParams): FiltrosExames {
  const status = params.get('status') ?? '';
  const indicador = params.get('indicador') ?? '';
  const tipo = params.get('tipo')?.trim() ?? '';
  return {
    status: STATUS.has(status) ? status : 'todos',
    tipo: tipo && tipo.length <= 120 ? tipo : 'todos',
    indicador: INDICADORES.has(indicador) ? indicador : 'todos',
  };
}

export function gravarFiltrosExames(params: URLSearchParams, filtros: Partial<FiltrosExames>): URLSearchParams {
  const proximo = new URLSearchParams(params);
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor && valor !== 'todos') proximo.set(chave, valor);
    else proximo.delete(chave);
  }
  return proximo;
}
