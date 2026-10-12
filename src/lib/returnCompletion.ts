const STATUS_ATENDIMENTO_CONCLUIDO = new Set(['finalizado', 'atendimento_finalizado']);

/** A linked return can only be marked complete after its appointment is closed. */
export function podeMarcarRetornoRealizado(statusAgendamento: string | null | undefined): boolean {
  return STATUS_ATENDIMENTO_CONCLUIDO.has(String(statusAgendamento || '').toLocaleLowerCase('pt-BR'));
}
