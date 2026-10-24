import { describe, expect, it } from 'vitest';
import { csvCobrancaManual, faixaAtraso, resumoPorFaixa } from '../inadimplencia';

describe('faixas de atraso', () => {
  it('classifica pelos limites de cada faixa', () => {
    expect(faixaAtraso(0)).toBeNull();
    expect(faixaAtraso(1)).toBe('1-30');
    expect(faixaAtraso(30)).toBe('1-30');
    expect(faixaAtraso(31)).toBe('31-60');
    expect(faixaAtraso(60)).toBe('31-60');
    expect(faixaAtraso(61)).toBe('61-90');
    expect(faixaAtraso(90)).toBe('61-90');
    expect(faixaAtraso(91)).toBe('90+');
  });

  it('soma quantidade e saldo por faixa em centavos', () => {
    const resumo = resumoPorFaixa([
      { dias: 5, saldo: 0.1 },
      { dias: 10, saldo: 0.2 },
      { dias: 45, saldo: 100 },
      { dias: 120, saldo: 50.55 },
    ]);
    expect(resumo['1-30']).toEqual({ quantidade: 2, total: 0.3 });
    expect(resumo['31-60']).toEqual({ quantidade: 1, total: 100 });
    expect(resumo['61-90']).toEqual({ quantidade: 0, total: 0 });
    expect(resumo['90+']).toEqual({ quantidade: 1, total: 50.55 });
  });
});

describe('exportação para cobrança manual', () => {
  it('gera CSV com contato, saldo, atraso e faixa, protegido contra fórmulas', () => {
    const csv = csvCobrancaManual([
      { paciente: '=Maria', telefone: '11999990000', email: null, descricao: 'Consulta', saldo: 1234.5, vencimento: '2026-09-01', dias: 45 },
    ]);
    const linhas = csv.replace(/^\uFEFF/, '').split('\r\n');
    expect(linhas[0]).toBe('"Paciente";"Telefone";"E-mail";"Descrição";"Saldo em aberto";"Vencimento";"Dias de atraso";"Faixa de atraso"');
    expect(linhas[1]).toBe('"\'=Maria";"11999990000";"";"Consulta";"1234,50";"01/09/2026";"45";"31 a 60 dias"');
    expect(linhas[2]).toBe('"Total";"";"";"1 título(s)";"1234,50";"";"";""');
  });
});
