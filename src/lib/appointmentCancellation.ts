export const APPOINTMENT_CANCELLATION_REASONS = [
  { value: 'solicitacao_paciente', label: 'Solicitação do paciente' },
  { value: 'indisponibilidade_profissional', label: 'Indisponibilidade do profissional' },
  { value: 'conflito_horario', label: 'Conflito de horário' },
  { value: 'ajuste_administrativo', label: 'Ajuste administrativo' },
  { value: 'outro', label: 'Outro' },
] as const;

export type AppointmentCancellationReason = (typeof APPOINTMENT_CANCELLATION_REASONS)[number]['value'];

export function isAppointmentCancellationReason(value: unknown): value is AppointmentCancellationReason {
  return typeof value === 'string'
    && APPOINTMENT_CANCELLATION_REASONS.some((reason) => reason.value === value);
}

export function appointmentCancellationReasonLabel(value: unknown): string | null {
  return APPOINTMENT_CANCELLATION_REASONS.find((reason) => reason.value === value)?.label ?? null;
}
