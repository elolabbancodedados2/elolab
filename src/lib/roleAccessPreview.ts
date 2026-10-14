import type { AppRole } from '@/contexts/SupabaseAuthContext';
import { getFilteredMenuGroups } from '@/config/sidebarMenu';

export type RoleAccessArea = {
  name: string;
  items: string[];
};

/** Deriva a prévia da mesma regra que filtra o menu real da clínica. */
export function getRoleAccessPreview(roles: AppRole[]): RoleAccessArea[] {
  if (roles.length === 0) return [];

  return getFilteredMenuGroups(roles, roles.includes('admin'), false, true, 'app')
    .map(({ label, items }) => ({ name: label, items: items.map(({ label: itemLabel }) => itemLabel) }));
}
