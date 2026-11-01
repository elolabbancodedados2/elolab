import { describe, expect, it } from 'vitest';
import { itensCopiados, lerCsvTabela, lerValor, previaMesclagem, previaReajuste, resumoPrevia } from '@/lib/tabelaPrecosConvenio';

const existente = (id: string, tipo: string, valor: number) => ({ id, tipo_exame: tipo, codigo_tuss: null, descricao: null, valor_tabela: valor, valor_filme: 0, valor_custo: 0, valor_repasse: 0 });

describe('tabelaPrecosConvenio', () => {
  it('lê valores em formato brasileiro', () => {
    expect(lerValor('1.234,56')).toBe(1234.56);
    expect(lerValor('R$ 89,90')).toBe(89.9);
    expect(lerValor('12.5')).toBe(12.5);
    expect(lerValor('')).toBe(0);
    expect(lerValor('abc')).toBeNaN();
  });

  it('importa CSV com ponto e vírgula e aponta linhas com problema', () => {
    const csv = '﻿Exame;TUSS;Valor;Filme\nHemograma;40304361;"12,50";0\nGlicose;123;8,00;\nHemograma;;10;\n;;5;\nUreia;;0;';
    const { itens, erros } = lerCsvTabela(csv);
    expect(itens).toEqual([{ tipo_exame: 'Hemograma', codigo_tuss: '40304361', descricao: null, valor_tabela: 12.5, valor_filme: 0, valor_custo: 0, valor_repasse: 0 }]);
    expect(erros.map(e => e.linha)).toEqual([3, 4, 5, 6]);
  });

  it('exige as colunas exame e valor', () => {
    expect(lerCsvTabela('nome,tuss\nA,1').erros[0].mensagem).toMatch(/cabeçalho/);
  });

  it('mescla pelo nome do exame, sem diferenciar acento e caixa', () => {
    const previa = previaMesclagem(
      [{ tipo_exame: 'GLICOSE', codigo_tuss: null, descricao: null, valor_tabela: 9, valor_filme: 0, valor_custo: 0, valor_repasse: 0 },
        { tipo_exame: 'Ureia', codigo_tuss: null, descricao: null, valor_tabela: 7, valor_filme: 0, valor_custo: 0, valor_repasse: 0 },
        { tipo_exame: 'Ácido úrico', codigo_tuss: null, descricao: null, valor_tabela: 5, valor_filme: 0, valor_custo: 0, valor_repasse: 0 }],
      [existente('g', 'Glicose', 8), existente('a', 'Acido urico', 5)],
    );
    expect(previa.map(l => [l.acao, l.id ?? null])).toEqual([['atualizar', 'g'], ['inserir', null], ['manter', 'a']]);
    expect(previa[0].item.tipo_exame).toBe('Glicose');
    expect(resumoPrevia(previa)).toEqual({ inserir: 1, atualizar: 1, manter: 1 });
  });

  it('reajusta em centavos e copia com fator', () => {
    const previa = previaReajuste([existente('g', 'Glicose', 10.05)], 10);
    expect(previa[0].item.valor_tabela).toBe(11.06);
    expect(previaReajuste([existente('g', 'Glicose', 10)], 0)[0].acao).toBe('manter');
    expect(itensCopiados([existente('g', 'Glicose', 100)], 0.9)[0].valor_tabela).toBe(90);
  });
});
