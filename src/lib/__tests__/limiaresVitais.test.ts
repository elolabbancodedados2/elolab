import { describe, expect, it } from 'vitest';
import { classificarSinalVital, faixaNormalVital, numeroVital, piorNivelVital } from '@/lib/limiaresVitais';

describe('limiaresVitais', () => {
  it('classifica PA sistólica', () => {
    expect(classificarSinalVital('pressao_sistolica', 120)).toBe('normal');
    expect(classificarSinalVital('pressao_sistolica', '150')).toBe('atencao');
    expect(classificarSinalVital('pressao_sistolica', 185)).toBe('alerta');
    expect(classificarSinalVital('pressao_sistolica', 85)).toBe('alerta');
  });
  it('classifica FC, temperatura e saturação', () => {
    expect(classificarSinalVital('frequencia_cardiaca', 72)).toBe('normal');
    expect(classificarSinalVital('frequencia_cardiaca', 110)).toBe('atencao');
    expect(classificarSinalVital('frequencia_cardiaca', 130)).toBe('alerta');
    expect(classificarSinalVital('temperatura', '36,8')).toBe('normal');
    expect(classificarSinalVital('temperatura', '37,6')).toBe('atencao');
    expect(classificarSinalVital('temperatura', 38.5)).toBe('alerta');
    expect(classificarSinalVital('saturacao', 92)).toBe('atencao');
    expect(classificarSinalVital('saturacao', 88)).toBe('alerta');
  });
  it('ignora valor vazio', () => {
    expect(classificarSinalVital('glicemia', '')).toBeNull();
    expect(numeroVital('abc')).toBeNull();
  });
  it('expõe faixa e pior nível', () => {
    expect(faixaNormalVital('frequencia_cardiaca')).toEqual([60, 100]);
    expect(piorNivelVital('normal', 'atencao', null)).toBe('atencao');
    expect(piorNivelVital(null)).toBeNull();
  });
});
