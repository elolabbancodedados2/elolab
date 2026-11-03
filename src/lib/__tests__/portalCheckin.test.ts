import { expect, it } from 'vitest';
import { podeCheckinPortal } from '../../../supabase/functions/_shared/portalCheckin';
import { patientStep, portalArrivalLabel } from '../receptionWorkflow';
const appointment = { data: '2026-11-03', hora_inicio: '10:00:00', status: 'confirmado' };
it('oferece check-in no mesmo dia, inclusive limites -2h e +30min', () => {
  for (const instant of ['2026-11-03T11:00:00Z', '2026-11-03T13:30:00Z']) {
    expect(podeCheckinPortal(appointment, new Date(instant))).toBe(true);
  }
  for (const instant of ['2026-11-03T10:59:59Z', '2026-11-03T13:30:01Z', '2026-11-02T13:00:00Z']) {
    expect(podeCheckinPortal(appointment, new Date(instant))).toBe(false);
  }
  expect(podeCheckinPortal({ ...appointment, data: '2026-11-04', hora_inicio: '00:30:00' }, new Date('2026-11-04T02:59:00Z'))).toBe(false);
});
it('recusa consulta cancelada, já em atendimento ou horário inválido', () => {
  const now = new Date('2026-11-03T13:00:00Z');
  for (const status of ['cancelado', 'em_atendimento', 'aguardando', 'finalizado']) expect(podeCheckinPortal({ ...appointment, status }, now)).toBe(false);
  expect(podeCheckinPortal({ ...appointment, hora_inicio: null }, now)).toBe(false);
});
it('chegada online continua no check-in da recepção, sem avançar para cobrança/fila', () => {
  const arrival = { ...appointment, portal_checkin_status: 'chegou' };
  expect(patientStep(arrival, null, null)).toBe(0);
  expect(portalArrivalLabel(arrival, null)).toBe('Aguardando confirmação do balcão');
  expect(portalArrivalLabel({ ...arrival, portal_checkin_status: 'a_caminho' }, null)).toBe('A caminho');
  expect(portalArrivalLabel(arrival, { status: 'aguardando' })).toBeNull();
});
