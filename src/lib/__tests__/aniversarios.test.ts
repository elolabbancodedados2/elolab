import { describe, expect, it } from 'vitest';
import { isValidDateOnly } from '@/lib/dateOnly';
import { anoBissexto, datasDeNascimentoQueFazemAniversario } from '@/lib/aniversarios';

describe('aniversariantes do dia', () => {
  it('reconhece anos bissextos', () => {
    expect([2024, 2000, 1996].every(anoBissexto)).toBe(true);
    expect([2026, 1900, 2100].some(anoBissexto)).toBe(false);
  });

  it('lista o mesmo dia e mês em cada ano', () => {
    const datas = datasDeNascimentoQueFazemAniversario('2026-10-31');
    expect(datas).toHaveLength(111);
    expect(datas[0]).toBe('2026-10-31');
    expect(datas.at(-1)).toBe('1916-10-31');
  });

  it('em 29/02 só usa anos bissextos, sem datas inválidas', () => {
    const datas = datasDeNascimentoQueFazemAniversario('2028-02-29');
    expect(datas.every(isValidDateOnly)).toBe(true);
    expect(datas).toContain('2024-02-29');
    expect(datas).not.toContain('2027-02-29');
  });

  it('em 28/02 de ano comum inclui quem nasceu em 29/02', () => {
    const datas = datasDeNascimentoQueFazemAniversario('2026-02-28');
    expect(datas).toContain('2026-02-28');
    expect(datas).toContain('2024-02-29');
    expect(datas).toContain('2000-02-29');
    expect(datas).not.toContain('1900-02-29');
    expect(datas.every(isValidDateOnly)).toBe(true);
  });

  it('em 28/02 de ano bissexto não antecipa o 29/02', () => {
    expect(datasDeNascimentoQueFazemAniversario('2028-02-28').some(d => d.endsWith('-02-29'))).toBe(false);
  });
});
