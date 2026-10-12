import type { AppRole } from '@/contexts/SupabaseAuthContext';

const RESTRICTED_CASH_TABS = new Set(['receber', 'pagar', 'fluxo', 'precos', 'tipos', 'relatorios']);

export function canAccessRestrictedCashTabs(roles: AppRole[] = []): boolean {
  return roles.includes('admin') || roles.includes('financeiro');
}

export function canAccessReceptionTab(roles: AppRole[] = []): boolean {
  return roles.includes('admin') || roles.includes('recepcao');
}

export function getReceptionCashTab(requestedTab: string | null, roles: AppRole[] = []): 'recepcao' | 'caixa' {
  if (requestedTab === 'caixa' || !canAccessReceptionTab(roles)) return 'caixa';
  return 'recepcao';
}

export function canAccessCashTab(tab: string, roles: AppRole[] = []): boolean {
  return !RESTRICTED_CASH_TABS.has(tab) || canAccessRestrictedCashTabs(roles);
}
