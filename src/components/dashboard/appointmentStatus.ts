const completedAppointmentStatuses = new Set(['finalizado', 'atendimento_finalizado']);
const closedAppointmentStatuses = new Set([...completedAppointmentStatuses, 'cancelado', 'faltou']);

export function isAppointmentCompleted(status: string) {
  return completedAppointmentStatuses.has(status);
}

export function isAppointmentClosed(status: string) {
  return closedAppointmentStatuses.has(status);
}

export function formatAppointmentStatus(status: string) {
  const labels: Record<string, string> = {
    agendado: 'Agendado',
    confirmado: 'Confirmado',
    aguardando: 'Aguardando',
    aguardando_triagem: 'Aguardando triagem',
    em_triagem: 'Em triagem',
    em_atendimento: 'Em atendimento',
    atendimento_finalizado: 'Finalizado',
    finalizado: 'Finalizado',
    faltou: 'Faltou',
    cancelado: 'Cancelado',
    fila_atendimento: 'Na fila de atendimento',
    aguardando_pagamento: 'Aguardando pagamento',
    aguardando_pagamento_adicional: 'Aguardando pagamento adicional',
    pago: 'Pago',
  };

  return labels[status] ?? status.replace(/_/g, ' ');
}
