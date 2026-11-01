import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  itens: [] as Array<Record<string, unknown>>,
  saldoAtual: [] as Array<Record<string, unknown>>,
  rpc: vi.fn(),
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ profile: { clinica_id: 'clinica-1' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/hooks/useSupabaseData', () => ({
  useSupabaseQuery: () => ({ data: mocks.itens, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/integrations/supabase/client', () => {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in']) b[m] = () => b;
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: mocks.saldoAtual, error: null }).then(ok);
  return { supabase: { from: () => b, rpc: mocks.rpc } };
});

import EstoqueInventario from '../EstoqueInventario';

function renderizar() {
  const router = createMemoryRouter([
    { path: '/estoque/inventario', element: <EstoqueInventario /> },
    { path: '/estoque', element: <p>Lista do estoque</p> },
  ], { initialEntries: ['/estoque/inventario'] });
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.itens = [
    { id: 'a', nome: 'Luva', categoria: 'epis', unidade: 'caixa', quantidade: 10, localizacao: 'A1', lote: null },
    { id: 'b', nome: 'Gaze', categoria: 'materiais_hospitalares', unidade: 'pacote', quantidade: 4, localizacao: null, lote: null },
  ];
  mocks.saldoAtual = [{ id: 'a', quantidade: 10 }, { id: 'b', quantidade: 4 }];
});

describe('Inventário do estoque', () => {
  it('registra ajuste só para o item com diferença, com motivo e saldos', async () => {
    mocks.rpc.mockResolvedValue({ data: 7, error: null });
    renderizar();

    fireEvent.change(screen.getByLabelText('Contagem de Luva'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Contagem de Gaze'), { target: { value: '4' } });
    expect(screen.getByText(/Diferença: -3 Caixa/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Registrar ajustes (1)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar ajustes' }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledWith('registrar_movimentacao_estoque', expect.objectContaining({
      p_item_id: 'a', p_tipo: 'saida', p_quantidade: 3,
      p_motivo: expect.stringContaining('sistema 10, contado 7'),
    }));
    expect(await screen.findByText('Lista do estoque')).toBeInTheDocument();
  });

  it('pula o item cujo saldo mudou durante a contagem', async () => {
    renderizar();
    fireEvent.change(screen.getByLabelText('Contagem de Luva'), { target: { value: '12' } });
    mocks.saldoAtual = [{ id: 'a', quantidade: 11 }];
    fireEvent.click(screen.getByRole('button', { name: 'Registrar ajustes (1)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar ajustes' }));
    await waitFor(() => expect(screen.getByLabelText('Contagem de Luva')).toHaveValue(''));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
