import { formatAppointmentStatus } from '@/components/dashboard/appointmentStatus';

type AgendamentoCheckin = {
  id: string;
  paciente_id?: string | null;
  clinica_id?: string | null;
  data?: string | null;
  status?: string | null;
} | null | undefined;

type PacienteCheckin = {
  id: string;
  clinica_id?: string | null;
  ativo?: boolean | null;
} | null | undefined;

export type ItemValidacaoCheckin = {
  id: 'paciente' | 'compromisso' | 'unidade';
  rotulo: string;
  ok: boolean;
  detalhe: string;
};

const STATUS_ENCERRADOS = ['cancelado', 'faltou', 'finalizado', 'atendimento_finalizado'];

/**
 * Pré-validação exibida antes do check-in. Espelha `realizar_checkin` e o
 * trigger `impedir_fila_paciente_inativo`, que continuam sendo a autoridade.
 */
export function validarCheckin({ agendamento, paciente, clinicaId, hoje }: {
  agendamento: AgendamentoCheckin;
  paciente: PacienteCheckin;
  clinicaId: string | null | undefined;
  hoje: string;
}): ItemValidacaoCheckin[] {
  const pacienteFalha = !paciente
    ? 'Cadastro do paciente não carregado.'
    : agendamento?.paciente_id && agendamento.paciente_id !== paciente.id
      ? 'O paciente não corresponde ao agendamento.'
      : paciente.ativo === false
        ? 'Paciente inativo. Reative o cadastro antes do check-in.'
        : null;

  const status = agendamento?.status ?? '';
  const compromissoFalha = !agendamento
    ? 'Agendamento não encontrado.'
    : agendamento.data !== hoje
      ? 'O agendamento não é de hoje.'
      : STATUS_ENCERRADOS.includes(status)
        ? `O agendamento está como “${formatAppointmentStatus(status).toLocaleLowerCase('pt-BR')}” e não aceita check-in.`
        : status === 'em_atendimento'
          ? 'O atendimento já foi iniciado.'
          : null;

  const unidadeFalha = !clinicaId
    ? 'Unidade da sessão não identificada. Atualize o perfil.'
    : agendamento?.clinica_id !== clinicaId
      ? 'O agendamento pertence a outra unidade.'
      : paciente?.clinica_id && paciente.clinica_id !== clinicaId
        ? 'O paciente pertence a outra unidade.'
        : null;

  return [
    { id: 'paciente', rotulo: 'Paciente', ok: !pacienteFalha, detalhe: pacienteFalha ?? 'Cadastro ativo e vinculado ao agendamento.' },
    { id: 'compromisso', rotulo: 'Compromisso', ok: !compromissoFalha, detalhe: compromissoFalha ?? 'Agendamento de hoje, apto para check-in.' },
    { id: 'unidade', rotulo: 'Unidade', ok: !unidadeFalha, detalhe: unidadeFalha ?? 'Mesma unidade da sua sessão.' },
  ];
}

export function primeiraFalhaCheckin(itens: ItemValidacaoCheckin[]): string | null {
  return itens.find((item) => !item.ok)?.detalhe ?? null;
}
