export type TaskViewMode = 'list' | 'kanban';

export function getInitialTaskView(hasCoarsePointer: boolean): TaskViewMode {
  return hasCoarsePointer ? 'list' : 'kanban';
}
