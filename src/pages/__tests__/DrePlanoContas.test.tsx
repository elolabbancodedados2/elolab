import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const banco = vi.hoisted(() => ({
  tabelas: {} as Record<string, unknown[]>,
  rpc: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const consulta = (tabela: string) => {
    const resultado = () => Promise.resolve({ data: banco.tabelas[tabela] ?? [], error: null });
    const builder: Record<string, unknown> = {};
    for (const metodo of ['select', 'eq', 'in', 'order', 'gte', 'lt', 'not', 'range', 'update', 'insert', 'upsert', 'delete']) {
      builder[metodo] = () => builder;
    }
    builder.then = (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) => resultado().then(ok, erro);
    return builder;
  };
  return { supabase: { from: (tabela: string) => consulta(tabela), rpc: banco.rpc } };
});
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ profile: { clinica_id: 'clinic-1' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import DrePlanoContas from '../DrePlanoContas';

function renderizar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/financeiro/dre?mes=2026-10']}>
        <Routes>
          <Route path="/financeiro/dre" element={<DrePlanoContas />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => { banco.tabelas = {}; banco.rpc.mockReset(); });

describe('DrePlanoContas', () => {
  it('mostra a cascata, avisa o lançamento sem conta e leva ao mapeamento', async () => {
    banco.tabelas = {
      plano_contas: [
        { id: 'rb', codigo: '1.1', nome: 'Consultas e retornos', natureza: 'receita', grupo_dre: 'receita_bruta', pai_id: null, ativo: true },
        { id: 'ded', codigo: '2', nome: 'Impostos', natureza: 'despesa', grupo_dre: 'deducoes', pai_id: null, ativo: true },
      ],
      plano_contas_categorias: [{ id: 'v1', natureza: 'receita', categoria: 'consulta', conta_id: 'rb' }],
      lancamentos: [
        { id: 'l1', tipo: 'receita', categoria: 'consulta', status: 'pago', valor: 500, valor_pago: 500, data: '2026-10-05', data_pagamento: '2026-10-05' },
        { id: 'l2', tipo: 'despesa', categoria: 'material', status: 'pago', valor: 80, valor_pago: 80, data: '2026-10-07', data_pagamento: '2026-10-07' },
      ],
      pagamentos: [],
    };
    renderizar();

    expect(await screen.findByRole('heading', { level: 1, name: 'DRE e plano de contas' })).toBeInTheDocument();
    const aviso = screen.getByRole('alert');
    expect(aviso).toHaveTextContent('1 lançamento sem conta');

    const tabela = screen.getByRole('table');
    const receitaBruta = within(tabela).getByRole('row', { name: /Receita bruta/ });
    expect(receitaBruta).toHaveTextContent(/R\$\s500,00/);
    expect(within(tabela).getByRole('row', { name: /= Resultado líquido/ })).toHaveTextContent(/R\$\s500,00/);

    fireEvent.click(within(receitaBruta).getByRole('button', { expanded: false }));
    expect(within(tabela).getByRole('row', { name: /1\.1 Consultas e retornos/ })).toBeInTheDocument();

    fireEvent.click(within(aviso).getByRole('button', { name: 'Mapear categorias' }));
    expect(await screen.findByRole('heading', { name: 'Categorias dos lançamentos' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Conta da categoria material (despesa)' })).toHaveTextContent('Sem conta');
    expect(screen.getByRole('combobox', { name: 'Conta da categoria Consultas (receita)' })).toHaveTextContent('1.1 · Consultas e retornos');
  });

  it('sem plano, oferece criar o plano padrão pela RPC', async () => {
    banco.tabelas = { plano_contas: [], plano_contas_categorias: [], lancamentos: [], pagamentos: [] };
    banco.rpc.mockResolvedValue({ data: { contas_criadas: 17, categorias_vinculadas: 22 }, error: null });
    renderizar();

    fireEvent.click(await screen.findByRole('button', { name: /Criar plano padrão/ }));
    await waitFor(() => expect(banco.rpc).toHaveBeenCalledWith('criar_plano_contas_padrao'));
  });
});
