import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';

const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'clinic-owner' }, isPlatformAdmin: false },
  from: vi.fn(),
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));

import { useUserPlan } from '../useSubscriptionPlan';

describe('useUserPlan', () => {
  beforeEach(() => {
    mocks.auth.user = { id: 'clinic-owner' };
    mocks.auth.isPlatformAdmin = false;
    const query = {
      select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockResolvedValue({ data: [{
      plano_slug: 'elolab-max', status: 'trial', em_trial: true,
      trial_fim: '2026-10-14T00:00:00.000Z', data_fim: null,
      cobranca_modalidade: 'recorrente', planos: { nome: 'EloLab Max' },
    }], error: null });
    mocks.from.mockReturnValue(query);
  });

  it('carrega o trial da própria conta e preserva seus recursos', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useUserPlan(), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.from).toHaveBeenCalledWith('assinaturas_plano');
    expect(result.current.plan).toMatchObject({ status: 'trial', em_trial: true });
    expect(result.current.hasActivePlan).toBe(true);
    expect(result.current.isTrial).toBe(true);
    expect(result.current.hasFeature('automacoes')).toBe(true);
  });
});
