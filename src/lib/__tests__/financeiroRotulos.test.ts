import { describe, expect, it, vi } from 'vitest';
import {
  formaPagamentoCanonica,
  formaPagamentoParaRpc,
  normalizarCategoria,
  rotuloCategoria,
  rotuloCategoriaCadastro,
  rotuloCentroCusto,
  rotuloFormaPagamento,
  rotuloFrequencia,
  somarPorCategoria,
} from '../financeiroRotulos';
import { CHAVES_FINANCEIRO, invalidarFinanceiro } from '../invalidarFinanceiro';

describe('categorias do financeiro', () => {
  it('normaliza a chave: caixa, espaços e vazio', () => {
    expect(normalizarCategoria('Outros')).toBe('outros');
    expect(normalizarCategoria('  Folha Pagamento ')).toBe('folha_pagamento');
    expect(normalizarCategoria(null)).toBe('outros');
    expect(normalizarCategoria('')).toBe('outros');
  });

  it('soma "Outros" e "outros" na mesma linha, com um rótulo só', () => {
    const linhas = somarPorCategoria([
      { categoria: 'Outros', valor: 10 },
      { categoria: 'outros', valor: 5 },
      { categoria: 'consulta', valor: 100 },
      { categoria: null, valor: 1 },
    ]);
    expect(linhas).toEqual([
      { cat: 'consulta', label: 'Consultas', valor: 100 },
      { cat: 'outros', label: 'Outros', valor: 16 },
    ]);
  });

  it('dá rótulo legível a categoria desconhecida', () => {
    expect(rotuloCategoria('material_escritorio')).toBe('Material escritorio');
    expect(rotuloCategoriaCadastro('despesa', 'folha_pagamento')).toBe('Folha de pagamento');
    expect(rotuloCategoriaCadastro('receita', 'consulta')).toBe('Consulta médica');
  });
});

describe('formas de pagamento, centros de custo e frequência', () => {
  it('converte cartão para o formato do RPC e de volta', () => {
    expect(formaPagamentoParaRpc('cartao_credito')).toBe('credito');
    expect(formaPagamentoParaRpc('pix')).toBe('pix');
    expect(formaPagamentoCanonica('debito')).toBe('cartao_debito');
    expect(formaPagamentoCanonica(null)).toBe('outros');
    expect(rotuloFormaPagamento('credito')).toBe('Cartão de crédito');
    expect(rotuloFormaPagamento(null)).toBe('—');
  });

  it('rotula centros de custo das duas listas e o vazio', () => {
    expect(rotuloCentroCusto('centro_cirurgico')).toBe('Centro cirúrgico');
    expect(rotuloCentroCusto('matriz')).toBe('Unidade matriz');
    expect(rotuloCentroCusto('')).toBe('Sem centro de custo');
    expect(rotuloFrequencia('mensal')).toBe('Mensal');
    expect(rotuloFrequencia(null)).toBe('Frequência não definida');
  });
});

describe('invalidarFinanceiro', () => {
  it('invalida todas as consultas de dinheiro de uma vez', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    await invalidarFinanceiro({ invalidateQueries });
    const chaves = invalidateQueries.mock.calls.map(([opcoes]) => opcoes.queryKey[0]);
    expect(chaves).toEqual([...CHAVES_FINANCEIRO]);
    expect(chaves).toEqual(expect.arrayContaining(['lancamentos', 'financeiro-pagamentos', 'dre-pagamentos', 'pagamentos-fluxo-caixa', 'inadimplentes']));
  });
});
