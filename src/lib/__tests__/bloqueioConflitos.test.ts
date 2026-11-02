import { describe, expect, it } from 'vitest';
import { consultasEmConflito } from '@/lib/bloqueioConflitos';

const consultas = [
  { id: 'a', medico_id: 'm1', data: '2026-11-03', hora_inicio: '09:00:00', hora_fim: '09:30:00', status: 'agendado' },
  { id: 'b', medico_id: 'm1', data: '2026-11-03', hora_inicio: '14:00:00', hora_fim: '14:30:00', status: 'confirmado' },
  { id: 'c', medico_id: 'm2', data: '2026-11-03', hora_inicio: '09:00:00', hora_fim: '09:30:00', status: 'agendado' },
  { id: 'd', medico_id: 'm1', data: '2026-11-03', hora_inicio: '09:30:00', hora_fim: '10:00:00', status: 'cancelado' },
  { id: 'e', medico_id: 'm1', data: '2026-11-05', hora_inicio: '09:00:00', hora_fim: '09:30:00', status: 'agendado' },
];

describe('consultas em conflito com o bloqueio', () => {
  it('dia inteiro pega todas as consultas ativas dos médicos no período', () => {
    const ids = consultasEmConflito(consultas, { medico_ids: ['m1'], data_inicio: '2026-11-03', data_fim: '2026-11-04', dia_inteiro: true }).map(c => c.id);
    expect(ids).toEqual(['a', 'b']);
  });

  it('faixa horária pega só quem sobrepõe e respeita vários médicos', () => {
    const ids = consultasEmConflito(consultas, {
      medico_ids: ['m1', 'm2'], data_inicio: '2026-11-03', data_fim: '2026-11-05', dia_inteiro: false, hora_inicio: '08:30', hora_fim: '09:15',
    }).map(c => c.id);
    expect(ids).toEqual(['a', 'c', 'e']);
  });

  it('faixa inválida não aponta conflito', () => {
    expect(consultasEmConflito(consultas, { medico_ids: ['m1'], data_inicio: '2026-11-03', data_fim: '2026-11-03', dia_inteiro: false, hora_inicio: '10:00', hora_fim: '09:00' })).toEqual([]);
  });
});
