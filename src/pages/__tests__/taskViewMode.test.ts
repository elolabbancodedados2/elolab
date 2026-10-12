import { describe, expect, it } from 'vitest';
import { getInitialTaskView } from '../taskViewMode';

describe('visualização inicial das tarefas', () => {
  it('abre a lista em dispositivos touch', () => {
    expect(getInitialTaskView(true)).toBe('list');
  });

  it('mantém o Kanban em dispositivos com ponteiro preciso', () => {
    expect(getInitialTaskView(false)).toBe('kanban');
  });
});
