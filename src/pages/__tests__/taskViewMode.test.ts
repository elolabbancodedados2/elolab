import { describe, expect, it } from 'vitest';
import { getInitialTaskView, taskMatchesAssignee, taskMatchesSearch } from '../taskViewMode';

describe('visualização inicial das tarefas', () => {
  it('abre a lista em dispositivos touch', () => {
    expect(getInitialTaskView(true)).toBe('list');
  });

  it('mantém o Kanban em dispositivos com ponteiro preciso', () => {
    expect(getInitialTaskView(false)).toBe('kanban');
  });

  it('busca sem diferenciar acentos nos metadados e nas pessoas vinculadas', () => {
    const tarefa = {
      titulo: 'Revisar prontuário',
      descricao: 'Conferir anotações',
      categoria: 'Clínico',
      prioridade: 'média',
      paciente: { nome: 'João da Silva' },
      responsavel: { nome: 'Ana Souza' },
    };

    expect(taskMatchesSearch(tarefa, 'clinico')).toBe(true);
    expect(taskMatchesSearch(tarefa, 'joao')).toBe(true);
    expect(taskMatchesSearch(tarefa, 'ana')).toBe(true);
    expect(taskMatchesSearch(tarefa, 'financeiro')).toBe(false);
  });

  it('filtra somente tarefas atribuídas ao usuário autenticado', () => {
    expect(taskMatchesAssignee({ responsavel_id: 'staff-1' }, true, 'staff-1')).toBe(true);
    expect(taskMatchesAssignee({ responsavel_id: 'staff-2' }, true, 'staff-1')).toBe(false);
    expect(taskMatchesAssignee({ responsavel_id: null }, true, 'staff-1')).toBe(false);
    expect(taskMatchesAssignee({ responsavel_id: 'staff-2' }, false, 'staff-1')).toBe(true);
    expect(taskMatchesAssignee({ responsavel_id: 'staff-1' }, true, null)).toBe(false);
  });
});
