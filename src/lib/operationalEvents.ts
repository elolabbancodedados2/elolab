export type OperationalAggregate =
  | 'agendamento'
  | 'fila'
  | 'triagem'
  | 'prontuario'
  | 'exame'
  | 'lancamento'
  | 'retorno';

/** Query roots affected by each domain event. Keeping this map in one place
 * prevents one screen from becoming stale while another has already updated. */
const QUERY_ROOTS: Record<OperationalAggregate, readonly string[]> = {
  agendamento: ['agendamentos', 'agenda', 'fila_atendimento', 'retornos', 'dashboard', 'central-notificacoes'],
  fila: ['fila_atendimento', 'agendamentos', 'triagens', 'dashboard', 'central-notificacoes'],
  triagem: ['triagens', 'fila_atendimento', 'agendamentos', 'prontuarios', 'central-notificacoes'],
  prontuario: ['prontuarios', 'pacientes', 'retornos', 'exames', 'central-notificacoes'],
  exame: ['exames', 'laboratorio', 'mapa-coleta', 'pacientes', 'lancamentos', 'central-notificacoes'],
  lancamento: [
    'lancamentos', 'lancamentos_hoje', 'lancamentos-caixa', 'caixa-diario',
    'caixa-estado-recepcao', 'contas-receber', 'pagamentos', 'extrato-paciente',
    'agendamentos', 'dashboard', 'central-notificacoes',
  ],
  retorno: ['retornos', 'agendamentos', 'agenda', 'central-notificacoes'],
};

export function queryRootsForOperationalEvent(aggregate: string): readonly string[] {
  return QUERY_ROOTS[aggregate as OperationalAggregate] ?? [];
}
