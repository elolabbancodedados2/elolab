import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queryKeys';

const mocks = vi.hoisted(() => {
  const handlers: Array<{ table: string; callback: () => void }> = [];
  const channel = {
    on: vi.fn((_event: string, filter: { table: string }, callback: () => void) => {
      handlers.push({ table: filter.table, callback });
      return channel;
    }),
    subscribe: vi.fn(() => channel),
  };
  return {
    auth: { user: { id: 'u1' } as { id: string } | null, profile: { clinica_id: 'c1' } },
    handlers,
    channel,
    supabase: { channel: vi.fn(() => channel), removeChannel: vi.fn() },
  };
});

vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: mocks.supabase }));

import { useRealtimeSubscription } from '../useRealtimeSubscription';

const invalidadas = (client: QueryClient) =>
  client.getQueryCache().getAll().filter((q) => q.state.isInvalidated).map((q) => q.queryKey);

describe('useRealtimeSubscription', () => {
  beforeEach(() => {
    mocks.handlers.length = 0;
    mocks.auth.user = { id: 'u1' };
    mocks.auth.profile = { clinica_id: 'c1' };
    vi.clearAllMocks();
  });

  it('invalida a clínica atual pela fábrica e as chaves legadas, sem tocar outra clínica', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const daClinica = queryKeys.tabela.consulta('c1', 'tarefas', 'u1', null);
    const outraClinica = queryKeys.tabela.consulta('c2', 'tarefas', 'u2', null);
    const legadoFila = ['minha-fila-tarefas', 'u1'];
    const outraTabela = queryKeys.tabela.consulta('c1', 'pacientes', 'u1', null);
    for (const chave of [daClinica, outraClinica, legadoFila, outraTabela]) client.setQueryData(chave, []);

    const { unmount } = renderHook(() => useRealtimeSubscription(), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });
    await waitFor(() => expect(mocks.channel.subscribe).toHaveBeenCalledOnce());

    mocks.handlers.find(({ table }) => table === 'tarefas')?.callback();
    await waitFor(() => expect(invalidadas(client)).toEqual(expect.arrayContaining([daClinica, legadoFila])));
    expect(invalidadas(client)).toHaveLength(2);

    unmount();
    expect(mocks.supabase.removeChannel).toHaveBeenCalledOnce();
    client.clear();
  });

  it('não assina o canal sem usuário', () => {
    mocks.auth.user = null;
    const client = new QueryClient();
    renderHook(() => useRealtimeSubscription(), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });
    expect(mocks.supabase.channel).not.toHaveBeenCalled();
    client.clear();
  });
});
