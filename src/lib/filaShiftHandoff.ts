export interface FilaShiftHandoffData {
  date: string;
  generatedAt: string;
  waiting: number;
  triage: number;
  inConsultation: number;
  blockedByPayment: number;
  outsideToday: number;
  urgent: number;
  overdue: number;
}

const item = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

export function generateFilaShiftHandoff(data: FilaShiftHandoffData): string {
  return [
    `Passagem de turno — ${data.date}`,
    `Gerado às ${data.generatedAt}`,
    '',
    'Pendências operacionais:',
    `• ${item(data.waiting, 'pessoa aguardando chamada', 'pessoas aguardando chamada')}`,
    `• ${item(data.triage, 'pessoa aguardando triagem', 'pessoas aguardando triagem')}`,
    `• ${item(data.inConsultation, 'atendimento em andamento', 'atendimentos em andamento')}`,
    `• ${item(data.blockedByPayment, 'atendimento bloqueado por pagamento', 'atendimentos bloqueados por pagamento')}`,
    `• ${item(data.outsideToday, 'item para revisar fora da fila de hoje', 'itens para revisar fora da fila de hoje')}`,
    `• ${item(data.urgent, 'item com prioridade urgente', 'itens com prioridade urgente')}`,
    `• ${item(data.overdue, 'pessoa aguardando há mais de 30 minutos', 'pessoas aguardando há mais de 30 minutos')}`,
  ].join('\n');
}
