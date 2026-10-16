import { describe, expect, it } from 'vitest';
import { groupNotificationsByEvent } from '../notificationDeduplication';

const notification = (overrides: Record<string, unknown> = {}) => ({
  source_type: 'tarefa',
  source_id: '00000000-0000-4000-8000-000000000201',
  category: 'tarefas',
  severity: 'warning',
  title: 'Tarefa atrasada',
  message: 'Revisar retorno',
  occurred_at: '2026-10-14T10:00:00.000Z',
  href: '/tarefas',
  is_read: false,
  ...overrides,
});

describe('groupNotificationsByEvent', () => {
  it('agrupa somente ocorrências da mesma origem e preserva a contagem', () => {
    const grouped = groupNotificationsByEvent([
      notification(),
      notification({ message: 'Cópia repetida' }),
      notification({ source_id: '00000000-0000-4000-8000-000000000202', title: 'Outra tarefa' }),
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toMatchObject({
      source_id: '00000000-0000-4000-8000-000000000201',
      duplicateCount: 2,
      href: '/tarefas',
    });
    expect(grouped[1]).toMatchObject({ duplicateCount: 1, title: 'Outra tarefa' });
  });

  it('mantém evento não lido se qualquer ocorrência ainda estiver pendente', () => {
    const grouped = groupNotificationsByEvent([
      notification({ is_read: true }),
      notification({ is_read: false, occurred_at: '2026-10-14T11:00:00.000Z' }),
    ]);

    expect(grouped[0].is_read).toBe(false);
    expect(grouped[0].occurred_at).toBe('2026-10-14T11:00:00.000Z');
  });

  it('não mistura eventos com mesmo ID de origens diferentes', () => {
    const grouped = groupNotificationsByEvent([
      notification(),
      notification({ source_type: 'exame', category: 'exames', href: '/exames' }),
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped.map((item) => item.duplicateCount)).toEqual([1, 1]);
  });
});
