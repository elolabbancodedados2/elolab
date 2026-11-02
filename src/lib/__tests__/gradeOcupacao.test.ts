import { describe, expect, it } from 'vitest';
import { faixaDeHoras, montarGradeOcupacao } from '@/lib/gradeOcupacao';

describe('grade de ocupação sala × hora', () => {
  const salas = [{ id: 's1', nome: 'Consultório 1' }, { id: 's2', nome: 'Sala 2' }];

  it('distribui cada agendamento pelas horas que ele toca', () => {
    const grade = montarGradeOcupacao(salas, [
      { id: 'a', sala_id: 's1', hora_inicio: '08:30', hora_fim: '09:30', status: 'agendado' },
      { id: 'b', sala_id: 's1', hora_inicio: '10:00', hora_fim: null, status: 'confirmado' },
      { id: 'c', sala_id: 's2', hora_inicio: '08:00', hora_fim: '08:30', status: 'cancelado' },
      { id: 'd', sala_id: null, hora_inicio: '08:00', hora_fim: '08:30', status: 'agendado' },
    ], [8, 9, 10]);
    expect(grade[0].celulas.map(c => c.agendamentos.map(a => a.id))).toEqual([['a'], ['a'], ['b']]);
    expect(grade[0].ocupadas).toBe(3);
    expect(grade[1].ocupadas).toBe(0);
  });

  it('amplia a faixa padrão quando há horário fora dela', () => {
    expect(faixaDeHoras([])).toHaveLength(12);
    const horas = faixaDeHoras([{ id: 'x', hora_inicio: '06:15', hora_fim: '20:10' }]);
    expect(horas[0]).toBe(6);
    expect(horas[horas.length - 1]).toBe(20);
  });
});
