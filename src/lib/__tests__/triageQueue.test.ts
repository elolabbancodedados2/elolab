import { describe, expect, it } from 'vitest';
import { buildTriagensFilters, filtrarAgendamentosAguardandoTriagem, temCheckinAtivo } from '../triageQueue';

const today = '2026-10-11';
const appointments = [
  { id: 'arrived', data: today, status: 'agendado', hora_inicio: '09:00', exige_triagem: true },
  { id: 'not-arrived', data: today, status: 'confirmado', hora_inicio: '10:00', exige_triagem: true },
  { id: 'already-triaged', data: today, status: 'aguardando', hora_inicio: '08:00', exige_triagem: true },
  { id: 'yesterday', data: '2026-10-10', status: 'agendado', hora_inicio: '09:00', exige_triagem: true },
];
const queue = [
  { agendamento_id: 'arrived', status: 'aguardando' },
  { agendamento_id: 'already-triaged', status: 'em_atendimento' },
  { agendamento_id: 'not-arrived', status: 'finalizado' },
];

describe('fila de trabalho da triagem', () => {
  it('só oferece agendamentos do dia com check-in ativo e ainda não triados', () => {
    expect(filtrarAgendamentosAguardandoTriagem(appointments, queue, ['already-triaged'], today).map(item => item.id))
      .toEqual(['arrived']);
  });

  it('reconhece apenas estados ativos de check-in para a validação ao salvar', () => {
    expect(temCheckinAtivo(queue, 'arrived')).toBe(true);
    expect(temCheckinAtivo(queue, 'not-arrived')).toBe(false);
  });

  it('limita a consulta de médicos aos agendamentos do próprio profissional', () => {
    expect(buildTriagensFilters('inicio', 'fim', true, ['own-1', 'own-2'])).toContainEqual({
      column: 'agendamento_id', operator: 'in', value: '(own-1,own-2)',
    });
    expect(buildTriagensFilters('inicio', 'fim', false, [])).toHaveLength(2);
  });
});
