import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { canOpenPlanManagementWhileBlocked, invalidateSubscriptionAccess, subscriptionAccessQueryKey } from '@/lib/subscriptionAccess';

describe('subscription access cache', () => {
  it('uses a clinic-user scoped key', () => {
    expect(subscriptionAccessQueryKey('user-1')).toEqual(['acesso-bloqueado', 'user-1']);
  });

  it('allows only subscription management through the expired-plan guard', () => {
    expect(canOpenPlanManagementWhileBlocked('/planos')).toBe(true);
    expect(canOpenPlanManagementWhileBlocked('/dashboard')).toBe(false);
  });

  it('invalidates cached access after a confirmed payment without touching unrelated queries', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(subscriptionAccessQueryKey('user-1'), true);
    queryClient.setQueryData(['clinic-dashboard', 'clinic-1'], { value: 'unchanged' });

    await invalidateSubscriptionAccess(queryClient);

    expect(queryClient.getQueryState(subscriptionAccessQueryKey('user-1'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['clinic-dashboard', 'clinic-1'])?.isInvalidated).toBe(false);
  });
});
