import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  queueFails: false,
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ isAdmin: () => false, profile: { clinica_id: 'clinic-1' } }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mocks.from,
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
  },
}));

import PainelTV from '@/pages/PainelTV';

function queryResult(data: unknown, error: Error | null = null) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'in', 'order']) query[method] = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve({ data, error }).then(resolve, reject);
  return query;
}

describe('PainelTV', () => {
  beforeEach(() => {
    mocks.queueFails = false;
    mocks.from.mockImplementation((table: string) => {
      if (table === 'fila_atendimento' && mocks.queueFails) {
        return queryResult(null, new Error('Falha de conexão'));
      }
      return queryResult([]);
    });
    const channel = { on: vi.fn(), subscribe: vi.fn() };
    channel.on.mockReturnValue(channel);
    mocks.channel.mockReturnValue(channel);
  });

  it('diferencia falha de conexão de uma fila vazia e permite tentar de novo', async () => {
    mocks.queueFails = true;
    render(<PainelTV />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar a fila');
    expect(screen.queryByText('Nenhum paciente aguardando')).not.toBeInTheDocument();

    mocks.queueFails = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(screen.getByText('Nenhum paciente aguardando')).toBeVisible());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('mostra fila vazia apenas depois de confirmar a consulta', async () => {
    render(<PainelTV />);

    expect(await screen.findByText('Nenhum paciente aguardando')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
