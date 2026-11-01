import { describe, expect, it } from 'vitest';
import { chaveParametro, pontosSparkline, seriesPorParametro, variacaoPercentual } from '../laudoHistorico';

describe('resultado anterior no laudo', () => {
  it('agrupa por parâmetro sem acento e ordena do mais antigo ao mais recente', () => {
    const series = seriesPorParametro([
      { parametro: 'Glicose', resultado: '110', created_at: '2026-09-01' },
      { parametro: 'glicose', resultado: '98,5', created_at: '2026-06-01' },
      { parametro: 'Hemácias', resultado: 'Normal', created_at: '2026-06-01' },
    ]);
    const glicose = series.get(chaveParametro('GLICOSE'));
    expect(glicose?.anterior.resultado).toBe('110');
    expect(glicose?.valores).toEqual([98.5, 110]);
    expect(series.get(chaveParametro('Hemacias'))?.valores).toEqual([]);
  });

  it('calcula a variação com vírgula decimal e evita divisão por zero', () => {
    expect(variacaoPercentual('110', '100')).toBeCloseTo(10);
    expect(variacaoPercentual('4,5', '5')).toBeCloseTo(-10);
    expect(variacaoPercentual('1', '0')).toBeNull();
    expect(variacaoPercentual('Positivo', '1')).toBeNull();
  });

  it('gera pontos da linha só com dois ou mais valores', () => {
    expect(pontosSparkline([1])).toBe('');
    expect(pontosSparkline([0, 10], 80, 20)).toBe('0,20 80,0');
  });
});
