const STATUS_REMARCAVEIS_AGENDAMENTO = new Set(['agendado', 'confirmado', 'aguardando']);

export function podeRemarcarAgendamento(status: string | null | undefined): boolean {
  return STATUS_REMARCAVEIS_AGENDAMENTO.has(String(status || '').toLocaleLowerCase('pt-BR'));
}
