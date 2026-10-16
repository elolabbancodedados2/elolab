import { describe, expect, it } from 'vitest';
import { descricaoRegraPrioridadeFila, ordenarFilaPorPrioridade } from '@/lib/filaPrioridade';
import { readFileSync } from 'node:fs';

describe('ordenação da fila por prioridade', () => {
  it('coloca urgentes antes de preferenciais e normais', () => {
    const fila = [
      { id: 'normal', prioridade: 'normal', posicao: 1 },
      { id: 'preferencial', prioridade: 'preferencial', posicao: 4 },
      { id: 'urgente', prioridade: 'urgente', posicao: 9 },
    ];

    expect(ordenarFilaPorPrioridade(fila).map((item) => item.id)).toEqual([
      'urgente', 'preferencial', 'normal',
    ]);
  });

  it('preserva FIFO dentro da mesma prioridade e trata valores desconhecidos como normal', () => {
    const fila = [
      { id: 'normal-2', prioridade: 'normal', posicao: 2 },
      { id: 'urgente-2', prioridade: 'urgente', posicao: 2 },
      { id: 'urgente-1', prioridade: 'urgente', posicao: 1 },
      { id: 'desconhecida', prioridade: 'legada', posicao: 1 },
    ];

    expect(ordenarFilaPorPrioridade(fila).map((item) => item.id)).toEqual([
      'urgente-1', 'urgente-2', 'desconhecida', 'normal-2',
    ]);
    expect(fila[0].id).toBe('normal-2');
  });

  it('explains which factors determine the call order in the queue screen', () => {
    expect(descricaoRegraPrioridadeFila()).toBe(
      'Ordem de chamada: urgente, preferencial e normal; dentro da mesma prioridade, vale a posição original na fila.',
    );
    const source = readFileSync('src/pages/Fila.tsx', 'utf8');
    expect(source).toMatch(/descricaoRegraPrioridadeFila\(\)/);
    expect(source).toMatch(/prioCfg\.label/);
  });
});
