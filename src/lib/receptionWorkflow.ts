import { AGENDAMENTO_STATUS, STATUS_SEM_RESERVA } from './agendamentoStatus';

interface AppointmentStepState {
  status: string;
  portal_checkin_status?: string | null;
}

export function portalArrivalLabel(appointment: AppointmentStepState, queueItem: QueueStepState | null | undefined): string | null {
  if (queueItem || !['agendado', 'confirmado'].includes(appointment.status)) return null;
  if (appointment.portal_checkin_status === 'chegou') return 'Aguardando confirmação do balcão';
  if (appointment.portal_checkin_status === 'a_caminho') return 'A caminho';
  return null;
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
  if (STATUS_SEM_RESERVA.has(appointment.status)) return -1;
  if (portalArrivalLabel(appointment, queueItem)) return 0;
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
  return AGENDAMENTO_STATUS[appointment.status]?.etapa ?? -1;
}
