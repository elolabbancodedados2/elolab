interface AppointmentStepState {
  status: string;
}

interface QueueStepState {
  status?: string | null;
  cobranca_estado?: string | null;
}

interface BillingStepState {
  status?: string | null;
}

/** Derives the reception step from appointment, queue, and billing state. */
export function patientStep(
  appointment: AppointmentStepState,
  queueItem: QueueStepState | null | undefined,
  billing: BillingStepState | null | undefined,
  billingResolved = true,
): number {
  if (appointment.status === 'aguardando_pagamento_adicional') return 3;
  if (
    (appointment.status === 'finalizado' || appointment.status === 'atendimento_finalizado') &&
    queueItem?.status === 'concluido'
  ) return 4;
  if (appointment.status === 'finalizado' || appointment.status === 'atendimento_finalizado') return 3;
  if (appointment.status === 'em_atendimento') return 2;

  // Check-in is visible to other terminals before price resolution finishes.
  // Keep it at the counter until billing explicitly confirms the outcome.
  if (queueItem?.cobranca_estado === 'pendente') return 1;
  if (queueItem?.cobranca_estado === 'gratuita') return 2;

  // An unresolved billing query must not turn into a free service in the UI.
  if (queueItem && !billingResolved) return 1;

  // A missing invoice after the query resolves means no balance is due.
  if (queueItem && (!billing || billing.status === 'pago')) return 2;
  if (queueItem && billing.status !== 'pago') return 1;
  if (['confirmado', 'aguardando', 'agendado'].includes(appointment.status)) return 0;
  return -1;
}
