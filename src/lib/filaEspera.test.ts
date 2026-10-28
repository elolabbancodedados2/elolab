import { describe, expect, it } from 'vitest';
import { formatarEspera, minutosDeEspera, nivelEspera } from './filaEspera';

const AGORA = Date.parse('2026-10-24T13:00:00Z');
const haMinutos = (mins: number) => new Date(AGORA - mins * 60_000).toISOString();

describe('tempo de espera da fila', () => {
  it('calcula minutos inteiros e recusa horários ausentes ou inválidos', () => {
    expect(minutosDeEspera(haMinutos(12), AGORA)).toBe(12);
    expect(minutosDeEspera(null, AGORA)).toBeNull();
    expect(minutosDeEspera('não é data', AGORA)).toBeNull();
    // Relógio do dispositivo adiantado não gera espera negativa.
    expect(minutosDeEspera(haMinutos(-5), AGORA)).toBe(0);
  });

  it('formata a espera em texto legível', () => {
    expect(formatarEspera(null)).toBe('—');
    expect(formatarEspera(0)).toBe('agora');
    expect(formatarEspera(14)).toBe('14 min');
    expect(formatarEspera(75)).toBe('1h 15min');
  });

  it('nomeia o nível da espera em texto, não só em cor', () => {
    expect(nivelEspera(null)).toEqual({ nivel: 'sem_registro', rotulo: 'Sem horário de chegada' });
    expect(nivelEspera(14)).toEqual({ nivel: 'no_prazo', rotulo: 'No prazo' });
    expect(nivelEspera(15)).toEqual({ nivel: 'atencao', rotulo: 'Espera longa' });
    expect(nivelEspera(29)).toEqual({ nivel: 'atencao', rotulo: 'Espera longa' });
    expect(nivelEspera(30)).toEqual({ nivel: 'atrasado', rotulo: 'Atrasado' });
  });
});
