import { STATUS_FINALIZADO, STATUS_ENCERRADOS } from '@/lib/agendamentoStatus';
export { rotuloStatusAgendamento as formatAppointmentStatus } from '@/lib/agendamentoStatus';
export const isAppointmentCompleted = (status: string) => STATUS_FINALIZADO.has(status);
export const isAppointmentClosed = (status: string) => STATUS_ENCERRADOS.has(status);
