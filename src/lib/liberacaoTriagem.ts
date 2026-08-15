/**
 * Quem já passou pela triagem.
 *
 * Espelha o trigger `exige_triagem_antes_do_atendimento` (migration
 * 20260814250000), na mesma ordem de condições e pelo mesmo motivo da
 * [liberacaoAtendimento]: a VERDADE é do banco, e esta função existe para a
 * tela não oferecer um botão que vai falhar.
 *
 * A triagem é opcional por clínica e vem DESLIGADA. Consultório de um clínico
 * só não tem enfermagem — se fosse obrigatória para todos, o paciente pagaria
 * e ficaria parado num passo que ninguém pode executar.
 */

export interface AgendamentoParaTriagem {
  exige_triagem?: boolean | null;
  liberado_sem_triagem?: boolean | null;
}

/**
 * @param triagensPorAgendamento  ids de agendamento que já têm triagem
 * @param travaLigada             `clinicas.exigir_triagem` — desligada, nada muda
 */
export function passouPelaTriagem(
  agendamentoId: string,
  agendamento: AgendamentoParaTriagem | undefined,
  triagensPorAgendamento: Set<string> | string[],
  travaLigada: boolean,
): boolean {
  if (!travaLigada) return true;
  // `exige_triagem` só é falso quando alguém marcou o atendimento como isento.
  if (agendamento?.exige_triagem === false) return true;
  if (agendamento?.liberado_sem_triagem) return true;

  const feitas = triagensPorAgendamento instanceof Set
    ? triagensPorAgendamento
    : new Set(triagensPorAgendamento);
  return feitas.has(agendamentoId);
}
