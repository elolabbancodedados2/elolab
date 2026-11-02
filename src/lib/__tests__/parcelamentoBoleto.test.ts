import { describe, expect, it } from 'vitest';
import { dividirEmParcelas } from '../parcelamento';
import {
  boletoDasObservacoes,
  lerLinhaDigitavel,
  modulo10,
  modulo11Bancario,
  observacoesComBoleto,
  vencimentoDoFator,
} from '../boleto';

describe('dividirEmParcelas', () => {
  it('distribui os centavos e mantém a soma exata', () => {
    const parcelas = dividirEmParcelas({ total: 100, quantidade: 3, primeiroVencimento: '2026-11-10', descricao: 'Tratamento' });
    expect(parcelas.map(p => p.valor)).toEqual([33.34, 33.33, 33.33]);
    expect(parcelas.map(p => p.vencimento)).toEqual(['2026-11-10', '2026-12-10', '2027-01-10']);
    expect(parcelas.map(p => p.descricao)).toEqual(['Tratamento (1/3)', 'Tratamento (2/3)', 'Tratamento (3/3)']);
  });

  it('ajusta ao fim do mês sem arrastar o dia das parcelas seguintes', () => {
    const parcelas = dividirEmParcelas({ total: 90, quantidade: 3, primeiroVencimento: '2026-01-31', descricao: 'Aparelho' });
    expect(parcelas.map(p => p.vencimento)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('à vista mantém a descrição e recusa entradas inválidas', () => {
    expect(dividirEmParcelas({ total: 50, quantidade: 1, primeiroVencimento: '2026-11-10', descricao: ' Consulta ' }))
      .toEqual([{ numero: 1, total: 1, valor: 50, vencimento: '2026-11-10', descricao: 'Consulta' }]);
    expect(dividirEmParcelas({ total: 0, quantidade: 2, primeiroVencimento: '2026-11-10', descricao: 'x' })).toEqual([]);
    expect(dividirEmParcelas({ total: 0.01, quantidade: 2, primeiroVencimento: '2026-11-10', descricao: 'x' })).toEqual([]);
    expect(dividirEmParcelas({ total: 10, quantidade: 37, primeiroVencimento: '2026-11-10', descricao: 'x' })).toEqual([]);
    expect(dividirEmParcelas({ total: 10, quantidade: 2, primeiroVencimento: '10/11/2026', descricao: 'x' })).toEqual([]);
  });
});

/** Monta uma linha digitável bancária válida a partir do código de barras. */
function linhaBancaria(banco: string, fator: string, valorCentavos: string, livre: string): string {
  const semDv = `${banco}9${fator}${valorCentavos}${livre}`; // 43 dígitos (sem o DV geral)
  const dv = modulo11Bancario(semDv);
  const barras = `${semDv.slice(0, 4)}${dv}${semDv.slice(4)}`;
  const campo1 = barras.slice(0, 4) + barras.slice(19, 24);
  const campo2 = barras.slice(24, 34);
  const campo3 = barras.slice(34, 44);
  return `${campo1}${modulo10(campo1)}${campo2}${modulo10(campo2)}${campo3}${modulo10(campo3)}${dv}${barras.slice(5, 19)}`;
}

describe('lerLinhaDigitavel', () => {
  const hoje = '2026-11-01';

  it('lê valor e vencimento de um boleto bancário', () => {
    // Fator 1000 no ciclo atual = 22/02/2025; 1000 + 617 dias = 01/11/2026.
    const linha = linhaBancaria('001', '1617', '0000015050', '1234567890123456789012345');
    expect(linha).toHaveLength(47);
    const leitura = lerLinhaDigitavel(linha.replace(/(\d{5})(\d{5})/, '$1.$2 '), hoje);
    expect(leitura.ok).toBe(true);
    expect(leitura.boleto).toMatchObject({ tipo: 'bancario', valor: 150.5, vencimento: '2026-11-01' });
  });

  it('acusa dígito trocado e tamanho errado', () => {
    const linha = linhaBancaria('341', '1617', '0000010000', '9999999999999999999999999');
    const trocada = `${linha.slice(0, 2)}${(Number(linha[2]) + 1) % 10}${linha.slice(3)}`;
    expect(lerLinhaDigitavel(trocada, hoje)).toMatchObject({ ok: false });
    expect(lerLinhaDigitavel('123', hoje).erro).toContain('3 dígitos');
    expect(lerLinhaDigitavel('', hoje).ok).toBe(false);
  });

  it('reconhece os dois ciclos do fator de vencimento', () => {
    expect(vencimentoDoFator(1000, '2000-07-01')).toBe('2000-07-03');
    expect(vencimentoDoFator(1000, '2025-03-01')).toBe('2025-02-22');
    expect(vencimentoDoFator(999, hoje)).toBeNull();
  });

  it('lê conta de consumo (arrecadação) com módulo 10', () => {
    const barras = '8' + '3' + '6' + '0' + '00000012345' + '0001' + '12345678901234567890'.slice(0, 22 - 0);
    const corpo = barras.slice(0, 44).padEnd(44, '0');
    // recalcula o DV geral (posição 4) para a referência 6 (módulo 10)
    const semDv = corpo.slice(0, 3) + corpo.slice(4);
    const comDv = corpo.slice(0, 3) + modulo10(semDv) + corpo.slice(4);
    const blocos = [0, 1, 2, 3].map(i => comDv.slice(i * 11, i * 11 + 11));
    const linha = blocos.map(b => `${b}${modulo10(b)}`).join('');
    const leitura = lerLinhaDigitavel(linha, hoje);
    expect(leitura.ok).toBe(true);
    expect(leitura.boleto).toMatchObject({ tipo: 'arrecadacao', vencimento: null });
    expect(leitura.boleto?.valor).toBe(Number(comDv.slice(4, 15)) / 100);
  });

  it('guarda e recupera a linha nas observações', () => {
    const obs = observacoesComBoleto('Aluguel de novembro', '12345');
    expect(obs).toBe('Aluguel de novembro\nLinha digitável do boleto: 12345');
    expect(boletoDasObservacoes(obs)).toBe('12345');
    expect(observacoesComBoleto(obs, '')).toBe('Aluguel de novembro');
    expect(boletoDasObservacoes(null)).toBeNull();
  });
});
