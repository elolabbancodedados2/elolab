import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const banco = vi.hoisted(() => ({
  contas: [] as Record<string, unknown>[],
  rpc: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const consulta = () => {
    const builder: Record<string, unknown> = {};
    for (const metodo of ['select', 'eq', 'in', 'or', 'order', 'range', 'maybeSingle', 'update']) {
      builder[metodo] = () => builder;
    }
    builder.then = (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) =>
      Promise.resolve({ data: banco.contas, error: null }).then(ok, erro);
    return builder;
  };
  return { supabase: { from: () => consulta(), rpc: banco.rpc } };
});
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: { id: 'u1' }, profile: { clinica_id: 'clinic-1', nome: 'Ana' } }),
}));
vi.mock('@/components/financeiro/HistoricoLancamentoButton', () => ({ HistoricoLancamentoButton: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import ContasPagar from '../ContasPagar';

const conta = (extra: Record<string, unknown>) => ({
  id: 'c1', tipo: 'despesa', descricao: 'Aluguel', valor: 1000, valor_pago: 0, desconto: 0, acrescimo: 0,
  status: 'pendente', data: '2099-01-01', data_vencimento: '2099-01-10', categoria: 'aluguel', ...extra,
});

function renderizar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/contas', element: <ContasPagar /> }], { initialEntries: ['/contas?tab=pagar'] });
  return render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}

describe('ContasPagar: pagar várias contas de uma vez', () => {
  afterEach(() => { banco.contas = []; banco.rpc.mockReset(); });

  it('paga cada conta selecionada pelo saldo em aberto, com chave própria', async () => {
    banco.contas = [
      conta({}),
      conta({ id: 'c2', descricao: 'Internet', valor: 200, valor_pago: 50, status: 'parcial', categoria: 'Servicos' }),
      conta({ id: 'c3', descricao: 'Luz paga', status: 'pago', valor_pago: 1000 }),
    ];
    banco.rpc.mockResolvedValue({ data: { success: true }, error: null });
    renderizar();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Selecionar todas as contas em aberto da lista' }));
    expect(screen.getByText(/2 contas selecionadas/)).toHaveTextContent(/R\$\s1\.150,00/);
    expect(screen.queryByRole('checkbox', { name: 'Selecionar Luz paga' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Pagar selecionadas/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pagar contas' }));

    await waitFor(() => expect(banco.rpc).toHaveBeenCalledTimes(2));
    const [primeira, segunda] = banco.rpc.mock.calls.map(([, args]) => args);
    expect(banco.rpc.mock.calls[0][0]).toBe('registrar_pagamento');
    expect(primeira.p_pagamentos[0]).toMatchObject({ forma_pagamento: 'pix', valor: 1000 });
    expect(segunda.p_pagamentos[0]).toMatchObject({ valor: 150 });
    expect(primeira.p_chave_idempotencia).not.toBe(segunda.p_chave_idempotencia);
  });
});
