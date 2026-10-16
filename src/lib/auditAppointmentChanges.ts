import { appointmentCancellationReasonLabel } from './appointmentCancellation';

export interface AuditAppointmentChange {
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface AuditAppointmentReferences {
  medicos: ReadonlyMap<string, string>;
  salas: ReadonlyMap<string, string>;
}

const FIELD_LABELS: Record<string, string> = {
  medico_id: 'Profissional',
  sala_id: 'Sala',
  data: 'Data',
  hora_inicio: 'Horário',
  hora_fim: 'Fim do horário',
  status: 'Status',
  motivo_cancelamento: 'Motivo do cancelamento',
};

const STATUS_LABELS: Record<string, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  aguardando: 'Aguardando',
  aguardando_triagem: 'Aguardando triagem',
  em_triagem: 'Em triagem',
  em_atendimento: 'Em atendimento',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
  faltou: 'Faltou',
  aguardando_pagamento: 'Aguardando pagamento',
  aguardando_pagamento_adicional: 'Aguardando pagamento adicional',
  atendimento_finalizado: 'Atendimento finalizado',
  pago: 'Pago',
};

function displayValue(field: string, value: unknown, references: AuditAppointmentReferences): string {
  if (value === null || value === undefined || value === '') return field === 'sala_id' ? 'Sem sala' : '—';
  const text = String(value);

  if (field === 'medico_id') return references.medicos.get(text) ?? 'Profissional indisponível';
  if (field === 'sala_id') return references.salas.get(text) ?? 'Sala indisponível';
  if (field === 'status') return STATUS_LABELS[text] ?? text;
  if (field === 'motivo_cancelamento') return appointmentCancellationReasonLabel(text) ?? 'Outro';
  if (field === 'hora_inicio' || field === 'hora_fim') return /^\d{2}:\d{2}(?::\d{2})?$/.test(text) ? text.slice(0, 5) : text;
  if (field === 'data' && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [, year, month, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)!;
    return `${day}/${month}/${year}`;
  }
  return text;
}

export function formatAuditAppointmentChange(change: AuditAppointmentChange, references: AuditAppointmentReferences) {
  return {
    label: FIELD_LABELS[change.field] ?? change.field,
    oldValue: displayValue(change.field, change.oldValue, references),
    newValue: displayValue(change.field, change.newValue, references),
  };
}
