import { describe, expect, it } from 'vitest';
import { horarioAgendadoJaChegou } from '../retornoHorario';

describe('horário agendado de retorno', () => {
  it('mantém o retorno indisponível antes da hora marcada no mesmo dia', () => {
    expect(horarioAgendadoJaChegou('2026-10-11', '15:00:00', new Date('2026-10-11T09:00:00-03:00'))).toBe(false);
  });

  it('libera a confirmação depois da hora marcada', () => {
    expect(horarioAgendadoJaChegou('2026-10-11', '15:00:00', new Date('2026-10-11T15:00:00-03:00'))).toBe(true);
  });
});
