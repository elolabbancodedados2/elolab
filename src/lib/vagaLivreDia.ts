/**
 * Horários livres de um profissional num único dia, respeitando consultas,
 * bloqueios e (quando cadastrado) o expediente.
 *
 * É só sugestão para a tela: o formulário continua validando conflito,
 * bloqueio e expediente antes de gravar.
 */

export type Faixa = readonly [number, number];

export interface OcupacaoDia {
  hora_inicio: string | null;
  hora_fim?: string | null;
  status?: string | null;
}

export interface BloqueioDia {
  hora_inicio?: string | null;
  hora_fim?: string | null;
  dia_inteiro?: boolean | null;
}

export interface HorariosLivresParams {
  agendamentos: OcupacaoDia[];
  bloqueios: BloqueioDia[];
  /** Faixas do expediente em minutos. `undefined` = expediente desconhecido (usa a grade inteira). */
  faixas?: Faixa[];
  /** Primeiro minuto aceito (ex.: agora, se o dia for hoje). */
  aPartirDe?: number;
  duracaoMinutos?: number;
  passoMinutos?: number;
  /** Limites da grade quando o expediente é desconhecido. */
  gradeInicio?: number;
  gradeFim?: number;
  limite?: number;
}

const LIBERAM_HORARIO = new Set(['cancelado', 'faltou']);

export function minutosDaHora(hora: string | null | undefined): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(hora ?? '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function horaDosMinutos(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** Converte linhas de medico_disponibilidade em faixas ordenadas. */
export function faixasDoExpediente(jornada: Array<{ hora_inicio: string | null; hora_fim: string | null }>): Faixa[] {
  return jornada
    .map(j => [minutosDaHora(j.hora_inicio), minutosDaHora(j.hora_fim)] as const)
    .filter((f): f is Faixa => f[0] !== null && f[1] !== null && f[1] > f[0])
    .sort((a, b) => a[0] - b[0]);
}

export function horariosLivresNoDia(params: HorariosLivresParams): string[] {
  const duracao = params.duracaoMinutos && params.duracaoMinutos > 0 ? params.duracaoMinutos : 30;
  const passo = params.passoMinutos && params.passoMinutos > 0 ? params.passoMinutos : Math.min(duracao, 15);
  const gradeInicio = params.gradeInicio ?? 6 * 60;
  const gradeFim = params.gradeFim ?? 22 * 60;
  const limite = params.limite ?? Number.POSITIVE_INFINITY;
  if (params.bloqueios.some(b => b.dia_inteiro)) return [];

  const ocupados: Faixa[] = [
    ...params.agendamentos
      .filter(a => !LIBERAM_HORARIO.has(String(a.status ?? '')))
      .map(a => {
        const ini = minutosDaHora(a.hora_inicio);
        return ini === null ? null : [ini, minutosDaHora(a.hora_fim) ?? ini + 30] as const;
      }),
    ...params.bloqueios.map(b => {
      const ini = minutosDaHora(b.hora_inicio);
      const fim = minutosDaHora(b.hora_fim);
      return ini === null || fim === null ? null : [ini, fim] as const;
    }),
  ].filter((o): o is Faixa => o !== null);

  const faixas = params.faixas ?? [[gradeInicio, gradeFim] as const];
  const minimo = params.aPartirDe ?? 0;
  const livres: string[] = [];
  for (const [inicioFaixa, fimFaixa] of faixas) {
    let inicio = inicioFaixa;
    while (inicio < minimo) inicio += passo;
    for (; inicio + duracao <= fimFaixa; inicio += passo) {
      const fim = inicio + duracao;
      if (!ocupados.some(([oi, of]) => oi < fim && of > inicio)) {
        livres.push(horaDosMinutos(inicio));
        if (livres.length >= limite) return livres;
      }
    }
  }
  return livres;
}

export function proximaVagaNoDia(params: HorariosLivresParams): string | null {
  return horariosLivresNoDia({ ...params, limite: 1 })[0] ?? null;
}
