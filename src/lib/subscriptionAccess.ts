import type { QueryClient } from '@tanstack/react-query';

export const SUBSCRIPTION_ACCESS_QUERY_PREFIX = ['acesso-bloqueado'] as const;

export function subscriptionAccessQueryKey(userId: string | undefined) {
  return [...SUBSCRIPTION_ACCESS_QUERY_PREFIX, userId] as const;
}

export function canOpenPlanManagementWhileBlocked(pathname: string) {
  return pathname === '/planos';
}

export function invalidateSubscriptionAccess(queryClient: Pick<QueryClient, 'invalidateQueries'>) {
  return queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_ACCESS_QUERY_PREFIX });
}
