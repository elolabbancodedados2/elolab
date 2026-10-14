import { describe, expect, it } from 'vitest';
import {
  calcularMargemLucro,
  formatarPercentualFinanceiro,
  formatarValorAbreviadoFinanceiro,
} from '../financeiroCalculations';

describe('cálculo da margem de lucro', () => {
  it('não informa percentual quando não existe receita como base', () => {
    expect(calcularMargemLucro(0, 0)).toBeNull();
    expect(calcularMargemLucro(0, -120)).toBeNull();
  });

  it('calcula margem para receita positiva e preserva prejuízo', () => {
    expect(calcularMargemLucro(1000, 250)).toBe(25);
    expect(calcularMargemLucro(1000, -250)).toBe(-25);
  });

  it('usa convenções brasileiras nos valores abreviados e percentuais', () => {
    expect(formatarValorAbreviadoFinanceiro(1500)).toBe('R$ 1,5 mil');
    expect(formatarValorAbreviadoFinanceiro(1_250_000)).toBe('R$ 1,3 mi');
    expect(formatarPercentualFinanceiro(12.5)).toBe('12,5%');
  });
});
