import { describe, expect, it } from 'vitest';
import { isAppointmentClosed, isAppointmentCompleted } from './appointmentStatus';

describe('appointment workflow status semantics', () => {
  it('counts only finished clinical encounters as completed', () => {
    expect(isAppointmentCompleted('finalizado')).toBe(true);
    expect(isAppointmentCompleted('atendimento_finalizado')).toBe(true);
    expect(isAppointmentCompleted('pago')).toBe(false);
    expect(isAppointmentCompleted('faltou')).toBe(false);
  });

  it('keeps payment status open for clinical follow-up and excludes terminal attendance states', () => {
    expect(isAppointmentClosed('pago')).toBe(false);
    expect(isAppointmentClosed('confirmado')).toBe(false);
    expect(isAppointmentClosed('faltou')).toBe(true);
    expect(isAppointmentClosed('cancelado')).toBe(true);
    expect(isAppointmentClosed('atendimento_finalizado')).toBe(true);
  });
});
