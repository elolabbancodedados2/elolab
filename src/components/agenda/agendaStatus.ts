/** Status de agendamento com o rótulo usado nos filtros e nas cores da agenda. */
export const STATUSES_AGENDA: [string, string][] = [
  ['agendado', 'Agendado'],
  ['confirmado', 'Confirmado'],
  ['aguardando', 'Aguardando'],
  ['aguardando_triagem', 'Aguardando triagem'],
  ['em_triagem', 'Em triagem'],
  ['fila_atendimento', 'Na fila de atendimento'],
  ['em_atendimento', 'Em atendimento'],
  ['finalizado', 'Finalizado'],
  ['atendimento_finalizado', 'Atendimento finalizado'],
  ['aguardando_pagamento', 'Aguardando pagamento'],
  ['aguardando_pagamento_adicional', 'Aguardando pagamento adicional'],
  ['pago', 'Pago'],
  ['cancelado', 'Cancelado'],
  ['faltou', 'Faltou'],
];

/** Tipos que o formulário de consulta oferece sempre, além dos cadastrados. */
export const TIPOS_FIXOS_CONSULTA: [string, string][] = [
  ['consulta', 'Consulta'],
  ['retorno', 'Retorno'],
  ['exame', 'Exame'],
  ['procedimento', 'Procedimento'],
  ['telemedicina', 'Teleconsulta'],
];

/** Marcada, ainda sem confirmação do paciente. */
export const STATUS_A_CONFIRMAR = ['agendado'];
/** Paciente já chegou: check-in feito, triagem ou atendimento em curso. */
export const STATUS_NA_CLINICA = ['aguardando', 'aguardando_triagem', 'em_triagem', 'fila_atendimento', 'em_atendimento'];

export interface TotaisAgenda {
  total: number;
  confirmados: number;
  aConfirmar: number;
  naClinica: number;
  cancelados: number;
}

export function contarTotaisAgenda(agendamentos: Array<{ status?: string | null }>): TotaisAgenda {
  const conta = (lista: string[]) => agendamentos.filter(a => lista.includes(a.status || 'agendado')).length;
  return {
    total: agendamentos.length,
    confirmados: conta(['confirmado']),
    aConfirmar: conta(STATUS_A_CONFIRMAR),
    naClinica: conta(STATUS_NA_CLINICA),
    cancelados: conta(['cancelado']),
  };
}

/** Marcador gravado pelo agendamento online nas observações da consulta. */
export const MARCADOR_AGENDAMENTO_ONLINE = '[agendamento online]';

export function eAgendamentoOnline(agendamento: { observacoes?: string | null; origem?: string | null }): boolean {
  return agendamento.origem === 'online' || String(agendamento.observacoes || '').includes(MARCADOR_AGENDAMENTO_ONLINE);
}
