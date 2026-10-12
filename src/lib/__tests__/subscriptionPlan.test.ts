import { describe, expect, it } from 'vitest';
import { normalizarAssinaturaPlano } from '../subscriptionPlan';

describe('normalização da assinatura da clínica', () => {
  it('preserva estado de teste e vigência do plano pré-pago', () => {
    expect(normalizarAssinaturaPlano({
      plano_slug: 'elolab-max',
      status: 'trial',
      em_trial: true,
      trial_fim: '2026-10-14T00:00:00.000Z',
      data_fim: null,
      cobranca_modalidade: 'recorrente',
      planos: { nome: 'EloLab Max' },
    })).toEqual({
      plano_slug: 'elolab-max',
      plano_nome: 'EloLab Max',
      status: 'trial',
      em_trial: true,
      trial_fim: '2026-10-14T00:00:00.000Z',
      data_fim: null,
      cobranca_modalidade: 'recorrente',
    });
  });

  it('usa slug como nome de reserva e ignora modalidade desconhecida', () => {
    expect(normalizarAssinaturaPlano({ plano_slug: 'legacy', status: 'ativa', cobranca_modalidade: 'outro' })).toMatchObject({
      plano_nome: 'legacy',
      cobranca_modalidade: null,
    });
  });

  it('retorna null quando não há assinatura', () => {
    expect(normalizarAssinaturaPlano(null)).toBeNull();
  });
});
