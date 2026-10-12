import { describe, expect, it } from 'vitest';
import { podeRemarcarAgendamento } from '../appointmentStatus';

describe('podeRemarcarAgendamento', () => {
  it.each(['agendado', 'confirmado', 'aguardando'])('permite mover o estado remarcável %s', (status) => {
    expect(podeRemarcarAgendamento(status)).toBe(true);
  });

  it.each(['em_atendimento', 'pago', 'aguardando_pagamento_adicional', 'cancelado', 'faltou', 'finalizado', 'atendimento_finalizado'])('bloqueia mover o estado protegido %s', (status) => {
    expect(podeRemarcarAgendamento(status)).toBe(false);
  });
});
