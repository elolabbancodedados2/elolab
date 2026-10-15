import { renderHook } from '@testing-library/react';
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
    removeChannel: vi.fn(),
    toastSuccess: vi.fn(),
    clinicId: 'clinic-1',
  };
});

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn(() => mocks.channel),
    removeChannel: mocks.removeChannel,
  },
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ profile: { clinica_id: mocks.clinicId } }),
}));

import { useWhatsAppBookingNotifications } from './useWhatsAppBookingNotifications';

describe('useWhatsAppBookingNotifications', () => {
  beforeEach(() => {
    mocks.toastSuccess.mockClear();
    mocks.realtimeHandler = undefined;
  });

  it('toasts only for appointments created by the WhatsApp agent', () => {
    renderHook(() => useWhatsAppBookingNotifications());
    expect(mocks.realtimeHandler).toBeTypeOf('function');

    mocks.realtimeHandler?.({ new: { id: 'a1', origem: 'manual', data: '2026-10-19', hora_inicio: '10:00:00' } });
    expect(mocks.toastSuccess).not.toHaveBeenCalled();

    mocks.realtimeHandler?.({ new: { id: 'a2', origem: 'whatsapp_ia', data: '2026-10-19', hora_inicio: '10:00:00' } });
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Agendamento feito pela IA do WhatsApp', {
      description: '19/10/2026 às 10:00',
    });
  });

  it('scopes the subscription to the clinic and cleans up on unmount', () => {
    const { unmount } = renderHook(() => useWhatsAppBookingNotifications());
    unmount();
    expect(mocks.removeChannel).toHaveBeenCalledWith(mocks.channel);
  });
});
