import type { AppRole } from '@/contexts/SupabaseAuthContext';

export function canAccessReceptionTab(roles: AppRole[] = []): boolean {
  return roles.includes('admin') || roles.includes('recepcao');
}

export function getReceptionCashTab(requestedTab: string | null, roles: AppRole[] = []): 'recepcao' | 'caixa' {
  if (requestedTab === 'caixa' || !canAccessReceptionTab(roles)) return 'caixa';
  return 'recepcao';
}
