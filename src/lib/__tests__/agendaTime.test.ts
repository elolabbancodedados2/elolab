import { describe, expect, it } from 'vitest';
import { appointmentEndMinutes } from '../agendaTime';

describe('appointmentEndMinutes', () => {
  it('uses the 30-minute database default when an older appointment has no end time', () => {
    expect(appointmentEndMinutes('09:00', null)).toBe(570);
  });

  it('uses the stored end time when the appointment has one', () => {
    expect(appointmentEndMinutes('09:00', '09:45:00')).toBe(585);
  });
});
