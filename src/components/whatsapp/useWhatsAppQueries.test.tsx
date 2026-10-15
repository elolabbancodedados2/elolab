import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const channel: any = {
    on: vi.fn((_event: string, _filter: unknown, callback: (payload: unknown) => void) => {
      mocks.realtimeHandler = callback;
      return channel;
    }),
    subscribe: vi.fn(() => channel),
  };
  return {
    channel,
    realtimeHandler: undefined as ((payload: unknown) => void) | undefined,
    invalidateQueries: vi.fn(),
    removeChannel: vi.fn(),
    rpc: vi.fn(),
    useInfiniteQuery: vi.fn((_options: unknown) => ({ data: undefined })),
    infiniteQueryOptions: undefined as any,
    clinicId: 'clinic-1',
    profileId: 'profile-1',
  };
});

vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: (options: unknown) => {
    mocks.infiniteQueryOptions = options;
    return mocks.useInfiniteQuery(options);
  },
  useQuery: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn(() => mocks.channel),
    removeChannel: mocks.removeChannel,
    rpc: mocks.rpc,
  },
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ profile: { clinica_id: mocks.clinicId, id: mocks.profileId } }),
}));

import { useWhatsAppConversations, useWhatsAppSessions, useWhatsAppStats } from './useWhatsAppQueries';
import { useQuery } from '@tanstack/react-query';

describe('session pairing updates', () => {
  it('refreshes QR and connection state without requiring a reload', () => {
    renderHook(() => useWhatsAppSessions());
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ refetchInterval: 5_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true }));
  });
  it('does not poll when the user cannot access the feature', () => {
    vi.clearAllMocks();
    renderHook(() => useWhatsAppSessions(false));
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false, refetchInterval: false }));
  });
});

describe('dashboard counters', () => {
  it('reads aggregate counters from the authenticated clinic RPC and propagates failures', async () => {
    vi.clearAllMocks();
    const stats = { messages: 1, conversations: 2, actions: 3, ai_bookings: 4, confirmed_today: 5, no_shows_today: 6, delivery_failures: 7 };
    mocks.rpc.mockResolvedValueOnce({ data: stats, error: null });
    renderHook(() => useWhatsAppStats());
    const options = vi.mocked(useQuery).mock.calls.at(-1)![0];
    const queryFn = options.queryFn as () => Promise<unknown>;
    await expect(queryFn()).resolves.toEqual(stats);
    expect(mocks.rpc).toHaveBeenCalledWith('whatsapp_dashboard_stats');
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error('unavailable') });
    await expect(queryFn()).rejects.toThrow('unavailable');
  });
  it('refreshes counters while the panel is open', () => {
    vi.clearAllMocks();
    renderHook(() => useWhatsAppStats());
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({
      refetchInterval: 15_000, refetchIntervalInBackground: false,
    }));
  });
  it('does not poll counters without access', () => {
    vi.clearAllMocks();
    renderHook(() => useWhatsAppStats(false));
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({
      enabled: false, refetchInterval: false,
    }));
  });
});

describe('useWhatsAppConversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.realtimeHandler = undefined;
    mocks.clinicId = 'clinic-1';
    mocks.profileId = 'profile-1';
  });

  it('combina polling de recuperação com invalidação por realtime da clínica', () => {
    const { unmount } = renderHook(() => useWhatsAppConversations());

    expect(mocks.infiniteQueryOptions).toMatchObject({
      enabled: true,
      refetchInterval: 15_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    });
    expect(mocks.channel.on).toHaveBeenCalledWith('postgres_changes', expect.objectContaining({
      event: '*',
      schema: 'public',
      table: 'whatsapp_conversations',
      filter: 'clinica_id=eq.clinic-1',
    }), expect.any(Function));
    expect(mocks.channel.subscribe).toHaveBeenCalledOnce();

    act(() => mocks.realtimeHandler?.({ eventType: 'UPDATE' }));
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['whatsapp-conversations', 'clinic-1', 'profile-1'],
    });

    unmount();
    expect(mocks.removeChannel).toHaveBeenCalledWith(mocks.channel);
  });

  it('não ativa polling nem canal quando o recurso está desabilitado', () => {
    renderHook(() => useWhatsAppConversations(false));

    expect(mocks.infiniteQueryOptions).toMatchObject({ enabled: false, refetchInterval: false });
    expect(mocks.channel.subscribe).not.toHaveBeenCalled();
  });
});
