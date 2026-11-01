import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ehErroDeVersao, recarregarUmaVez } from '../recargaVersao';

describe('recarga após nova versão', () => {
  beforeEach(() => sessionStorage.clear());

  it('reconhece erros de módulo sob demanda que sumiu', () => {
    expect(ehErroDeVersao(new TypeError('Failed to fetch dynamically imported module: /assets/x.js'))).toBe(true);
    expect(ehErroDeVersao(new Error('Importing a module script failed.'))).toBe(true);
    expect(ehErroDeVersao({ name: 'ChunkLoadError', message: 'Loading chunk 12 failed.' })).toBe(true);
    expect(ehErroDeVersao(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(ehErroDeVersao(null)).toBe(false);
  });

  it('recarrega só uma vez dentro da janela, evitando ciclo', () => {
    const reload = vi.fn();
    expect(recarregarUmaVez(reload, 1_000_000)).toBe(true);
    expect(recarregarUmaVez(reload, 1_010_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    // Um deploy posterior, minutos depois, volta a permitir uma recarga.
    expect(recarregarUmaVez(reload, 1_200_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
