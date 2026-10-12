export type StatusExameWorkflow = 'solicitado' | 'agendado' | 'realizado' | 'laudo_disponivel' | 'cancelado';
export type RoleExame = 'admin' | 'medico' | 'recepcao' | 'enfermagem' | 'financeiro' | string;

export function podeExcluirExame(roles: RoleExame[] = []): boolean {
  return roles.includes('admin') || roles.includes('recepcao');
}

export function proximaAcaoExame(
  status: StatusExameWorkflow,
  categoria: string | null | undefined,
): { destino: 'status'; status: StatusExameWorkflow } | { destino: 'laboratorio' } | { destino: 'nenhum' } {
  if (status === 'laudo_disponivel' || status === 'cancelado') return { destino: 'nenhum' };
  const laboratorial = (categoria || '').trim().toLocaleLowerCase('pt-BR') === 'laboratorial';
  if (laboratorial && (status === 'agendado' || status === 'realizado')) return { destino: 'laboratorio' };
  const proximo: Partial<Record<StatusExameWorkflow, StatusExameWorkflow>> = {
    solicitado: 'agendado',
    agendado: 'realizado',
    realizado: 'laudo_disponivel',
  };
  const statusSeguinte = proximo[status];
  return statusSeguinte ? { destino: 'status', status: statusSeguinte } : { destino: 'nenhum' };
}
