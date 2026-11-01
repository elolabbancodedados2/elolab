/**
 * Próximo horário livre de um médico, para a lista de espera sugerir uma vaga
 * real em vez de abrir sempre às 09:00 de hoje.
 *
 * É só sugestão: o formulário continua validando sobreposição, bloqueio e
 * expediente antes de gravar, e o banco tem a constraint de sobreposição.
 */

export interface JornadaMedico {
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
}

export interface OcupacaoAgenda {
  data: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  status?: string | null;
}

export interface BloqueioAgenda {
  data_inicio: string;
  data_fim: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  dia_inteiro: boolean | null;
}

export interface ProximaVagaParams {
  hoje: string;
  /** Minutos desde a meia-noite, no horário da clínica. */
  agoraMinutos: number;
  duracaoMinutos: number;
  jornada: JornadaMedico[];
  agendamentos: OcupacaoAgenda[];
  bloqueios: BloqueioAgenda[];
  dias?: number;
  /** Período do dia aceito, em minutos (ex.: manhã = [360, 720]). */
  janela?: readonly [number, number];
}

const LIBERAM_HORARIO = new Set(['cancelado', 'faltou']);

function minutos(hora: string | null | undefined): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(hora ?? '');
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function hora(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function proximaVagaLivre(params: ProximaVagaParams): { data: string; hora_inicio: string } | null {
  const duracao = params.duracaoMinutos > 0 ? params.duracaoMinutos : 30;
  const passo = Math.min(duracao, 15);
  const dias = params.dias ?? 14;

  for (let i = 0; i < dias; i++) {
    const data = somarDias(params.hoje, i);
    const diaSemana = new Date(`${data}T12:00:00Z`).getUTCDay();
    const faixas = params.jornada
      .filter(j => j.dia_semana === diaSemana)
      .map(j => [minutos(j.hora_inicio), minutos(j.hora_fim)] as const)
      .filter((f): f is readonly [number, number] => f[0] !== null && f[1] !== null && f[1] > f[0])
      // A janela corta a faixa sem perder o alinhamento ao início do expediente.
      .map(([ini, fim]) => params.janela
        ? [ini + Math.max(0, Math.ceil((params.janela[0] - ini) / passo)) * passo, Math.min(fim, params.janela[1])] as const
        : [ini, fim] as const)
      .filter(([ini, fim]) => fim > ini)
      .sort((a, b) => a[0] - b[0]);
    if (!faixas.length) continue;

    const bloqueiosDia = params.bloqueios.filter(b => b.data_inicio <= data && b.data_fim >= data);
    if (bloqueiosDia.some(b => b.dia_inteiro)) continue;

    const ocupados = [
      ...params.agendamentos
        .filter(a => a.data === data && !LIBERAM_HORARIO.has(String(a.status ?? '')))
        .map(a => {
          const ini = minutos(a.hora_inicio);
          return ini === null ? null : [ini, minutos(a.hora_fim) ?? ini + duracao] as const;
        }),
      ...bloqueiosDia.map(b => {
        const ini = minutos(b.hora_inicio);
        const fim = minutos(b.hora_fim);
        return ini === null || fim === null ? null : [ini, fim] as const;
      }),
    ].filter((o): o is readonly [number, number] => o !== null);

    const minimo = i === 0 ? Math.ceil((params.agoraMinutos + 1) / passo) * passo : 0;
    for (const [inicioFaixa, fimFaixa] of faixas) {
      // Alinha ao passo a partir do início do expediente (08:10, 08:25... se começar às 08:10).
      let inicio = inicioFaixa;
      while (inicio < minimo) inicio += passo;
      for (; inicio + duracao <= fimFaixa; inicio += passo) {
        const fim = inicio + duracao;
        if (!ocupados.some(([oi, of]) => oi < fim && of > inicio)) {
          return { data, hora_inicio: hora(inicio) };
        }
      }
    }
  }
  return null;
}

/** Minutos desde a meia-noite no horário de São Paulo. */
export function minutosAgoraSaoPaulo(instant: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
  return (get('hour') % 24) * 60 + get('minute');
}
