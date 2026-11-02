import { describe, expect, it } from 'vitest';
import { alturaEmCentimetros, normalizarPressaoArterial, riscoBaixo, sinaisCriticos, sugerirRisco, tendenciaSinal } from '@/lib/triagemSinais';

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

describe('sinaisCriticos com FC, FR, glicemia e dor', () => {
  it('inclui frequência cardíaca, respiratória, glicemia e dor fora da faixa', () => {
    expect(sinaisCriticos({ frequenciaCardiaca: 135 })).toEqual(['frequência cardíaca de 135 bpm']);
    expect(sinaisCriticos({ frequenciaCardiaca: 38 })).toHaveLength(1);
    expect(sinaisCriticos({ frequenciaRespiratoria: 32 })).toEqual(['frequência respiratória de 32 irpm']);
    expect(sinaisCriticos({ glicemia: 55 })).toEqual(['glicemia de 55 mg/dL']);
    expect(sinaisCriticos({ glicemia: 320 })).toHaveLength(1);
    expect(sinaisCriticos({ dor: 9 })).toEqual(['dor 9/10']);
    expect(sinaisCriticos({ sistolica: 85, diastolica: 50 })).toEqual(['pressão de 85/50 mmHg']);
  });

  it('não alerta para valores dentro da faixa', () => {
    expect(sinaisCriticos({ frequenciaCardiaca: 80, frequenciaRespiratoria: 16, glicemia: 110, dor: 3 })).toEqual([]);
  });
});

describe('sugerirRisco', () => {
  it('devolve null sem sinais alterados', () => {
    expect(sugerirRisco({ saturacao: 98, sistolica: 120, diastolica: 80, frequenciaCardiaca: 75, temperatura: 36.5 })).toBeNull();
  });

  it('escolhe o nível mais grave e lista os motivos', () => {
    expect(sugerirRisco({ saturacao: 83, dor: 6 })).toEqual({ risco: 'vermelho', motivos: ['saturação de 83%'] });
    expect(sugerirRisco({ dor: 9 })?.risco).toBe('laranja');
    expect(sugerirRisco({ temperatura: 38.7 })).toEqual({ risco: 'amarelo', motivos: ['temperatura de 38,7 °C'] });
    expect(sugerirRisco({ frequenciaRespiratoria: 26, frequenciaCardiaca: 115 })).toEqual({
      risco: 'laranja', motivos: ['frequência respiratória de 26 irpm'],
    });
  });
});

describe('tendenciaSinal', () => {
  it('indica subida, queda ou estabilidade dentro da tolerância', () => {
    expect(tendenciaSinal(140, 120, 5)).toBe('subiu');
    expect(tendenciaSinal(110, 120, 5)).toBe('caiu');
    expect(tendenciaSinal(122, 120, 5)).toBe('estável');
    expect(tendenciaSinal(null, 120)).toBeNull();
  });
});
