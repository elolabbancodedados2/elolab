import { describe, expect, it } from 'vitest';
import { rotuloAutorizacao, situacaoAutorizacao } from '../guiaExternaAutorizacao';

describe('validade da autorização da guia externa', () => {
  const hoje = '2026-11-01';

  it('classifica vencida, vencendo e vigente', () => {
    expect(situacaoAutorizacao('2026-10-31', hoje)).toEqual({ situacao: 'vencida', dias: -1 });
    expect(situacaoAutorizacao('2026-11-01', hoje)).toEqual({ situacao: 'vencendo', dias: 0 });
    expect(situacaoAutorizacao('2026-11-06', hoje)).toEqual({ situacao: 'vencendo', dias: 5 });
    expect(situacaoAutorizacao('2026-11-07', hoje)).toEqual({ situacao: 'vigente', dias: 6 });
    expect(situacaoAutorizacao(null, hoje)).toEqual({ situacao: 'sem_validade', dias: null });
  });

  it('gera o texto do selo só quando há problema', () => {
    expect(rotuloAutorizacao('vencida', -3)).toBe('Autorização vencida');
    expect(rotuloAutorizacao('vencendo', 0)).toBe('Autorização vence hoje');
    expect(rotuloAutorizacao('vencendo', 1)).toBe('Autorização vence em 1 dia');
    expect(rotuloAutorizacao('vigente', 10)).toBeNull();
  });
});
