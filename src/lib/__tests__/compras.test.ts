import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compararCotacao, economiaSobreMaisCaro, formatarCnpj, itensParaCotar, lerPreco } from '../compras';
import { mensagemErroCompras } from '../comprasApi';

const fornecedores = [
  { id: 'f-b', nome: 'Beta Distribuidora', ativo: true },
  { id: 'f-a', nome: 'Alfa Hospitalar', ativo: true },
  { id: 'f-c', nome: 'Cirúrgica Central', ativo: true },
];
const itens = [
  { id: 'i1', descricao: 'Luva de procedimento', quantidade: 10, unidade: 'caixa' },
  { id: 'i2', descricao: 'Seringa 5 ml', quantidade: 100, unidade: 'unidade' },
];

describe('compararCotacao', () => {
  it('escolhe o menor preço por item e soma os totais por fornecedor', () => {
    const r = compararCotacao(itens, [
      { cotacao_item_id: 'i1', fornecedor_id: 'f-a', preco_unitario: 25.5 },
      { cotacao_item_id: 'i1', fornecedor_id: 'f-b', preco_unitario: 22.9 },
      { cotacao_item_id: 'i2', fornecedor_id: 'f-a', preco_unitario: 0.45 },
      { cotacao_item_id: 'i2', fornecedor_id: 'f-b', preco_unitario: 0.52 },
    ], fornecedores);

    expect(r.fornecedores.map(f => f.id)).toEqual(['f-a', 'f-b']);
    expect(r.linhas[0].vencedorId).toBe('f-b');
    expect(r.linhas[1].vencedorId).toBe('f-a');
    expect(r.linhas[0].celulas['f-b']).toMatchObject({ subtotal: 229, vencedora: true, menorPreco: true });
    expect(r.linhas[0].celulas['f-a'].vencedora).toBe(false);

    const alfa = r.totais.find(t => t.fornecedor.id === 'f-a')!;
    const beta = r.totais.find(t => t.fornecedor.id === 'f-b')!;
    expect(alfa).toMatchObject({ totalCotado: 300, itensCotados: 2, totalVencido: 45, itensVencidos: 1, cotouTudo: true });
    expect(beta).toMatchObject({ totalCotado: 281, totalVencido: 229, itensVencidos: 1 });
    expect(r.totalMenorPreco).toBe(274);
    expect(r.podeGerarPedidos).toBe(true);
    // O mais caro que cotou tudo é f-a (300): a economia é 300 - 274.
    expect(economiaSobreMaisCaro(r)).toBe(26);
  });

  it('no empate de preço vence o menor prazo e depois o nome do fornecedor', () => {
    const porPrazo = compararCotacao([itens[0]], [
      { cotacao_item_id: 'i1', fornecedor_id: 'f-a', preco_unitario: 20, prazo_dias: null },
      { cotacao_item_id: 'i1', fornecedor_id: 'f-b', preco_unitario: 20, prazo_dias: 3 },
      { cotacao_item_id: 'i1', fornecedor_id: 'f-c', preco_unitario: 20, prazo_dias: 7 },
    ], fornecedores);
    expect(porPrazo.linhas[0].empate).toBe(true);
    expect(porPrazo.linhas[0].vencedorId).toBe('f-b');
    expect(Object.values(porPrazo.linhas[0].celulas).filter(c => c.menorPreco)).toHaveLength(3);
    expect(Object.values(porPrazo.linhas[0].celulas).filter(c => c.vencedora)).toHaveLength(1);

    const porNome = compararCotacao([itens[0]], [
      { cotacao_item_id: 'i1', fornecedor_id: 'f-c', preco_unitario: 20.001 },
      { cotacao_item_id: 'i1', fornecedor_id: 'f-a', preco_unitario: 20 },
    ], fornecedores);
    expect(porNome.linhas[0].empate).toBe(true);
    expect(porNome.linhas[0].vencedorId).toBe('f-a');
  });

  it('aponta item sem proposta e bloqueia a geração dos pedidos', () => {
    const r = compararCotacao(itens, [
      { cotacao_item_id: 'i1', fornecedor_id: 'f-a', preco_unitario: 10 },
    ], fornecedores);
    expect(r.linhas[1]).toMatchObject({ semProposta: true, vencedorId: null, menorPreco: null, empate: false });
    expect(r.itensSemProposta.map(i => i.id)).toEqual(['i2']);
    expect(r.totais[0]).toMatchObject({ cotouTudo: false, itensCotados: 1, totalCotado: 100 });
    expect(r.totalMenorPreco).toBe(100);
    expect(r.podeGerarPedidos).toBe(false);
  });

  it('ignora fornecedor inativo e cotação sem itens não gera pedidos', () => {
    const r = compararCotacao([itens[0]], [
      { cotacao_item_id: 'i1', fornecedor_id: 'f-a', preco_unitario: 1 },
      { cotacao_item_id: 'i1', fornecedor_id: 'f-b', preco_unitario: 5 },
    ], [{ ...fornecedores[1], ativo: false }, fornecedores[0]]);
    expect(r.fornecedores.map(f => f.id)).toEqual(['f-b']);
    expect(r.linhas[0].vencedorId).toBe('f-b');
    expect(compararCotacao([], [], fornecedores).podeGerarPedidos).toBe(false);
  });

  it('arredonda subtotais em centavos', () => {
    const r = compararCotacao([{ id: 'i', descricao: 'Gaze', quantidade: 3, unidade: null }], [
      { cotacao_item_id: 'i', fornecedor_id: 'f-a', preco_unitario: 0.1 },
    ], fornecedores);
    expect(r.linhas[0].celulas['f-a'].subtotal).toBe(0.3);
    expect(r.totalMenorPreco).toBe(0.3);
  });
});

describe('apoio das compras', () => {
  it('sugere repor os itens em estoque baixo até o máximo ou o dobro do mínimo', () => {
    expect(itensParaCotar([
      { id: 'a', nome: 'Luva', quantidade: 2, quantidade_minima: 10, quantidade_maxima: 50, unidade: 'caixa' },
      { id: 'b', nome: 'Gaze', quantidade: 3, quantidade_minima: 5, unidade: 'pacote' },
      { id: 'c', nome: 'Álcool', quantidade: 40, quantidade_minima: 5 },
    ])).toEqual([
      { estoque_id: 'a', descricao: 'Luva', unidade: 'caixa', quantidade: 48 },
      { estoque_id: 'b', descricao: 'Gaze', unidade: 'pacote', quantidade: 7 },
    ]);
  });

  it('usa o ponto de pedido quando ele é maior que o mínimo', () => {
    expect(itensParaCotar([
      { id: 'a', nome: 'Seringa', quantidade: 8, quantidade_minima: 5, ponto_pedido: 10, quantidade_maxima: 30 },
      { id: 'b', nome: 'Máscara', quantidade: 11, quantidade_minima: 5, ponto_pedido: 10 },
    ])).toEqual([{ estoque_id: 'a', descricao: 'Seringa', unidade: null, quantidade: 22 }]);
  });

  it('não cota de novo itens já em cotação aberta ou pedido não recebido', () => {
    const estoque = [
      { id: 'a', nome: 'Luva', quantidade: 2, quantidade_minima: 10 },
      { id: 'b', nome: 'Gaze', quantidade: 1, quantidade_minima: 5 },
      { id: 'c', nome: 'Álcool', quantidade: 0, quantidade_minima: 3 },
    ];
    const emCompra = new Set(['a', 'c', 'outro']);
    expect(itensParaCotar(estoque, emCompra).map(i => i.estoque_id)).toEqual(['b']);
    expect(itensParaCotar(estoque).length - itensParaCotar(estoque, emCompra).length).toBe(2);
  });

  it('lê preços em formato brasileiro e rejeita texto inválido', () => {
    expect(lerPreco('12,50')).toBe(12.5);
    expect(lerPreco('1.234,56')).toBe(1234.56);
    expect(lerPreco('0.45')).toBe(0.45);
    expect(lerPreco('')).toBeNull();
    expect(lerPreco('12,5,0')).toBeNull();
  });

  it('formata CNPJ e mostra as mensagens das regras do banco', () => {
    expect(formatarCnpj('12345678000190')).toBe('12.345.678/0001-90');
    expect(mensagemErroCompras({ message: 'Pedido cancelado não pode ser recebido.' })).toBe('Pedido cancelado não pode ser recebido.');
    expect(mensagemErroCompras({ message: 'new row violates row-level security policy' })).toBe('Seu perfil não pode fazer esta alteração.');
  });
});

describe('migration de compras', () => {
  const sql = readFileSync('supabase/migrations/20261031121000_compras_cotacoes_pedidos.sql', 'utf8');

  it('cria as tabelas com RLS e funções seguras', () => {
    for (const tabela of ['fornecedores', 'cotacoes_compra', 'cotacao_itens', 'cotacao_propostas', 'pedidos_compra', 'pedido_compra_itens']) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${tabela} \\(`));
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${tabela} ENABLE ROW LEVEL SECURITY`));
    }
    expect(sql.trim().startsWith('--')).toBe(true);
    expect(sql).toMatch(/^BEGIN;$/m);
    expect(sql.trim().endsWith('COMMIT;')).toBe(true);
    expect(sql).toMatch(/UNIQUE \(cotacao_item_id, fornecedor_id\)/);
    expect(sql).toMatch(/fornecedores_clinica_cnpj_unico[\s\S]*WHERE cnpj IS NOT NULL/);
    const definers = sql.match(/SECURITY DEFINER\s+SET search_path = public, pg_temp/g) ?? [];
    expect(definers.length).toBe((sql.match(/SECURITY DEFINER/g) ?? []).length);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.gerar_pedidos_da_cotacao\(uuid\) FROM PUBLIC, anon;/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.receber_pedido_compra\(uuid\) FROM PUBLIC, anon;/);
  });

  it('recebe o pedido uma única vez reaproveitando a movimentação do estoque', () => {
    const receber = sql.match(/CREATE OR REPLACE FUNCTION public\.receber_pedido_compra[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(receber).toMatch(/FOR UPDATE/);
    expect(receber).toMatch(/IF v_pedido\.status = 'recebido' THEN[\s\S]*'ja_recebido', true/);
    expect(receber).toMatch(/public\.registrar_movimentacao_estoque\([\s\S]*'entrada'[\s\S]*v_item\.id\s*\)/);
    expect(receber).toMatch(/recebido_por = auth\.uid\(\), recebido_em = now\(\)/);
  });

  it('gera pedidos pelo menor preço com o mesmo desempate da tela', () => {
    const gerar = sql.match(/CREATE OR REPLACE FUNCTION public\.gerar_pedidos_da_cotacao[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(gerar).toMatch(/ORDER BY i\.id, cp\.preco_unitario, cp\.prazo_dias NULLS LAST, lower\(f\.nome\), f\.id/);
    expect(gerar).toMatch(/UPDATE public\.cotacoes_compra SET status = 'fechada'/);
    expect(gerar).toMatch(/RETURNS uuid\[\]/);
  });
});
