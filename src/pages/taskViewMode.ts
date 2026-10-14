import { normalizarTexto } from '@/lib/buscaPaciente';

export type TaskViewMode = 'list' | 'kanban';

type SearchableTask = {
  titulo?: string | null;
  descricao?: string | null;
  categoria?: string | null;
  prioridade?: string | null;
  status?: string | null;
  paciente?: { nome?: string | null } | null;
  responsavel?: { nome?: string | null } | null;
  criador?: { nome?: string | null } | null;
};

type AssignableTask = {
  responsavel_id?: string | null;
};

export function getInitialTaskView(hasCoarsePointer: boolean): TaskViewMode {
  return hasCoarsePointer ? 'list' : 'kanban';
}

export function taskMatchesSearch(task: SearchableTask, search: string): boolean {
  const term = normalizarTexto(search);
  if (!term) return true;

  return [
    task.titulo,
    task.descricao,
    task.categoria,
    task.prioridade,
    task.status,
    task.paciente?.nome,
    task.responsavel?.nome,
    task.criador?.nome,
  ].some((value) => normalizarTexto(value).includes(term));
}

export function taskMatchesAssignee(task: AssignableTask, onlyMine: boolean, userId: string | null | undefined): boolean {
  return !onlyMine || (!!userId && task.responsavel_id === userId);
}
