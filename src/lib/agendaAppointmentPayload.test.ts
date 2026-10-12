import { describe, expect, it } from 'vitest';
import { appointmentPayloadForSave } from './agendaAppointmentPayload';

describe('appointmentPayloadForSave', () => {
  it('does not allow editing workflow status through the appointment form', () => {
    expect(appointmentPayloadForSave({ data: '2026-10-11', status: 'faltou' }, true)).toEqual({
      data: '2026-10-11',
    });
  });

  it('keeps the initial status when creating an appointment', () => {
    expect(appointmentPayloadForSave({ data: '2026-10-11', status: 'confirmado' }, false)).toEqual({
      data: '2026-10-11',
      status: 'confirmado',
    });
  });
});
