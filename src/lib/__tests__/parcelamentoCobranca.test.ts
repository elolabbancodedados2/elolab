import { describe, expect, it } from 'vitest';
import { parcelarCobranca } from '../parcelamentoCobranca';

describe('parcelamento de cobrança', () => {
  it('preserva o centavo de R$ 100 em três parcelas', () => {
    expect(parcelarCobranca(100, 3)).toEqual([33.34, 33.33, 33.33]);
  });
  it('preserva o total para todas as quantidades permitidas', () => {
    for (const total of [0.48, 1, 10.01, 100, 1234.56]) {
      for (let n = 1; n <= 48; n++) {
        const parcelas = parcelarCobranca(total, n);
        expect(parcelas.reduce((s, v) => s + Math.round(v * 100), 0)).toBe(Math.round(total * 100));
        expect(parcelas.every(v => v > 0)).toBe(true);
      }
    }
  });
  it.each([0, -1, NaN, Infinity])('rejeita total inválido %s', total => {
    expect(() => parcelarCobranca(total, 1)).toThrow();
  });
  it.each([0, -1, 1.5, 49, NaN, Infinity])('rejeita quantidade inválida %s', n => {
    expect(() => parcelarCobranca(100, n)).toThrow();
  });
  it('não gera parcelas de zero centavos', () => {
    expect(() => parcelarCobranca(0.01, 2)).toThrow();
  });
});
