import { describe, expect, it } from 'vitest';
import { buildSampleReasonPayload } from '@/lib/sampleRejection';

describe('motivo estruturado de amostra', () => {
  it('produz código e rótulo estáveis para uma causa categorizada', () => {
    expect(buildSampleReasonPayload('volume_insuficiente', '')).toEqual({
      motivo_codigo: 'volume_insuficiente',
      motivo_rotulo: 'Volume insuficiente',
      motivo_detalhe: null,
      motivo: 'Volume insuficiente',
    });
  });

  it('normaliza detalhes opcionais sem perder a categoria', () => {
    expect(buildSampleReasonPayload('recipiente_inadequado', '  tubo lilás  ')).toEqual({
      motivo_codigo: 'recipiente_inadequado',
      motivo_rotulo: 'Tubo ou recipiente inadequado',
      motivo_detalhe: 'tubo lilás',
      motivo: 'Tubo ou recipiente inadequado — tubo lilás',
    });
  });

  it('exige explicação útil quando a categoria é Outro', () => {
    expect(buildSampleReasonPayload('outro', 'nope')).toBeNull();
    expect(buildSampleReasonPayload('outro', 'coleta fora do prazo')).toMatchObject({
      motivo_codigo: 'outro',
      motivo_rotulo: 'Outro',
    });
  });

  it('recusa categoria desconhecida e detalhe acima do limite', () => {
    expect(buildSampleReasonPayload('qualquer', '')).toBeNull();
    expect(buildSampleReasonPayload('hemolisada', 'x'.repeat(301))).toBeNull();
  });
});
