/**
 * Quem pode ser chamado para o atendimento.
 *
 * Espelha o trigger `exige_pagamento_antes_do_atendimento` (migration
 * 20260814210000). A VERDADE continua sendo do banco — esta função existe para
 * a tela não oferecer um botão que vai falhar, e para separar a fila do médico
 * de quem ainda está no balcão.
 *
 * Se as duas lógicas divergirem, quem manda é o banco: no pior caso a tela
 * mostra o botão e o clique devolve a mensagem do trigger. O contrário —
 * bloquear na tela algo que o banco permitiria — é que seria ruim, e por isso
 * cada condição aqui é a mesma do trigger, na mesma ordem.
 */

export interface CobrancaDoAtendimento {
  agendamento_id: string | null;
  valor: number | string | null;
  valor_pago: number | string | null;
  desconto: number | string | null;
  acrescimo: number | string | null;
}

export interface AgendamentoParaLiberacao {
  exige_pagamento_previo?: boolean | null;
  liberado_sem_pagamento?: boolean | null;
}

const centavos = (v: unknown): number => Math.round((Number(v) || 0) * 100);

/**
 * Quanto falta receber. Zero quando não há cobrança — que é o caso de retorno e
 * coleta, cadastrados como gratuitos.
 */
export function saldoDevedor(
  agendamentoId: string,
  cobrancas: CobrancaDoAtendimento[],
): number {
  const total = cobrancas
    .filter(c => c.agendamento_id === agendamentoId)
    .reduce((soma, c) => {
      const devido = centavos(c.valor) - centavos(c.desconto) + centavos(c.acrescimo);
      return soma + (devido - centavos(c.valor_pago));
    }, 0);
  return total / 100;
}

/**
 * @param travaLigada  `clinicas.exigir_pagamento_previo` — desligada, nada muda
 */
export function podeAtender(
  agendamentoId: string,
  agendamento: AgendamentoParaLiberacao | undefined,
  cobrancas: CobrancaDoAtendimento[],
  travaLigada: boolean,
): boolean {
  if (!travaLigada) return true;
  if (agendamento?.exige_pagamento_previo === false) return true;
  if (agendamento?.liberado_sem_pagamento) return true;
  // Tolerância de um centavo, igual ao trigger.
  return saldoDevedor(agendamentoId, cobrancas) <= 0.009;
}
