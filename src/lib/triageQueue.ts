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
  prioridade?: string | null;
  horario_chegada?: string | null;
};

const STATUS_FILA_ATIVA = new Set(['aguardando', 'chamado', 'em_atendimento']);
const STATUS_AGENDAMENTO_TRIAVEL = new Set(['agendado', 'confirmado', 'aguardando', 'aguardando_triagem', 'pago']);

const PESO_PRIORIDADE: Record<string, number> = { urgente: 0, preferencial: 1, normal: 2 };

/** Entrada ativa da fila para o agendamento, se houver. */
export function entradaAtivaDaFila<E extends TriageQueueEntry>(fila: E[], agendamentoId: string): E | undefined {
  return fila.find(item => item.agendamento_id === agendamentoId && STATUS_FILA_ATIVA.has(item.status));
}

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
  const chave = (agendamento: T) => {
    const entrada = entradaAtivaDaFila(fila, agendamento.id);
    return {
      peso: PESO_PRIORIDADE[entrada?.prioridade || 'normal'] ?? PESO_PRIORIDADE.normal,
      chegada: entrada?.horario_chegada ? new Date(entrada.horario_chegada).getTime() : Number.POSITIVE_INFINITY,
    };
  };
  return agendamentos
    .filter(agendamento =>
      agendamento.data === data &&
      STATUS_AGENDAMENTO_TRIAVEL.has(agendamento.status) &&
      agendamento.exige_triagem !== false &&
      temCheckinAtivo(fila, agendamento.id) &&
      !triados.has(agendamento.id),
    )
    // Urgente e preferencial à frente; dentro da prioridade, quem chegou antes.
    .sort((a, b) => {
      const ka = chave(a);
      const kb = chave(b);
      if (ka.peso !== kb.peso) return ka.peso - kb.peso;
      if (ka.chegada !== kb.chegada) return ka.chegada < kb.chegada ? -1 : 1;
      return String(a.hora_inicio || '').localeCompare(String(b.hora_inicio || ''));
    });
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
