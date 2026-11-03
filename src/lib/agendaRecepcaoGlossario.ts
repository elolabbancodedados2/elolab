/** Nomes de etapas e ações compartilhados pela agenda, recepção e fila. */
export const ETAPAS_RECEPCAO = ['Check-in', 'Balcão', 'Atendimento', 'Finalizado', 'Concluído'] as const;
export const ACOES_ATENDIMENTO = {
  checkin: 'Fazer check-in',
  chamar: 'Chamar paciente',
  iniciar: 'Iniciar atendimento',
  finalizar: 'Finalizar atendimento',
  concluir: 'Concluir atendimento',
  triagem: 'Abrir triagem',
  retorno: 'Agendar retorno',
} as const;
export const FILA_ETAPA_ATENDIMENTO = '/fila?etapa=atendimento';
