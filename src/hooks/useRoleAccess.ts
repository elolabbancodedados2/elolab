import { useSupabaseAuth, AppRole } from '@/contexts/SupabaseAuthContext';

/**
 * Etapa 5.3 — Hook para esconder/desabilitar ações dentro de páginas
 * com base nos papéis do usuário. Admin sempre tem acesso total.
 *
 * Uso:
 *   const { can, canAny, isAdmin, isOwner, isPlatformAdmin } = useRoleAccess();
 *   {can('financeiro') && <Button>Ver receita</Button>}
 *   {canAny(['medico','enfermagem']) && <Button>Abrir prontuário</Button>}
 */
export function useRoleAccess() {
  const {
    profile,
    isLoading,
    hasRole,
    hasAnyRole,
    isAdmin,
    isClinicaOwner,
    isPlatformAdmin,
  } = useSupabaseAuth();

  const can = (role: AppRole): boolean => {
    if (isAdmin()) return true;
    return hasRole(role);
  };

  const canAny = (roles: AppRole[]): boolean => {
    if (isAdmin()) return true;
    return hasAnyRole(roles);
  };

  const canAll = (roles: AppRole[]): boolean => {
    if (isAdmin()) return true;
    return roles.every((r) => hasRole(r));
  };

  return {
    isLoading,
    roles: profile?.roles ?? [],
    isAdmin: isAdmin(),
    isOwner: isClinicaOwner,
    isPlatformAdmin,
    can,
    canAny,
    canAll,
    /** Atalhos para os papéis mais usados */
    canManageFinance: isAdmin() || hasRole('financeiro'),
    canManageClinical: isAdmin() || hasAnyRole(['medico', 'enfermagem']),
    canManageReception: isAdmin() || hasRole('recepcao'),
    /** Apenas admin ou dono da clínica podem excluir/configurar */
    canDelete: isAdmin() || isClinicaOwner,
    canConfigure: isAdmin() || isClinicaOwner,
  };
}
