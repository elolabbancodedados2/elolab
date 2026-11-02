/** Consultas que impedem salvar um bloqueio de agenda (o banco recusa com AGENDA_BLOQUEIO_CONFLITO). */

export interface PeriodoBloqueio {
  medico_ids: string[];
  data_inicio: string;
  data_fim: string;
  dia_inteiro: boolean;
  hora_inicio?: string | null;
  hora_fim?: string | null;
}

export interface ConsultaParaBloqueio {
  id: string;
  medico_id: string | null;
  data: string;
  hora_inicio: string | null;
  hora_fim?: string | null;
  status?: string | null;
}

const LIBERAM_HORARIO = new Set(['cancelado', 'faltou']);

function minutos(hora: string | null | undefined): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(hora ?? '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function consultasEmConflito<T extends ConsultaParaBloqueio>(consultas: T[], periodo: PeriodoBloqueio): T[] {
  const inicioBloqueio = periodo.dia_inteiro ? 0 : minutos(periodo.hora_inicio);
  const fimBloqueio = periodo.dia_inteiro ? 24 * 60 : minutos(periodo.hora_fim);
  if (inicioBloqueio === null || fimBloqueio === null || fimBloqueio <= inicioBloqueio) return [];
  return consultas
    .filter((c) => {
      if (LIBERAM_HORARIO.has(String(c.status ?? ''))) return false;
      if (!c.medico_id || !periodo.medico_ids.includes(c.medico_id)) return false;
      if (c.data < periodo.data_inicio || c.data > periodo.data_fim) return false;
      const ini = minutos(c.hora_inicio);
      if (ini === null) return false;
      const fim = minutos(c.hora_fim) ?? ini + 30;
      return ini < fimBloqueio && fim > inicioBloqueio;
    })
    .sort((a, b) => a.data.localeCompare(b.data) || String(a.hora_inicio).localeCompare(String(b.hora_inicio)));
}
