import { describe, expect, it } from 'vitest';
import { buscarEmBlocos } from '@/lib/buscarEmBlocos';

describe('buscarEmBlocos', () => {
  it('lê todos os registros quando a consulta passa do limite padrão do PostgREST', async () => {
    const registros = Array.from({ length: 2_501 }, (_, id) => ({ id }));
    const resultado = await buscarEmBlocos(() => ({
      range: async (inicio: number, fim: number) => ({
        data: registros.slice(inicio, fim + 1),
        error: null,
      }),
    }));

    expect(resultado).toHaveLength(registros.length);
    expect(resultado[resultado.length - 1]).toEqual({ id: 2_500 });
  });

  it('propaga erros em qualquer bloco em vez de devolver uma lista parcial como sucesso', async () => {
    let chamadas = 0;
    await expect(buscarEmBlocos(() => ({
      range: async () => {
        chamadas += 1;
        return chamadas === 1
          ? { data: Array.from({ length: 1_000 }, (_, id) => id), error: null }
          : { data: null, error: new Error('falha no segundo bloco') };
      },
    }))).rejects.toThrow('falha no segundo bloco');
  });
});
