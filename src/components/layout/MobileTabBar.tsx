import { MoreHorizontal } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { getFilteredMenuGroups, getNavigationMode } from '@/config/sidebarMenu';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useUserPlan } from '@/hooks/useSubscriptionPlan';
import { cn } from '@/lib/utils';

interface MobileTabBarProps {
  menuOpen: boolean;
  onOpenMenu: () => void;
}

const shortLabels: Record<string, string> = {
  '/dashboard': 'Início',
  '/painel-admin': 'Início',
  '/agenda': 'Agenda',
  '/pacientes': 'Pacientes',
  '/fila': 'Fila',
  '/financeiro': 'Finanças',
  '/recepcao': 'Recepção',
  '/indicadores': 'Dados',
  '/admin/crm': 'Clientes',
  '/usuarios': 'Acessos',
  '/admin/saude': 'Saúde',
};

export function MobileTabBar({ menuOpen, onOpenMenu }: MobileTabBarProps) {
  const { profile, isAdmin, isSuperAdmin, isPlatformAdmin } = useSupabaseAuth();
  const location = useLocation();
  const { hasFeature, isLoading: planLoading, isError: planError } = useUserPlan();

  if (!profile) return null;

  const navigationMode = isPlatformAdmin && !profile.clinica_id
    ? 'platform'
    : getNavigationMode(location.pathname, isPlatformAdmin);
  const groups = getFilteredMenuGroups(
    profile.roles ?? [],
    isAdmin(),
    isSuperAdmin,
    Boolean(profile.clinica_id),
    navigationMode,
  );
  const availableItems = groups.flatMap(group => group.items).filter(item =>
    !item.planFeature || (!planLoading && !planError && hasFeature(item.planFeature))
  );
  const itemsByPath = new Map(availableItems.map(item => [item.href.split('?')[0], item]));
  const clinicalRole = profile.roles?.some(role => ['admin', 'medico', 'recepcao', 'enfermagem'].includes(role));
  const preferredPaths = navigationMode === 'platform'
    ? ['/painel-admin', '/admin/crm', '/usuarios', '/admin/saude']
    : clinicalRole
      ? ['/dashboard', '/agenda', '/pacientes', '/fila']
      : ['/dashboard', '/financeiro', '/recepcao', '/indicadores'];
  const preferredItems = preferredPaths.flatMap(path => {
    const item = itemsByPath.get(path);
    return item ? [{ ...item, shortLabel: shortLabels[path] ?? item.label }] : [];
  });
  const items = [
    ...preferredItems,
    ...availableItems
      .filter(item => !preferredItems.some(preferred => preferred.href.split('?')[0] === item.href.split('?')[0]))
      .map(item => ({ ...item, shortLabel: shortLabels[item.href.split('?')[0]] ?? item.label })),
  ].slice(0, 4);

  if (!items.length) return null;

  const isCurrent = (href: string) => {
    const path = href.split('?')[0];
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };
  const moreIsCurrent = !items.some(item => isCurrent(item.href));

  return (
    <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 pt-1.5 pb-[calc(0.4rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(16,24,40,0.06)] backdrop-blur-2xl lg:hidden">
      <div className="mx-auto grid w-full max-w-xl grid-cols-5 gap-1 px-2">
        {items.map(({ href, icon: Icon, shortLabel }) => {
          const active = isCurrent(href);
          return (
            <Link
              key={href}
              to={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-[10px] font-medium transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'bg-primary/7 text-primary' : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
              )}
            >
              <Icon aria-hidden="true" className={cn('h-[19px] w-[19px]', active && 'stroke-[2.3]')} />
              <span className="max-w-full truncate">{shortLabel}</span>
            </Link>
          );
        })}
        <button
          type="button"
          aria-label="Mais seções"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={onOpenMenu}
          className={cn(
            'flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-[10px] font-medium transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            (menuOpen || moreIsCurrent) ? 'bg-primary/7 text-primary' : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
          )}
        >
          <MoreHorizontal aria-hidden="true" className="h-[19px] w-[19px]" />
          <span>Mais</span>
        </button>
      </div>
    </nav>
  );
}
