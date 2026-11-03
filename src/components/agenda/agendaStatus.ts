import { STATUS_A_CONFIRMAR, STATUS_NA_CLINICA } from '@/lib/agendamentoStatus';
export { STATUSES_AGENDA, STATUS_A_CONFIRMAR, STATUS_NA_CLINICA } from '@/lib/agendamentoStatus';

/** Tipos que o formulário de consulta oferece sempre, além dos cadastrados. */
export const TIPOS_FIXOS_CONSULTA: [string, string][] = [
  ['consulta', 'Consulta'],
  ['retorno', 'Retorno'],
  ['exame', 'Exame'],
  ['procedimento', 'Procedimento'],
  ['telemedicina', 'Teleconsulta'],
];

/** Marcada, ainda sem confirmação do paciente. */

/** Paciente já chegou: check-in feito, triagem ou atendimento em curso. */


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
