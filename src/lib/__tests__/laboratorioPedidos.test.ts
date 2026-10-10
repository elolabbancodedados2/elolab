import { describe, expect, it } from 'vitest';
import { normalizarExamesSolicitados } from '@/lib/laboratorio/pedidos';

describe('normalizarExamesSolicitados', () => {
  it('remove espaços excedentes e linhas vazias sem alterar a ordem', () => {
    expect(normalizarExamesSolicitados([' Hemograma ', '', '  Glicose  '])).toEqual(['Hemograma', 'Glicose']);
  });

  it('exige pelo menos um exame preenchido', () => {
    expect(() => normalizarExamesSolicitados(['', '  '])).toThrow('Adicione pelo menos um exame.');
  });

  it('limita o pedido ao máximo suportado pelo banco', () => {
    expect(() => normalizarExamesSolicitados(Array.from({ length: 41 }, (_, index) => `Exame ${index + 1}`)))
      .toThrow('O pedido pode conter no máximo 40 exames.');
  });
});
