import { describe, expect, it } from 'vitest';
import { temSinaisPreenchidos, triagemParaSinais } from '../triagemParaSinais';

describe('triagemParaSinais', () => {
  it('separa a pressão e converte números em texto', () => {
    expect(triagemParaSinais({
      pressao_arterial: '130 / 85', frequencia_cardiaca: 88, temperatura: 37.2, saturacao: 97,
      peso: '72.50', altura: '170.00', glicemia: null, dor_escala: 3,
    })).toMatchObject({
      pressao_sistolica: '130', pressao_diastolica: '85', frequencia_cardiaca: '88',
      temperatura: '37.2', saturacao: '97', peso: '72.50', altura: '170.00', glicemia: '', dor: '3',
    });
  });

  it('ignora pressão escrita fora do padrão', () => {
    const sinais = triagemParaSinais({ pressao_arterial: 'não aferida' });
    expect(sinais.pressao_sistolica).toBe('');
    expect(sinais.pressao_diastolica).toBe('');
  });

  it('diz se há algum sinal preenchido', () => {
    expect(temSinaisPreenchidos({ pressao_sistolica: '', peso: ' ' })).toBe(false);
    expect(temSinaisPreenchidos({ pressao_sistolica: '', saturacao: '98' })).toBe(true);
    expect(temSinaisPreenchidos(null)).toBe(false);
  });
});
