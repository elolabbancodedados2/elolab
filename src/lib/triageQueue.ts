export type TriageAppointment = {
  id: string;
  data: string;
  status: string;
  hora_inicio?: string | null;
  exige_triagem?: boolean | null;
};

export type TriageQueueEntry = {
  agendamento_id: string | null;
  status: string;
};

const STATUS_FILA_ATIVA = new Set(['aguardando', 'chamado', 'em_atendimento']);
const STATUS_AGENDAMENTO_TRIAVEL = new Set(['agendado', 'confirmado', 'aguardando', 'aguardando_triagem', 'pago']);

export function temCheckinAtivo(fila: TriageQueueEntry[], agendamentoId: string): boolean {
  return fila.some(item => item.agendamento_id === agendamentoId && STATUS_FILA_ATIVA.has(item.status));
}

export function filtrarAgendamentosAguardandoTriagem<T extends TriageAppointment>(
  agendamentos: T[],
  fila: TriageQueueEntry[],
  agendamentoIdsTriados: string[],
  data: string,
): T[] {
  const triados = new Set(agendamentoIdsTriados);
  return agendamentos
    .filter(agendamento =>
      agendamento.data === data &&
      STATUS_AGENDAMENTO_TRIAVEL.has(agendamento.status) &&
      agendamento.exige_triagem !== false &&
      temCheckinAtivo(fila, agendamento.id) &&
      !triados.has(agendamento.id),
    )
    .sort((a, b) => String(a.hora_inicio || '').localeCompare(String(b.hora_inicio || '')));
}

export function buildTriagensFilters(
  inicio: string,
  fim: string,
  medicoApenas: boolean,
  agendamentoIds: string[],
): Array<{ column: string; operator: string; value: string }> {
  const filtros = [
    { column: 'data_hora', operator: 'gte', value: inicio },
    { column: 'data_hora', operator: 'lt', value: fim },
  ];
  if (medicoApenas && agendamentoIds.length > 0) {
    filtros.push({ column: 'agendamento_id', operator: 'in', value: `(${agendamentoIds.join(',')})` });
  }
  return filtros;
}
