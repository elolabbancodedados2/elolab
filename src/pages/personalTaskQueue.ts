export type PersonalTask = {
  id: string;
  titulo: string;
  descricao: string | null;
  status: string;
  prioridade: string;
  categoria: string | null;
  data_vencimento: string | null;
  paciente_id: string | null;
  updated_at: string;
};

export type PersonalTaskGroups = {
  overdue: PersonalTask[];
  today: PersonalTask[];
  upcoming: PersonalTask[];
  noDeadline: PersonalTask[];
  completed: PersonalTask[];
  total: number;
};

const isClosed = (task: PersonalTask) => task.status === 'concluida' || task.status === 'cancelada';

function compareByDueDate(a: PersonalTask, b: PersonalTask): number {
  return (a.data_vencimento || '9999-12-31').localeCompare(b.data_vencimento || '9999-12-31')
    || a.id.localeCompare(b.id);
}

export function groupPersonalTasks(tasks: PersonalTask[], today: string): PersonalTaskGroups {
  const groups: PersonalTaskGroups = {
    overdue: [], today: [], upcoming: [], noDeadline: [], completed: [], total: tasks.length,
  };

  for (const task of tasks) {
    if (isClosed(task)) {
      groups.completed.push(task);
    } else if (!task.data_vencimento) {
      groups.noDeadline.push(task);
    } else if (task.data_vencimento < today) {
      groups.overdue.push(task);
    } else if (task.data_vencimento === today) {
      groups.today.push(task);
    } else {
      groups.upcoming.push(task);
    }
  }

  groups.overdue.sort(compareByDueDate);
  groups.today.sort(compareByDueDate);
  groups.upcoming.sort(compareByDueDate);
  groups.noDeadline.sort(compareByDueDate);
  groups.completed.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
  return groups;
}
