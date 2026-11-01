import { describe, expect, it } from 'vitest';
import { dataNascimentoImplausivel } from '@/lib/dataNascimento';

describe('dataNascimentoImplausivel', () => {
  const referencia = new Date(2026, 10, 1);

  it('recusa datas antes de 1900', () => {
    expect(dataNascimentoImplausivel('1899-12-31', referencia)).toBe(true);
    expect(dataNascimentoImplausivel('0198-05-10', referencia)).toBe(true);
  });

  it('recusa idade acima de 130 anos', () => {
    expect(dataNascimentoImplausivel('1896-10-31', referencia)).toBe(true);
  });

  it('aceita datas plausíveis', () => {
    expect(dataNascimentoImplausivel('1900-01-01', referencia)).toBe(false);
    expect(dataNascimentoImplausivel('1990-05-10', referencia)).toBe(false);
  });
});
