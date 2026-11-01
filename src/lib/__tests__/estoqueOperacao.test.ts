import { describe, expect, it } from 'vitest';
import {
  ajustesInventario, consumoPorItem, csvPosicaoEstoque, curvaAbc, diasAteRuptura, lerFiltroAlerta,
  motivoDescarteVencido, pareceCodigoBarras, precisaReposicao, rotuloCategoriaEstoque, rotuloUnidadeEstoque,
  saldosAposMovimentacoes, sugestaoPorConsumo, textoDuracao,
} from '@/lib/estoqueOperacao';
import { itensParaCotar } from '@/lib/compras';

describe('estoque: rótulos e filtros', () => {
  it('escreve categorias e unidades como o usuário espera', () => {
    expect(rotuloCategoriaEstoque('epis')).toBe('EPIs');
    expect(rotuloCategoriaEstoque('materiais_hospitalares')).toBe('Materiais hospitalares');
    expect(rotuloUnidadeEstoque('ml')).toBe('mL');
    expect(rotuloUnidadeEstoque('kg')).toBe('kg');
    expect(rotuloUnidadeEstoque('caixa')).toBe('Caixa');
  });

  it('aceita os cinco filtros de alerta na URL', () => {
    for (const filtro of ['critico', 'vencidos', 'validade', 'ponto_pedido']) expect(lerFiltroAlerta(filtro)).toBe(filtro);
    expect(lerFiltroAlerta('qualquer')).toBe('todos');
    expect(lerFiltroAlerta(null)).toBe('todos');
  });

  it('reposição considera mínimo ou ponto de pedido', () => {
    expect(precisaReposicao({ id: 'a', nome: 'a', quantidade: 8, quantidade_minima: 5, ponto_pedido: 10 })).toBe(true);
    expect(precisaReposicao({ id: 'a', nome: 'a', quantidade: 11, quantidade_minima: 5, ponto_pedido: 10 })).toBe(false);
  });

  it('reconhece códigos de barras completos', () => {
    expect(pareceCodigoBarras('7891234567895')).toBe(true);
    expect(pareceCodigoBarras('12345')).toBe(false);
    expect(pareceCodigoBarras('dipirona')).toBe(false);
  });
});

describe('estoque: consumo e ruptura', () => {
  it('soma só as saídas e estima a duração', () => {
    const consumo = consumoPorItem([
      { item_id: 'a', tipo: 'saida', quantidade: 60 },
      { item_id: 'a', tipo: 'entrada', quantidade: 500 },
      { item_id: 'a', tipo: 'saida', quantidade: 30 },
    ]);
    expect(consumo.get('a')).toBe(90);
    expect(diasAteRuptura(15, 90)).toBe(15);
    expect(diasAteRuptura(15, 0)).toBeNull();
    expect(textoDuracao(15)).toBe('dura ~15 dias');
    expect(textoDuracao(0)).toBe('acaba hoje no ritmo atual');
  });

  it('sugere cobrir 30 dias acima do mínimo', () => {
    expect(sugestaoPorConsumo({ id: 'a', nome: 'a', quantidade: 10, quantidade_minima: 5 }, 90)).toBe(25);
    expect(sugestaoPorConsumo({ id: 'a', nome: 'a', quantidade: 10, quantidade_minima: 5 }, 0)).toBe(0);
  });

  it('cotação usa o consumo quando ele pede mais que a regra do mínimo', () => {
    const estoque = [{ id: 'a', nome: 'Luva', quantidade: 2, quantidade_minima: 5, unidade: 'caixa' }];
    expect(itensParaCotar(estoque)[0].quantidade).toBe(8);
    expect(itensParaCotar(estoque, new Set(), new Map([['a', 270]]))[0].quantidade).toBe(93);
  });
});

describe('estoque: Curva ABC, inventário e histórico', () => {
  const itens = [
    { id: 'a', nome: 'Caro', categoria: 'outros', quantidade: 1, valor_unitario: 1000 },
    { id: 'b', nome: 'Giro', categoria: 'outros', quantidade: 1, valor_unitario: 10 },
  ];

  it('classifica por valor parado ou por consumo', () => {
    expect(curvaAbc(itens, 'valor')[0].id).toBe('a');
    expect(curvaAbc(itens, 'consumo', new Map([['b', 500]]))[0].id).toBe('b');
    expect(curvaAbc(itens, 'consumo')).toEqual([]);
  });

  it('gera ajuste só para contagem diferente e válida', () => {
    expect(ajustesInventario(itens, { a: '3', b: '1' })).toEqual([{ id: 'a', nome: 'Caro', sistema: 1, contado: 3, diferenca: 2, tipo: 'entrada' }]);
    expect(ajustesInventario(itens, { a: '', b: '0,5' })).toEqual([]);
    expect(ajustesInventario(itens, { b: '0' })[0]).toMatchObject({ tipo: 'saida', diferenca: -1 });
  });

  it('reconstrói o saldo após cada movimentação a partir do saldo atual', () => {
    expect(saldosAposMovimentacoes(10, [
      { tipo: 'saida', quantidade: 2 },
      { tipo: 'entrada', quantidade: 5 },
      { tipo: 'saida', quantidade: 1 },
    ])).toEqual([10, 12, 7]);
  });

  it('exporta CSV com ponto e vírgula e protege fórmulas', () => {
    const csv = csvPosicaoEstoque([{ id: 'a', nome: '=SOMA(1)', categoria: 'epis', quantidade: 2, valor_unitario: 1.5, unidade: 'ml', validade: '2027-03-01' }]);
    expect(csv.startsWith('﻿"Produto";')).toBe(true);
    expect(csv).toContain('"\'=SOMA(1)";"EPIs"');
    expect(csv).toContain('"mL"');
    expect(csv).toContain('"01/03/2027"');
    expect(csv).toContain('"3"');
  });

  it('pré-preenche o motivo do descarte de vencido', () => {
    expect(motivoDescarteVencido('2026-10-01')).toBe('Descarte por vencimento (validade 01/10/2026)');
  });
});
