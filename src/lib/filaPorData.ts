export interface ItemFilaComData {
  agendamento_id: string;
  status: string;
  agendamentos?: { data?: string | null } | null;
}

const STATUS_TERMINAL_AGENDAMENTO = new Set([
  'cancelado', 'faltou', 'finalizado', 'atendimento_finalizado', 'aguardando_pagamento_adicional',
]);

export function podeIniciarAgendamento(status: string | null | undefined): boolean {
  if (!status) return false;
  return !STATUS_TERMINAL_AGENDAMENTO.has(status);
}

export function separarFilaAtivaPorData<T extends ItemFilaComData>(
  fila: T[],
  hoje: string,
  datasPorAgendamento: ReadonlyMap<string, string>,
): { hoje: T[]; outrosDias: T[] } {
  const ativos = fila.filter(item => item.status !== 'finalizado' && item.status !== 'concluido');
  const doDia: T[] = [];
  const outrosDias: T[] = [];

  for (const item of ativos) {
    const data = item.agendamentos?.data ?? datasPorAgendamento.get(item.agendamento_id);
    (data === hoje ? doDia : outrosDias).push(item);
  }

  return { hoje: doDia, outrosDias };
}
