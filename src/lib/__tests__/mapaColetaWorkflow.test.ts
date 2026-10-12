import { describe, expect, it } from 'vitest';
import { dadosTransicaoColeta } from '../mapaColetaWorkflow';

describe('dados da transição de coleta', () => {
  it('registra o profissional e horário local da ação ao coletar', () => {
    const now = new Date('2026-10-11T13:00:00.000Z');
    expect(dadosTransicaoColeta('coletado', 'profile-123', now)).toEqual({
      status: 'coletado',
      coletado_por: 'profile-123',
      data_coleta: '2026-10-11T13:00:00.000Z',
    });
  });

  it('não atribui coletor em transições que não são de coleta', () => {
    expect(dadosTransicaoColeta('cancelado', 'profile-123')).toEqual({ status: 'cancelado' });
  });
});
