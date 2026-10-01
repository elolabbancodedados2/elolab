import { describe, expect, it } from 'vitest';
import { patientStep } from '@/lib/receptionWorkflow';

describe('patientStep', () => {
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
