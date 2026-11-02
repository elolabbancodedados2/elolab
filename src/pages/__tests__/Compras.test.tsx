import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  roles: ['enfermagem'] as string[],
  tabelas: {} as Record<string, unknown[]>,
  rpc: vi.fn(),
  updates: [] as { tabela: string; dados: unknown; filtros: unknown[][] }[],
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ profile: { clinica_id: 'clinica-1', roles: mocks.roles } }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => {
  const builder = (tabela: string) => {
    const resultado = () => ({ data: mocks.tabelas[tabela] ?? [], error: null });
    const b: Record<string, unknown> = {};
    let atualizacao: { tabela: string; dados: unknown; filtros: unknown[][] } | null = null;
    for (const metodo of ['select', 'eq', 'in', 'order', 'limit', 'insert', 'upsert', 'delete']) {
      b[metodo] = (...args: unknown[]) => { atualizacao?.filtros.push([metodo, ...args]); return b; };
    }
    b.update = (dados: unknown) => { atualizacao = { tabela, dados, filtros: [] }; mocks.updates.push(atualizacao); return b; };
    b.maybeSingle = () => Promise.resolve({ data: (mocks.tabelas[tabela] ?? [])[0] ?? null, error: null });
    b.single = b.maybeSingle;
    b.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resultado()).then(ok, erro);
    return b;
  };
  return { supabase: { from: (tabela: string) => builder(tabela), rpc: mocks.rpc } };
});

import Compras from '../Compras';

function renderizar(rota = '/compras') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[rota]}><Compras /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.roles = ['enfermagem'];
  mocks.updates = [];
  mocks.rpc.mockReset();
  mocks.tabelas = {
    fornecedores: [
      { id: 'f-a', nome: 'Alfa Hospitalar', cnpj: '12345678000190', contato: 'Rita', telefone: null, email: null, ativo: true },
      { id: 'f-b', nome: 'Beta Distribuidora', cnpj: null, contato: null, telefone: null, email: null, ativo: true },
    ],
    cotacoes_compra: [
      { id: 'c1', titulo: 'Reposição de outubro', status: 'aberta', observacoes: null, created_at: '2026-10-30T12:00:00Z', cotacao_itens: [{ id: 'i1' }, { id: 'i2' }] },
    ],
    cotacao_itens: [
      { id: 'i1', cotacao_id: 'c1', descricao: 'Luva de procedimento', quantidade: 10, unidade: 'caixa', estoque_id: 'e1' },
      { id: 'i2', cotacao_id: 'c1', descricao: 'Seringa 5 ml', quantidade: 100, unidade: 'unidade', estoque_id: null },
    ],
    cotacao_propostas: [
      { id: 'p1', cotacao_item_id: 'i1', fornecedor_id: 'f-a', preco_unitario: 25.5, prazo_dias: 5, observacao: null },
      { id: 'p2', cotacao_item_id: 'i1', fornecedor_id: 'f-b', preco_unitario: 22.9, prazo_dias: null, observacao: null },
      { id: 'p3', cotacao_item_id: 'i2', fornecedor_id: 'f-a', preco_unitario: 0.45, prazo_dias: 5, observacao: null },
    ],
    pedidos_compra: [
      {
        id: 'pd1', status: 'emitido', total: 229, created_at: '2026-10-30T15:00:00Z', recebido_em: null,
        fornecedor_id: 'f-b', cotacao_id: 'c0', fornecedores: { nome: 'Beta Distribuidora' }, cotacoes_compra: { titulo: 'Setembro' },
        pedido_compra_itens: [{ id: 'pi1', descricao: 'Luva de procedimento', quantidade: 10, preco_unitario: 22.9, estoque_id: 'e1' }],
      },
    ],
  };
});

describe('Compras', () => {
  it('compara as propostas destacando o menor preço e o total por fornecedor', async () => {
    renderizar();

    expect(screen.getByRole('heading', { level: 1, name: 'Compras' })).toBeInTheDocument();
    const grade = await screen.findByRole('region', { name: 'Comparação de preços' });
    expect(within(grade).getByRole('columnheader', { name: 'Alfa Hospitalar' })).toBeInTheDocument();
    expect(within(grade).getByRole('columnheader', { name: 'Beta Distribuidora' })).toBeInTheDocument();

    const destaques = grade.querySelectorAll('[data-menor-preco="true"]');
    expect(destaques).toHaveLength(2);
    expect(destaques[0]).toHaveTextContent(/22,90/);
    expect(destaques[0].className).toMatch(/border-foreground/);
    expect(destaques[0].className).toMatch(/font-semibold/);
    expect(destaques[0].className).not.toMatch(/green|emerald|success/);

    expect(within(grade).getByText(/Total com menor preço/)).toHaveTextContent(/274,00/);
    expect(within(grade).getByText('cotou todos os itens')).toBeInTheDocument();
    expect(within(grade).getByText('cotou 1 de 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gerar pedidos com menor preço/ })).toBeEnabled();
  });

  it('gera os pedidos pela RPC depois da confirmação', async () => {
    mocks.rpc.mockResolvedValue({ data: ['pd2', 'pd3'], error: null });
    renderizar();

    fireEvent.click(await screen.findByRole('button', { name: /Gerar pedidos com menor preço/ }));
    expect(mocks.rpc).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar pedidos' }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('gerar_pedidos_da_cotacao', { p_cotacao_id: 'c1' }));
  });

  it('bloqueia a geração quando há item sem proposta', async () => {
    mocks.tabelas.cotacao_propostas = mocks.tabelas.cotacao_propostas.slice(0, 2);
    renderizar();

    expect(await screen.findByText(/Sem proposta: Seringa 5 ml/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gerar pedidos com menor preço/ })).toBeDisabled();
  });

  it('recebe o pedido com confirmação e mostra os itens', async () => {
    mocks.rpc.mockResolvedValue({ data: { ja_recebido: false, entradas: 1 }, error: null });
    renderizar('/compras?aba=pedidos');

    expect(await screen.findByText('Beta Distribuidora')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver itens' }));
    expect(screen.getByText(/10 × R\$\s22,90/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Receber pedido/ }));
    expect(mocks.rpc).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar recebimento' }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('receber_pedido_compra', { p_pedido_id: 'pd1' }));
  });

  it('cancela só pedido emitido da clínica e confere a linha alterada', async () => {
    mocks.roles = ['admin'];
    renderizar('/compras?aba=pedidos');

    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar pedido' }));
    await waitFor(() => expect(mocks.updates.some(u => u.tabela === 'pedidos_compra')).toBe(true));
    const atualizacao = mocks.updates.find(u => u.tabela === 'pedidos_compra')!;
    expect(atualizacao.dados).toEqual({ status: 'cancelado' });
    expect(atualizacao.filtros).toEqual(expect.arrayContaining([
      ['eq', 'id', 'pd1'], ['eq', 'clinica_id', 'clinica-1'], ['eq', 'status', 'emitido'], ['select', 'id'],
    ]));
  });

  it('financeiro consulta sem ações de escrita', async () => {
    mocks.roles = ['financeiro'];
    renderizar('/compras?aba=pedidos');

    expect(await screen.findByText('Beta Distribuidora')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Receber pedido/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });

  it('mostra as abas como tablist acessível', async () => {
    renderizar();
    expect(screen.getByRole('tablist', { name: 'Seções de compras' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Cotações/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('tabpanel')).toBeInTheDocument();
  });

  it('lista o que estoura o máximo e só recebe depois de ajustar', async () => {
    mocks.tabelas.estoque = [{ id: 'e1', nome: 'Luva de procedimento', quantidade: 45, quantidade_maxima: 50 }];
    mocks.rpc.mockResolvedValue({ data: { ja_recebido: false, entradas: 1 }, error: null });
    renderizar('/compras?aba=pedidos');

    fireEvent.click(await screen.findByRole('button', { name: /Receber pedido/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar recebimento' }));
    expect(await screen.findByText(/passam do estoque máximo/)).toBeInTheDocument();
    expect(screen.getByText(/saldo 45 \+ 10 = 55 \(máximo 50\)/)).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar máximo e receber' }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('receber_pedido_compra', { p_pedido_id: 'pd1' }));
    expect(mocks.updates.find(u => u.tabela === 'estoque')?.dados).toEqual({ quantidade_maxima: 55 });
  });

  it('marca conta lançada no pedido recebido e oferece o atalho nos demais', async () => {
    mocks.roles = ['admin'];
    mocks.tabelas.pedidos_compra = [
      { ...(mocks.tabelas.pedidos_compra[0] as object), id: 'aaaaaaaa-1', status: 'recebido', recebido_em: '2026-10-31T12:00:00Z' },
      { ...(mocks.tabelas.pedidos_compra[0] as object), id: 'bbbbbbbb-2', status: 'recebido', recebido_em: '2026-10-31T12:00:00Z', fornecedores: { nome: 'Gama' } },
    ];
    mocks.tabelas.lancamentos = [{ numero_documento: 'PC-AAAAAAAA' }];
    renderizar('/compras?aba=pedidos');

    expect(await screen.findByText('Conta lançada')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Lançar conta' })).toHaveLength(1);
  });

  it('mostra o último preço pago e a variação ao lançar proposta', async () => {
    mocks.tabelas.pedido_compra_itens = [{ estoque_id: 'e1', preco_unitario: 20, created_at: '2026-09-01T12:00:00Z', pedidos_compra: { status: 'recebido', recebido_em: '2026-09-02T12:00:00Z' } }];
    Object.assign(window.HTMLElement.prototype, { scrollIntoView: vi.fn(), hasPointerCapture: vi.fn(() => false), releasePointerCapture: vi.fn() });
    renderizar();
    await screen.findByRole('region', { name: 'Comparação de preços' });
    fireEvent.click(screen.getByRole('combobox', { name: 'Fornecedor da proposta' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Alfa Hospitalar' }));
    expect(await screen.findByText(/Último preço pago: R\$\s20,00/)).toBeInTheDocument();
    expect(screen.getByText(/\+27,5% sobre a última compra/)).toBeInTheDocument();
  });

  it('busca fornecedores por nome e CNPJ', async () => {
    renderizar('/compras?aba=fornecedores');

    expect(await screen.findByText('12.345.678/0001-90')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar fornecedor'), { target: { value: 'beta' } });
    expect(screen.queryByText('Alfa Hospitalar')).not.toBeInTheDocument();
    expect(screen.getByText('Beta Distribuidora')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar fornecedor'), { target: { value: '12.345' } });
    expect(screen.getByText('Alfa Hospitalar')).toBeInTheDocument();
    expect(screen.queryByText('Beta Distribuidora')).not.toBeInTheDocument();
  });
});
