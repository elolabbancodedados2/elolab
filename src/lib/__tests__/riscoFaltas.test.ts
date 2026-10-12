import { describe, expect, it } from 'vitest';
import { classificarRiscoFalta, correspondeFiltroRiscoFalta, formatarDataHoraRiscoFalta, formatarIndiceRisco } from '@/lib/riscoFaltas';

describe('classificação de risco de falta', () => {
  it.each([
    [0, 'baixo'], [0.39, 'baixo'], [0.4, 'medio'], [0.69, 'medio'], [0.7, 'alto'], [1, 'alto'],
  ] as const)('classifica %s como %s', (probabilidade, faixa) => {
    expect(classificarRiscoFalta(probabilidade)).toBe(faixa);
  });

  it('filtra pela faixa calculada e mantém todos quando o filtro está aberto', () => {
    expect(correspondeFiltroRiscoFalta(0.7, 'alto')).toBe(true);
    expect(correspondeFiltroRiscoFalta(0.7, 'medio')).toBe(false);
    expect(correspondeFiltroRiscoFalta(0.15, 'todos')).toBe(true);
  });

  it('apresenta o cálculo heurístico como índice de 0 a 100', () => {
    expect(formatarIndiceRisco(0.736)).toBe(74);
    expect(formatarIndiceRisco(1.5)).toBe(100);
    expect(formatarIndiceRisco(-0.2)).toBe(0);
  });

  it('formata o ultimo calculo no fuso de Sao Paulo', () => {
    expect(formatarDataHoraRiscoFalta('2026-10-11T02:30:00.000Z')).toBe('10/10/2026 às 23:30');
  });
});
