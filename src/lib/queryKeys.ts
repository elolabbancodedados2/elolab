/**
 * Fábrica de query keys do React Query.
 *
 * Regra: toda chave de dado da clínica começa por `clinica_id`. Assim a
 * resposta de uma clínica nunca é reaproveitada por outra, mesmo que uma
 * requisição antiga termine depois da troca de clínica (impersonação ou
 * vínculo novo), e é possível remover o cache de uma clínica inteira pelo
 * primeiro segmento.
 *
 * Migração gradual (CLIN-QA-206): agenda, `useSupabaseQuery` e o realtime já
 * usam esta fábrica. As consultas genéricas por tabela ficam em
 * `[clinica, 'tabela', tabela, usuario, opções]`. Muitas telas ainda invalidam
 * pelo prefixo legado `[tabela]`; `instalarCompatibilidadeTabelas` faz esse
 * prefixo continuar alcançando as chaves novas até que todas migrem.
 */
import { hashKey, partialMatchKey, type QueryClient, type QueryKey } from '@tanstack/react-query';

export type ClinicaId = string | null | undefined;

/** Segundo segmento das chaves de `queryKeys.tabela`. */
export const SEGMENTO_TABELA = 'tabela';

/** Primeiro segmento normalizado: sem clínica vira `null`, nunca `undefined`. */
const escopo = (clinicaId: ClinicaId) => clinicaId ?? null;

export const queryKeys = {
  /** Prefixo de tudo o que pertence a uma clínica. */
  clinica: (clinicaId: ClinicaId) => [escopo(clinicaId)] as const,

  agenda: {
    todos: (clinicaId: ClinicaId) => [escopo(clinicaId), 'agenda'] as const,
    reagendar: (clinicaId: ClinicaId, agendamentoId: string | null | undefined) =>
      [escopo(clinicaId), 'agenda', 'reagendar', agendamentoId ?? null] as const,
    expediente: (clinicaId: ClinicaId, diaSemana: number, medicoIds: readonly string[]) =>
      [escopo(clinicaId), 'agenda', 'expediente', diaSemana, medicoIds] as const,
    ultimoAtendimento: (
      clinicaId: ClinicaId,
      pacienteId: string | null | undefined,
      excluirAgendamentoId: string | null | undefined,
    ) => [escopo(clinicaId), 'agenda', 'ultimo-atendimento', pacienteId ?? null, excluirAgendamentoId ?? null] as const,
  },

  medicoAtual: (clinicaId: ClinicaId, userId: string | null | undefined) =>
    [escopo(clinicaId), 'medico-atual', userId ?? null] as const,

  pacienteResumo: (clinicaId: ClinicaId, userId: string | null | undefined, pacienteId: string | null | undefined) =>
    [escopo(clinicaId), 'paciente-resumo', userId ?? null, pacienteId ?? null] as const,

  /** Consultas genéricas por tabela (`useSupabaseQuery`). */
  tabela: {
    /** Todas as consultas da tabela na clínica (para invalidar). */
    todos: (clinicaId: ClinicaId, tabela: string) => [escopo(clinicaId), SEGMENTO_TABELA, tabela] as const,
    consulta: (clinicaId: ClinicaId, tabela: string, userId: string | null | undefined, opcoes: unknown) =>
      [escopo(clinicaId), SEGMENTO_TABELA, tabela, userId ?? null, opcoes ?? null] as const,
  },
} as const;

/**
 * Prefixo legado por tabela. Com a compatibilidade instalada, invalida a
 * tabela em qualquer escopo (chaves legadas e `queryKeys.tabela`), como o
 * código fazia antes da migração.
 */
export const prefixoTabela = (tabela: string) => [tabela] as const;

/** Indica se a chave pertence à clínica informada (primeiro segmento). */
export function chavePertenceAClinica(queryKey: readonly unknown[], clinicaId: ClinicaId): boolean {
  return queryKey.length > 0 && queryKey[0] === escopo(clinicaId);
}

/** Indica se a chave é de `queryKeys.tabela` e se o prefixo legado `[tabela, ...]` a alcança. */
function prefixoLegadoAlcancaChaveDeTabela(queryKey: QueryKey, prefixo: QueryKey): boolean {
  return queryKey[1] === SEGMENTO_TABELA && partialMatchKey(queryKey.slice(2), prefixo);
}

/** Filtro que alcança só as chaves legadas `[chave, ...]`, sem as de `queryKeys.tabela`. */
export function filtroSomenteLegado(chave: string) {
  return { predicate: (query: { queryKey: QueryKey }) => partialMatchKey(query.queryKey, [chave]) };
}

type FiltrosComChave = { queryKey?: QueryKey; exact?: boolean; predicate?: unknown } & Record<string, unknown>;

/**
 * Amplia um filtro com prefixo legado (`{ queryKey: ['pacientes'] }`) para que
 * também alcance `[clinica, 'tabela', 'pacientes', ...]`. Filtros exatos ou com
 * `predicate` próprio ficam como estão.
 */
export function ampliarFiltroLegado<F>(filtros: F): F {
  const f = filtros as FiltrosComChave | undefined;
  const prefixo = f?.queryKey;
  if (!f || !Array.isArray(prefixo) || typeof prefixo[0] !== 'string' || f.exact || f.predicate) return filtros;
  const { queryKey: _ignorada, ...resto } = f;
  const hashPrefixo = hashKey(prefixo);
  return {
    ...resto,
    predicate: (query: { queryKey: QueryKey }) =>
      hashKey(query.queryKey) === hashPrefixo ||
      partialMatchKey(query.queryKey, prefixo) ||
      prefixoLegadoAlcancaChaveDeTabela(query.queryKey, prefixo),
  } as F;
}

const METODOS_COM_FILTRO = [
  'invalidateQueries',
  'refetchQueries',
  'cancelQueries',
  'removeQueries',
  'resetQueries',
  'isFetching',
  'getQueriesData',
  'setQueriesData',
] as const;

const clientesCompativeis = new WeakSet<QueryClient>();

/**
 * Faz os filtros de prefixo legado (`[tabela]`) do QueryClient alcançarem as
 * chaves de `queryKeys.tabela`. Idempotente; chamado pelos hooks que criam ou
 * invalidam essas chaves. Remover quando nenhuma tela invalidar por `[tabela]`.
 */
export function instalarCompatibilidadeTabelas(queryClient: QueryClient): void {
  if (clientesCompativeis.has(queryClient)) return;
  clientesCompativeis.add(queryClient);
  const alvo = queryClient as unknown as Record<string, (...args: unknown[]) => unknown>;
  // Só troca o filtro quando há chave nova que o prefixo legado deveria
  // alcançar; nos demais casos o filtro original segue intacto.
  const haChaveNovaAlcancada = (filtros: unknown) => {
    const prefixo = (filtros as FiltrosComChave | undefined)?.queryKey;
    if (!Array.isArray(prefixo)) return false;
    const consultas = queryClient.getQueryCache?.().getAll() ?? [];
    return consultas.some((query) => prefixoLegadoAlcancaChaveDeTabela(query.queryKey, prefixo));
  };
  for (const metodo of METODOS_COM_FILTRO) {
    const original = alvo[metodo];
    if (typeof original !== 'function') continue;
    alvo[metodo] = function (this: unknown, filtros: unknown, ...resto: unknown[]) {
      const ampliado = ampliarFiltroLegado(filtros);
      const final = ampliado !== filtros && haChaveNovaAlcancada(filtros) ? ampliado : filtros;
      return original.call(this, final, ...resto);
    };
  }
}
