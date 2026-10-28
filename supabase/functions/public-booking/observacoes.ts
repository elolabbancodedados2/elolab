/**
 * Observação gravada no agendamento criado pelo link público (CLIN-QA-320).
 *
 * Só o marcador e a instrução operacional. Nome, telefone e e-mail informados
 * já estão no cadastro do paciente vinculado (`paciente_id`); copiá-los para
 * texto livre espalhava contato pelo registro de agendamento e deixava uma
 * cópia desatualizada quando o cadastro mudasse.
 *
 * O marcador `[agendamento online]` é usado pela recepção (AppointmentCard) e
 * pela contagem de pedidos pendentes em index.ts; não altere sem ajustar os dois.
 */
export const MARCADOR_AGENDAMENTO_ONLINE = '[agendamento online]';

export const OBSERVACAO_AGENDAMENTO_ONLINE =
  `${MARCADOR_AGENDAMENTO_ONLINE} Marcado pelo paciente no link público. `
  + 'Confirmar com o paciente pelo contato do cadastro.';
