import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const banco = vi.hoisted(() => ({
  contas: [] as Record<string, unknown>[],
  chamadas: [] as Array<{ metodo: string; args: unknown[] }>,
  resultadoUpdate: [{ id: 'c1' }] as unknown[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const consulta = () => {
    let atualizando = false;
    const builder: Record<string, unknown> = {};
    for (const metodo of ['select', 'eq', 'in', 'or', 'order', 'range', 'maybeSingle']) {
      builder[metodo] = (...args: unknown[]) => { banco.chamadas.push({ metodo, args }); return builder; };
    }
    builder.update = (...args: unknown[]) => { atualizando = true; banco.chamadas.push({ metodo: 'update', args }); return builder; };
    builder.then = (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) =>
      Promise.resolve({ data: atualizando ? banco.resultadoUpdate : banco.contas, error: null }).then(ok, erro);
    return builder;
  };
  return { supabase: { from: () => consulta(), rpc: vi.fn() } };
});
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: { id: 'u1' }, profile: { clinica_id: 'clinic-1', nome: 'Ana' } }),
}));
vi.mock('@/components/financeiro/HistoricoLancamentoButton', () => ({ HistoricoLancamentoButton: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ContasPagar from '../ContasPagar';

function renderizar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/contas', element: <ContasPagar /> }], { initialEntries: ['/contas?tab=pagar'] });
  return render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}

const conta = (extra: Record<string, unknown>) => ({
  id: 'c1', tipo: 'despesa', descricao: 'Aluguel', valor: 1000, valor_pago: 0, desconto: 0, acrescimo: 0,
  status: 'pendente', data: '2099-01-01', data_vencimento: '2099-01-10', categoria: 'aluguel', ...extra,
});

describe('ContasPagar: cancelar despesa', () => {
  afterEach(() => { banco.chamadas = []; banco.contas = []; });

  it('exige motivo e cancela só se o status ainda for o mesmo', async () => {
    banco.contas = [conta({})];
    renderizar();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar Aluguel' }));
    const confirmar = await screen.findByRole('button', { name: 'Cancelar despesa' });
    fireEvent.click(confirmar);
    expect(banco.chamadas.some(c => c.metodo === 'update')).toBe(false);

    fireEvent.change(screen.getByLabelText(/Motivo do cancelamento/), { target: { value: 'Lançada em duplicidade' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar despesa' }));

    await waitFor(() => expect(banco.chamadas.some(c => c.metodo === 'update')).toBe(true));
    const depoisDoUpdate = banco.chamadas.slice(banco.chamadas.findIndex(c => c.metodo === 'update'));
    expect(depoisDoUpdate).toEqual(expect.arrayContaining([
      { metodo: 'eq', args: ['status', 'pendente'] },
      { metodo: 'eq', args: ['clinica_id', 'clinic-1'] },
      { metodo: 'select', args: ['id'] },
    ]));
    const payload = depoisDoUpdate[0].args[0] as { status: string; observacoes: string };
    expect(payload.status).toBe('cancelado');
    expect(payload.observacoes).toContain('Lançada em duplicidade');
  });

  it('não oferece editar nem cancelar despesa com pagamento', async () => {
    banco.contas = [conta({ status: 'parcial', valor_pago: 100 })];
    renderizar();
    await screen.findByText('Aluguel', { selector: 'p' });
    expect(screen.queryByRole('button', { name: 'Cancelar Aluguel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar Aluguel' })).toBeNull();
  });
});
