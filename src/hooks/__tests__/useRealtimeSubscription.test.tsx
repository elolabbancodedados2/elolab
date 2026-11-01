import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  statusCallback: null as null | ((status: string) => void),
  handlers: [] as Array<() => void>,
  removeChannel: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/lib/realtimeCanal', () => ({ canalUnico: (nome: string) => nome }));
vi.mock('@/integrations/supabase/client', () => {
  const channel = {
    on: (_tipo: string, _filtro: unknown, handler: () => void) => { mocks.handlers.push(handler); return channel; },
    subscribe: (cb: (status: string) => void) => { mocks.statusCallback = cb; return channel; },
  };
  return { supabase: { channel: () => channel, removeChannel: mocks.removeChannel } };
});

import { INITIAL_POLL_INTERVAL, useRealtimeSubscription } from '../useRealtimeSubscription';

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
}

describe('useRealtimeSubscription', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.invalidateQueries.mockClear();
    mocks.handlers.length = 0;
    mocks.statusCallback = null;
    setHidden(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    setHidden(false);
  });

  it('com o canal inscrito, não invalida nada por polling mesmo sem eventos', () => {
    renderHook(() => useRealtimeSubscription());
    mocks.statusCallback?.('SUBSCRIBED');
    vi.advanceTimersByTime(INITIAL_POLL_INTERVAL * 6);
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
  });

  it('evento do banco invalida só as chaves da tabela', () => {
    renderHook(() => useRealtimeSubscription());
    mocks.statusCallback?.('SUBSCRIBED');
    mocks.handlers[0]();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['agendamentos'] });
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it('com o canal com erro, faz polling só das consultas ativas', () => {
    renderHook(() => useRealtimeSubscription());
    mocks.statusCallback?.('CHANNEL_ERROR');
    vi.advanceTimersByTime(INITIAL_POLL_INTERVAL);
    expect(mocks.invalidateQueries).toHaveBeenCalled();
    expect(mocks.invalidateQueries.mock.calls.every(([opts]) => opts.refetchType === 'active')).toBe(true);
  });

  it('pausa o polling com a aba oculta', () => {
    renderHook(() => useRealtimeSubscription());
    mocks.statusCallback?.('TIMED_OUT');
    setHidden(true);
    vi.advanceTimersByTime(INITIAL_POLL_INTERVAL * 3);
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
  });

  it('remove o canal ao desmontar', () => {
    const { unmount } = renderHook(() => useRealtimeSubscription());
    unmount();
    expect(mocks.removeChannel).toHaveBeenCalled();
  });
});
