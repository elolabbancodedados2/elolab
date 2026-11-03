import { describe, expect, it } from 'vitest';
import { patientStep } from '@/lib/receptionWorkflow';

describe('patientStep', () => {
  it.each([['pago', 2], ['aguardando_pagamento', 1], ['aguardando_triagem', 2], ['em_triagem', 2], ['fila_atendimento', 2]] as const)('mantém %s visível sem fila', (status, etapa) => {
    expect(patientStep({ status }, null, null)).toBe(etapa);
  });
  it('não reabre um paciente cancelado por causa de uma fila antiga', () => {
    expect(patientStep({ status: 'cancelado' }, { status: 'aguardando' }, null)).toBe(-1);
  });
  it('sends a queued free appointment directly to the ready-to-attend step', () => {
    expect(patientStep({ status: 'aguardando' }, { status: 'aguardando' }, null)).toBe(2);
  });

  it('keeps a queued appointment at the counter until billing lookup resolves', () => {
    expect(patientStep({ status: 'aguardando' }, { status: 'aguardando' }, null, false)).toBe(1);
  });

  it('does not let another terminal start a check-in with billing pending', () => {
    expect(patientStep(
      { status: 'aguardando' },
      { status: 'aguardando', cobranca_estado: 'pendente' },
      null,
    )).toBe(1);
  });

  it('releases an explicitly free check-in to the call queue', () => {
    expect(patientStep(
      { status: 'aguardando' },
      { status: 'aguardando', cobranca_estado: 'gratuita' },
      null,
    )).toBe(2);
  });

  it('keeps a queued unpaid appointment at the counter', () => {
    expect(patientStep({ status: 'aguardando' }, { status: 'aguardando' }, { status: 'pendente' })).toBe(1);
  });

  it('sends a paid appointment to the ready-to-attend step', () => {
    expect(patientStep({ status: 'pago' }, { status: 'chamado' }, { status: 'pago' })).toBe(2);
  });

  it('keeps additional balances in the post-consultation step', () => {
    expect(patientStep({ status: 'aguardando_pagamento_adicional' }, { status: 'finalizado' }, { status: 'parcial' })).toBe(3);
  });

  it('distinguishes completed queue items from finished appointments', () => {
    expect(patientStep({ status: 'finalizado' }, { status: 'concluido' }, { status: 'pago' })).toBe(4);
    expect(patientStep({ status: 'finalizado' }, { status: 'finalizado' }, { status: 'pago' })).toBe(3);
  });
});
