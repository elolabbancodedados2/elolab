import { describe, expect, it } from 'vitest';
import { proximaVagaLivre } from '@/lib/proximaVagaLivre';

// 2026-11-02 é segunda-feira (dia_semana 1).
const jornadaSegunda = [{ dia_semana: 1, hora_inicio: '08:00:00', hora_fim: '12:00:00' }];
const base = { hoje: '2026-11-02', agoraMinutos: 7 * 60, duracaoMinutos: 30, jornada: jornadaSegunda, agendamentos: [], bloqueios: [] };

describe('proximaVagaLivre', () => {
  it('sugere o início do expediente quando a agenda está vazia', () => {
    expect(proximaVagaLivre(base)).toEqual({ data: '2026-11-02', hora_inicio: '08:00' });
  });

  it('pula horários ocupados e respeita a duração', () => {
    const agendamentos = [
      { data: '2026-11-02', hora_inicio: '08:00:00', hora_fim: '08:30:00', status: 'confirmado' },
      { data: '2026-11-02', hora_inicio: '08:30:00', hora_fim: '09:00:00', status: 'agendado' },
    ];
    expect(proximaVagaLivre({ ...base, agendamentos })).toEqual({ data: '2026-11-02', hora_inicio: '09:00' });
  });

  it('considera livre o horário de consulta cancelada ou falta', () => {
    const agendamentos = [{ data: '2026-11-02', hora_inicio: '08:00:00', hora_fim: '08:30:00', status: 'cancelado' }];
    expect(proximaVagaLivre({ ...base, agendamentos })).toEqual({ data: '2026-11-02', hora_inicio: '08:00' });
  });

  it('não sugere horário que já passou hoje', () => {
    expect(proximaVagaLivre({ ...base, agoraMinutos: 9 * 60 + 5 })).toEqual({ data: '2026-11-02', hora_inicio: '09:15' });
  });

  it('vai para o próximo dia com expediente quando hoje acabou ou está bloqueado', () => {
    const jornada = [...jornadaSegunda, { dia_semana: 3, hora_inicio: '14:00', hora_fim: '18:00' }];
    expect(proximaVagaLivre({ ...base, jornada, agoraMinutos: 13 * 60 })).toEqual({ data: '2026-11-04', hora_inicio: '14:00' });
    const bloqueios = [{ data_inicio: '2026-11-02', data_fim: '2026-11-02', hora_inicio: null, hora_fim: null, dia_inteiro: true }];
    expect(proximaVagaLivre({ ...base, jornada, bloqueios })).toEqual({ data: '2026-11-04', hora_inicio: '14:00' });
  });

  it('respeita bloqueio parcial', () => {
    const bloqueios = [{ data_inicio: '2026-11-02', data_fim: '2026-11-02', hora_inicio: '08:00', hora_fim: '10:00', dia_inteiro: false }];
    expect(proximaVagaLivre({ ...base, bloqueios })).toEqual({ data: '2026-11-02', hora_inicio: '10:00' });
  });

  it('devolve null sem expediente cadastrado', () => {
    expect(proximaVagaLivre({ ...base, jornada: [] })).toBeNull();
  });
});
