import { describe, expect, it } from 'vitest';
import { alturaEmCentimetros, normalizarPressaoArterial, riscoBaixo, sinaisCriticos } from '@/lib/triagemSinais';

describe('normalizarPressaoArterial', () => {
  it('aceita espaços e "x" como separador', () => {
    expect(normalizarPressaoArterial(' 120 / 80 ')).toMatchObject({ valor: '120/80', aviso: undefined });
    expect(normalizarPressaoArterial('130x85')).toMatchObject({ valor: '130/85', sistolica: 130, diastolica: 85 });
  });

  it('converte a forma em cmHg com aviso', () => {
    const r = normalizarPressaoArterial('12x8');
    expect(r.valor).toBe('120/80');
    expect(r.aviso).toContain('120/80');
    expect(normalizarPressaoArterial('14/9').valor).toBe('140/90');
  });

  it('recusa formatos ambíguos ou inválidos', () => {
    expect(normalizarPressaoArterial('120').valor).toBeNull();
    expect(normalizarPressaoArterial('120/8').valor).toBeNull();
    expect(normalizarPressaoArterial('abc').valor).toBeNull();
  });
});

describe('alturaEmCentimetros', () => {
  it('converte metros antigos e mantém centímetros', () => {
    expect(alturaEmCentimetros(1.72)).toBe(172);
    expect(alturaEmCentimetros('1,6')).toBe(160);
    expect(alturaEmCentimetros(168)).toBe(168);
    expect(alturaEmCentimetros(null)).toBeNull();
  });
});

describe('sinaisCriticos', () => {
  it('lista SpO2 < 90, PA ≥ 180/110 e T ≥ 39', () => {
    expect(sinaisCriticos({ saturacao: 88, sistolica: 120, diastolica: 80, temperatura: 36.5 })).toEqual(['saturação de 88%']);
    expect(sinaisCriticos({ sistolica: 150, diastolica: 110 })).toHaveLength(1);
    expect(sinaisCriticos({ temperatura: 39.2 })).toEqual(['temperatura de 39,2 °C']);
    expect(sinaisCriticos({ saturacao: 97, sistolica: 179, diastolica: 109, temperatura: 38.9 })).toEqual([]);
  });

  it('considera baixo só verde e azul', () => {
    expect(riscoBaixo('verde')).toBe(true);
    expect(riscoBaixo('azul')).toBe(true);
    expect(riscoBaixo('amarelo')).toBe(false);
  });
});
