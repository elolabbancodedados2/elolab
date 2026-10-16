import { describe, expect, it } from 'vitest';
import { describeAppointmentConflict } from './agendaConflictMessage';

describe('describeAppointmentConflict', () => {
  it('descreve o intervalo existente e o solicitado para o mesmo médico', () => {
    expect(describeAppointmentConflict({
      resource: 'médico',
      existingStart: '09:00:00',
      existingEnd: '09:40:00',
      requestedStart: '09:30',
      requestedEnd: '10:00',
    })).toBe('O médico já tem um atendimento de 09:00–09:40; o horário solicitado é 09:30–10:00. Escolha outro horário.');
  });

  it('usa a duração padrão quando o compromisso existente não tem hora final', () => {
    expect(describeAppointmentConflict({
      resource: 'paciente',
      existingStart: '14:00',
      existingEnd: null,
      requestedStart: '14:20',
      requestedEnd: '14:50',
    })).toBe('O paciente já tem um atendimento de 14:00–14:30; o horário solicitado é 14:20–14:50. Escolha outro horário.');
  });

  it('informa quando o conflito é com uma sala', () => {
    expect(describeAppointmentConflict({
      resource: 'sala',
      existingStart: '11:00',
      existingEnd: '11:30',
      requestedStart: '11:15',
      requestedEnd: '11:45',
    })).toBe('A sala está ocupada de 11:00–11:30; o horário solicitado é 11:15–11:45. Escolha outra sala ou outro horário.');
  });
});
