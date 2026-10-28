import { beforeEach, describe, expect, it } from 'vitest';
import { chaveChamada, lerChamadasAnunciadas, salvarChamadasAnunciadas } from './painelChamadas';

describe('chamadas já anunciadas no painel', () => {
  beforeEach(() => localStorage.clear());

  it('identifica cada chamada pela linha e pelo instante da chamada', () => {
    expect(chaveChamada({ id: 'f1', updated_at: '2026-10-24T13:00:00Z', horario_chegada: 'x' })).toBe('f1:2026-10-24T13:00:00Z');
    expect(chaveChamada({ id: 'f1', updated_at: null, horario_chegada: '2026-10-24T12:00:00Z' })).toBe('f1:2026-10-24T12:00:00Z');
  });

  it('sobrevive à recarga do painel, separado por clínica', () => {
    salvarChamadasAnunciadas('c1', ['f1:t1', 'f2:t2']);
    expect([...lerChamadasAnunciadas('c1')]).toEqual(['f1:t1', 'f2:t2']);
    expect(lerChamadasAnunciadas('c2').size).toBe(0);
  });

  it('tolera armazenamento corrompido ou bloqueado', () => {
    localStorage.setItem('elolab:painel-tv:chamadas-anunciadas:c1', '{nao-json');
    expect(lerChamadasAnunciadas('c1').size).toBe(0);
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('bloqueado'); };
    try {
      expect(() => salvarChamadasAnunciadas('c1', ['f1:t1'])).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
