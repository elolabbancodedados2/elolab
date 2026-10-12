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
  },
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ profile: { clinica_id: mocks.clinicId, id: mocks.profileId } }),
}));

import { useWhatsAppConversations } from './useWhatsAppQueries';

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
