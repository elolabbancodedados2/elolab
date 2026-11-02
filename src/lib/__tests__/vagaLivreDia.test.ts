import { describe, expect, it } from 'vitest';
import { faixasDoExpediente, horariosLivresNoDia, proximaVagaNoDia } from '@/lib/vagaLivreDia';

describe('vaga livre no dia', () => {
  it('respeita o expediente cadastrado em vez da grade inteira', () => {
    const faixas = faixasDoExpediente([{ hora_inicio: '14:00:00', hora_fim: '18:00:00' }]);
    expect(proximaVagaNoDia({ agendamentos: [], bloqueios: [], faixas, aPartirDe: 6 * 60 })).toBe('14:00');
  });

  it('pula consultas e bloqueios parciais e ignora canceladas', () => {
    const livres = horariosLivresNoDia({
      agendamentos: [
        { hora_inicio: '08:00:00', hora_fim: '08:30:00', status: 'agendado' },
        { hora_inicio: '08:30:00', hora_fim: '09:00:00', status: 'cancelado' },
      ],
      bloqueios: [{ hora_inicio: '09:00', hora_fim: '10:00' }],
      faixas: [[8 * 60, 11 * 60]],
      duracaoMinutos: 30,
      passoMinutos: 30,
    });
    expect(livres).toEqual(['08:30', '10:00', '10:30']);
  });

  it('não sugere nada com bloqueio de dia inteiro ou sem expediente', () => {
    expect(horariosLivresNoDia({ agendamentos: [], bloqueios: [{ dia_inteiro: true }] })).toEqual([]);
    expect(proximaVagaNoDia({ agendamentos: [], bloqueios: [], faixas: [] })).toBeNull();
  });

  it('sem expediente conhecido usa a grade 06–22 e começa a partir de agora', () => {
    expect(proximaVagaNoDia({ agendamentos: [], bloqueios: [], aPartirDe: 13 * 60 + 7, passoMinutos: 5 })).toBe('13:10');
  });
});
