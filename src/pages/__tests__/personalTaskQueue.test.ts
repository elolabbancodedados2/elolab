import { describe, expect, it } from 'vitest';
import { groupPersonalTasks } from '../personalTaskQueue';

describe('fila pessoal de tarefas', () => {
  it('agrupa por vencimento, separa encerradas e mantém ordem estável', () => {
    const grouped = groupPersonalTasks([
      makeTask('upcoming-b', 'pendente', '2026-10-20'),
      makeTask('completed', 'concluida', '2026-10-10'),
      makeTask('overdue-b', 'em_andamento', '2026-10-13'),
      makeTask('no-deadline', 'pendente', null),
      makeTask('today', 'pendente', '2026-10-14'),
      makeTask('overdue-a', 'pendente', '2026-10-13'),
      makeTask('cancelled', 'cancelada', null),
      makeTask('upcoming-a', 'pendente', '2026-10-16'),
    ], '2026-10-14');

    expect(grouped.overdue.map(({ id }) => id)).toEqual(['overdue-a', 'overdue-b']);
    expect(grouped.today.map(({ id }) => id)).toEqual(['today']);
    expect(grouped.upcoming.map(({ id }) => id)).toEqual(['upcoming-a', 'upcoming-b']);
    expect(grouped.noDeadline.map(({ id }) => id)).toEqual(['no-deadline']);
    expect(grouped.completed.map(({ id }) => id)).toEqual(['cancelled', 'completed']);
    expect(grouped.total).toBe(8);
  });

  it('não conta tarefas concluídas ou canceladas como atrasadas', () => {
    const grouped = groupPersonalTasks([
      makeTask('closed-overdue', 'concluida', '2026-10-01'),
    ], '2026-10-14');

    expect(grouped.overdue).toHaveLength(0);
    expect(grouped.completed.map(({ id }) => id)).toEqual(['closed-overdue']);
  });
});

function makeTask(id: string, status: string, data_vencimento: string | null) {
  return { id, titulo: id, descricao: null, status, prioridade: 'media', categoria: null, data_vencimento, paciente_id: null, updated_at: '2026-10-14T12:00:00Z' };
}
