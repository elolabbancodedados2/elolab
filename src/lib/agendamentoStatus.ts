/** Vocabulário e classificação dos valores persistidos em agendamentos. */
export interface AgendamentoStatus {
  label: string;
  color: string;
  grupo: 'a_confirmar' | 'na_clinica' | 'encerrado';
  etapa: number;
  finalizado?: boolean;
  semReserva?: boolean;
}

export const AGENDAMENTO_STATUS: Record<string, AgendamentoStatus> = {
  agendado: { label: 'Agendado', color: 'bg-primary', grupo: 'a_confirmar', etapa: 0 },
  confirmado: { label: 'Confirmado', color: 'bg-success', grupo: 'a_confirmar', etapa: 0 },
  aguardando: { label: 'Aguardando', color: 'bg-warning', grupo: 'na_clinica', etapa: 0 },
  aguardando_triagem: { label: 'Aguardando triagem', color: 'bg-warning', grupo: 'na_clinica', etapa: 2 },
  em_triagem: { label: 'Em triagem', color: 'bg-primary', grupo: 'na_clinica', etapa: 2 },
  fila_atendimento: { label: 'Na fila de atendimento', color: 'bg-warning', grupo: 'na_clinica', etapa: 2 },
  em_atendimento: { label: 'Em atendimento', color: 'bg-primary animate-pulse', grupo: 'na_clinica', etapa: 2 },
  finalizado: { label: 'Finalizado', color: 'bg-muted-foreground/30', grupo: 'encerrado', etapa: 3, finalizado: true },
  atendimento_finalizado: { label: 'Finalizado', color: 'bg-muted-foreground/30', grupo: 'encerrado', etapa: 3, finalizado: true },
  aguardando_pagamento: { label: 'Aguardando pagamento', color: 'bg-warning', grupo: 'na_clinica', etapa: 1 },
  aguardando_pagamento_adicional: { label: 'Aguardando pagamento adicional', color: 'bg-destructive', grupo: 'encerrado', etapa: 3 },
  pago: { label: 'Pago', color: 'bg-success', grupo: 'na_clinica', etapa: 2 },
  cancelado: { label: 'Cancelado', color: 'bg-destructive/70', grupo: 'encerrado', etapa: -1, semReserva: true },
  faltou: { label: 'Faltou', color: 'bg-warning/70', grupo: 'encerrado', etapa: -1, semReserva: true },
};

export const STATUS_LABEL: Record<string, string> = Object.fromEntries(Object.entries(AGENDAMENTO_STATUS).map(([status, item]) => [status, item.label]));
export const STATUS_DOT: Record<string, string> = Object.fromEntries(Object.entries(AGENDAMENTO_STATUS).map(([status, item]) => [status, item.color]));
export const STATUSES_AGENDA: [string, string][] = Object.entries(STATUS_LABEL);
export const STATUS_FINALIZADO = new Set(Object.keys(AGENDAMENTO_STATUS).filter(status => AGENDAMENTO_STATUS[status].finalizado));
export const STATUS_ENCERRADOS = new Set(Object.keys(AGENDAMENTO_STATUS).filter(status => AGENDAMENTO_STATUS[status].grupo === 'encerrado'));
export const STATUS_SEM_RESERVA = new Set(Object.keys(AGENDAMENTO_STATUS).filter(status => AGENDAMENTO_STATUS[status].semReserva));
export const STATUS_NA_CLINICA = Object.keys(AGENDAMENTO_STATUS).filter(status => AGENDAMENTO_STATUS[status].grupo === 'na_clinica');
export const STATUS_A_CONFIRMAR = ['agendado'];

export function rotuloStatusAgendamento(status: string | null | undefined): string {
  return STATUS_LABEL[status ?? ''] ?? (status ? status.replace(/_/g, ' ') : '—');
}
