/** Grade sala × hora do dia, a partir dos agendamentos com sala definida. */

export interface SalaGrade {
  id: string;
  nome: string;
}

export interface AgendamentoGrade {
  id: string;
  sala_id?: string | null;
  hora_inicio?: string | null;
  hora_fim?: string | null;
  status?: string | null;
  paciente?: string | null;
}

export interface CelulaGrade {
  hora: number;
  agendamentos: AgendamentoGrade[];
}

export interface LinhaGrade {
  sala: SalaGrade;
  celulas: CelulaGrade[];
  ocupadas: number;
}

const LIBERAM = new Set(['cancelado', 'faltou']);

function minutos(hora: string | null | undefined): number | null {
  const m = /^(\d{2}):(\d{2})/.exec(hora ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Faixa de horas exibida: do primeiro ao último horário do dia, dentro de 7h–19h por padrão. */
export function faixaDeHoras(agendamentos: AgendamentoGrade[], inicioPadrao = 7, fimPadrao = 19): number[] {
  let inicio = inicioPadrao;
  let fim = fimPadrao;
  for (const ag of agendamentos) {
    const ini = minutos(ag.hora_inicio);
    const fimAg = minutos(ag.hora_fim) ?? (ini === null ? null : ini + 30);
    if (ini !== null) inicio = Math.min(inicio, Math.floor(ini / 60));
    if (fimAg !== null) fim = Math.max(fim, Math.ceil(fimAg / 60));
  }
  return Array.from({ length: Math.max(0, fim - inicio) }, (_, i) => inicio + i);
}

/** Cada agendamento ocupa todas as horas que toca; cancelados e faltas não entram. */
export function montarGradeOcupacao(salas: SalaGrade[], agendamentos: AgendamentoGrade[], horas: number[]): LinhaGrade[] {
  const validos = agendamentos.filter(ag => ag.sala_id && !LIBERAM.has(ag.status ?? ''));
  return salas.map(sala => {
    const daSala = validos.filter(ag => ag.sala_id === sala.id);
    const celulas = horas.map(hora => ({
      hora,
      agendamentos: daSala.filter(ag => {
        const ini = minutos(ag.hora_inicio);
        if (ini === null) return false;
        const fim = minutos(ag.hora_fim) ?? ini + 30;
        return ini < (hora + 1) * 60 && fim > hora * 60;
      }),
    }));
    return { sala, celulas, ocupadas: celulas.filter(c => c.agendamentos.length > 0).length };
  });
}
