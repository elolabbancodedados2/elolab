import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    auth: { user: { id: 'owner' }, isPlatformAdmin: true },
    handlers,
    channel,
    supabase: {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: mocks.supabase }));

import { usePlatformRealtime } from '../usePlatformRealtime';

describe('usePlatformRealtime', () => {
  beforeEach(() => {
    mocks.handlers.length = 0;
    mocks.auth.user = { id: 'owner' };
    mocks.auth.isPlatformAdmin = true;
    mocks.supabase.channel.mockClear();
    mocks.supabase.removeChannel.mockClear();
    mocks.channel.on.mockClear();
    mocks.channel.subscribe.mockClear();
  });

  it('invalidates billing, customer and history queries when source rows change', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { unmount } = renderHook(() => usePlatformRealtime(), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });

    await waitFor(() => expect(mocks.channel.subscribe).toHaveBeenCalledOnce());
    expect(mocks.handlers.map(({ table }) => table)).toContain('platform_plan_orders');
    expect(mocks.handlers.map(({ table }) => table)).toContain('platform_subscription_invoices');

    mocks.handlers.find(({ table }) => table === 'platform_subscription_events')?.callback();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['platform-financial-history'] });

    unmount();
    expect(mocks.supabase.removeChannel).toHaveBeenCalledOnce();
    client.clear();
  });

  it('does not subscribe for a non-admin account', () => {
    mocks.auth.isPlatformAdmin = false;
    const client = new QueryClient();
    const { unmount } = renderHook(() => usePlatformRealtime(), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });

    expect(mocks.supabase.channel).not.toHaveBeenCalled();
    unmount();
    client.clear();
  });
});
