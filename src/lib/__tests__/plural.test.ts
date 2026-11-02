import { describe, expect, it } from 'vitest';
import { contagem, palavra } from '../plural';

describe('concordância de número', () => {
  it('usa singular só para um', () => {
    expect(contagem(1, 'exame')).toBe('1 exame');
    expect(contagem(0, 'exame')).toBe('0 exames');
    expect(contagem(3, 'coleta')).toBe('3 coletas');
  });

  it('aceita plural irregular e formata milhar', () => {
    expect(contagem(2, 'notificação', 'notificações')).toBe('2 notificações');
    expect(contagem(1500, 'amostra')).toBe('1.500 amostras');
    expect(palavra(1, 'falhou', 'falharam')).toBe('falhou');
    expect(palavra(2, 'falhou', 'falharam')).toBe('falharam');
  });
});
