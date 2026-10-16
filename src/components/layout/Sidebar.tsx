import { useId, useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ChevronLeft, ChevronDown, LayoutDashboard, PanelLeftOpen, Search, ShieldCheck } from 'lucide-react';
import logoHorizontal from '@/assets/elolab-logo-identidade.png';
import logoMark from '@/assets/elolab-symbol-identidade.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { SidebarNavItem } from './SidebarNavItem';
import { getFilteredMenuGroups, getNavigationMode, MenuGroup } from '@/config/sidebarMenu';
import { motion, AnimatePresence } from 'framer-motion';
import { useUserPlan } from '@/hooks/useSubscriptionPlan';
import { normalizarTexto } from '@/lib/buscaPaciente';

const STORAGE_KEY = 'elolab_sidebar_collapsed';
const GROUPS_KEY = 'elolab_sidebar_groups_v3';
const DEFAULT_OPEN_GROUPS = ['Início', 'Atendimento', 'Pacientes', 'Painel da plataforma', 'Clientes', 'Receita'];

function readSidebarPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSidebarPreference(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Navigation remains usable when storage is disabled by the browser.
  }
}

interface SidebarProps {
  forceExpanded?: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ forceExpanded = false, onNavigate }: SidebarProps) {
  const { profile, isAdmin, isSuperAdmin, isPlatformAdmin } = useSupabaseAuth();
  const { hasFeature, isLoading: isPlanLoading, isError: isPlanError } = useUserPlan();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const focusSearchAfterExpandRef = useRef(false);
  const navigationMode = isPlatformAdmin && !profile?.clinica_id
    ? 'platform'
    : getNavigationMode(location.pathname, isPlatformAdmin);

  const [collapsed, setCollapsed] = useState(() => {
    const saved = readSidebarPreference(STORAGE_KEY);
    return saved === 'true';
  });

  const [openGroups, setOpenGroups] = useState<string[]>(() => {
    try {
      const saved = readSidebarPreference(GROUPS_KEY);
      if (!saved) return DEFAULT_OPEN_GROUPS;
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) && parsed.every(item => typeof item === 'string')
        ? parsed
        : DEFAULT_OPEN_GROUPS;
    } catch {
      return DEFAULT_OPEN_GROUPS;
    }
  });
  const isCollapsed = collapsed && !forceExpanded;

  useEffect(() => {
    if (!isCollapsed && focusSearchAfterExpandRef.current) {
      searchInputRef.current?.focus();
      focusSearchAfterExpandRef.current = false;
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (isCollapsed) {
          focusSearchAfterExpandRef.current = true;
          setCollapsed(false);
        } else {
          searchInputRef.current?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [isCollapsed]);

  const roleFilteredMenuGroups = getFilteredMenuGroups(
    profile?.roles || [],
    isAdmin(),
    isSuperAdmin,
    // Durante a impersonação o perfil recebe a clinica_id da clínica visitada,
    // então as telas de clínica reaparecem — que é justamente quando o dono
    // precisa delas.
    !!profile?.clinica_id,
    navigationMode
  );

  const hasPlanFeature = (feature?: string) => !feature || (!isPlanLoading && !isPlanError && hasFeature(feature));
  const filteredMenuGroups = roleFilteredMenuGroups
    .filter(group => hasPlanFeature(group.planFeature))
    .map(group => ({
      ...group,
      items: group.items.filter(item => hasPlanFeature(item.planFeature)),
    }))
    .filter(group => group.items.length > 0);

  const normalizedSearch = normalizarTexto(search);
  const searchedGroups = normalizedSearch
    ? filteredMenuGroups
        .map(group => {
          const groupMatches = normalizarTexto(group.label).includes(normalizedSearch);
          return {
            ...group,
            items: groupMatches
              ? group.items
              : group.items.filter(item => normalizarTexto(item.label).includes(normalizedSearch)),
          };
        })
        .filter(group => group.items.length > 0)
    : filteredMenuGroups;

  useEffect(() => {
    writeSidebarPreference(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    writeSidebarPreference(GROUPS_KEY, JSON.stringify(openGroups));
  }, [openGroups]);

  useEffect(() => {
    const activeGroup = filteredMenuGroups.find(group =>
      group.items.some(item => item.href.split('?')[0] === location.pathname)
    );
    if (activeGroup) {
      setOpenGroups(prev =>
        prev.includes(activeGroup.label) ? prev : [...prev, activeGroup.label]
      );
    }
  }, [location.pathname, filteredMenuGroups]);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) =>
      prev.includes(label) ? prev.filter((g) => g !== label) : [...prev, label]
    );
  };

  return (
    <aside
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-white/80 bg-sidebar text-sidebar-accent-foreground shadow-sm transition-all duration-300 ease-out',
        isCollapsed ? 'w-[72px]' : 'w-[286px]'
      )}
    >
      {/* ─── Header ─── */}
      <div className={cn(
        'flex items-center shrink-0',
        isCollapsed ? 'justify-center px-2 h-[76px]' : 'justify-between px-5 h-[76px]'
      )}>
        {!isCollapsed ? (
          <img src={logoHorizontal} alt="EloLab" className="h-auto w-[168px] object-contain" />
        ) : (
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/15">
            <img src={logoMark} alt="EloLab" className="h-9 w-9 object-contain" />
          </div>
        )}

        {!isCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(true)}
            aria-label="Recolher menu lateral"
            className="h-9 w-9 rounded-xl text-sidebar-accent-foreground/55 hover:text-sidebar-accent-foreground hover:bg-black/[0.04]"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* ─── Search ─── */}
      {isPlatformAdmin && (
        <div
          role="group"
          aria-label="Alternar área"
          className={cn(
            'grid gap-1.5 pb-4',
            isCollapsed ? 'grid-cols-1 px-2' : 'grid-cols-2 px-4',
          )}
        >
          {profile?.clinica_id && (
            <Link
              to="/dashboard"
              onClick={onNavigate}
              aria-label="App"
              aria-current={navigationMode === 'app' ? 'page' : undefined}
              className={cn(
                'flex min-h-12 items-center justify-center gap-2.5 rounded-xl px-2 text-sm font-semibold transition-all',
                navigationMode === 'app'
                  ? 'text-white shadow-md'
                  : 'text-sidebar-accent-foreground/65 hover:bg-black/[0.04] hover:text-sidebar-accent-foreground',
              )}
              style={navigationMode === 'app' ? { background: 'var(--gradient-primary)' } : undefined}
            >
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              {!isCollapsed && <span>App</span>}
            </Link>
          )}
          {!profile?.clinica_id && (
            <Button
              type="button"
              variant="ghost"
              disabled
              title="O vínculo da clínica da conta proprietária ainda não foi configurado."
              aria-label="App: vínculo da clínica ainda não configurado"
              className="flex min-h-12 justify-center gap-2.5 rounded-xl px-2 text-sm font-semibold text-sidebar-accent-foreground/45"
            >
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              {!isCollapsed && <span>App</span>}
            </Button>
          )}
          <Link
            to="/painel-admin"
            onClick={onNavigate}
            aria-label="Painel Admin"
            aria-current={navigationMode === 'platform' ? 'page' : undefined}
            className={cn(
              'flex min-h-12 items-center justify-center gap-2.5 rounded-xl px-2 text-sm font-semibold transition-all',
              navigationMode === 'platform'
                ? 'text-white shadow-md'
                : 'text-sidebar-accent-foreground/65 hover:bg-black/[0.04] hover:text-sidebar-accent-foreground',
            )}
            style={navigationMode === 'platform' ? { background: 'var(--gradient-primary)' } : undefined}
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>Painel Admin</span>}
          </Link>
        </div>
      )}

      {!isCollapsed && (
        <div className="px-4 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sidebar-accent-foreground/45" />
            <Input
              ref={searchInputRef}
              aria-label="Buscar no menu"
              aria-keyshortcuts="Control+K Meta+K"
              name="menu-search"
              autoComplete="off"
              placeholder="Buscar no menu"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={event => {
                if (event.key === 'Escape' && search) {
                  event.preventDefault();
                  setSearch('');
                }
              }}
              className="h-10 rounded-full border-black/[0.08] bg-white/70 pl-10 text-sm text-sidebar-accent-foreground placeholder:text-sidebar-accent-foreground/45 focus-visible:bg-white focus-visible:ring-sidebar-accent-foreground/20"
            />
          </div>
        </div>
      )}

      {/* ─── Expand trigger (collapsed) ─── */}
      {isCollapsed && (
        <div className="px-2 pb-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCollapsed(false)}
                aria-label="Expandir menu lateral"
                className="h-10 w-full rounded-xl text-sidebar-accent-foreground/50 hover:text-sidebar-accent-foreground hover:bg-black/[0.04]"
              >
                <PanelLeftOpen className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Expandir menu</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* ─── Navigation ─── */}
      <ScrollArea className="min-h-0 flex-1 px-3 py-2">
        <nav className="flex flex-col gap-1">
          {searchedGroups.map((group) => (
            <SidebarMenuGroup
              key={group.label}
              group={group}
              collapsed={isCollapsed}
              isOpen={openGroups.includes(group.label) || !!search.trim()}
              onToggle={() => toggleGroup(group.label)}
              onExpand={() => {
                setCollapsed(false);
                setOpenGroups(previous => previous.includes(group.label) ? previous : [...previous, group.label]);
              }}
              currentPath={location.pathname}
              onNavigate={onNavigate}
            />
          ))}
          {normalizedSearch && searchedGroups.length === 0 && (
            <div className="mx-1 my-4 rounded-2xl border border-black/[0.07] bg-white/65 px-4 py-4 text-center">
              <p role="status" className="text-sm font-medium text-[#171717]">Nenhuma tela encontrada</p>
              <p className="mt-1 text-xs leading-relaxed text-[#171717]/60">Tente outro nome de módulo ou limpe a busca.</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Limpar busca do menu"
                onClick={() => setSearch('')}
                className="mt-2 h-8 rounded-full px-3 text-xs text-[#171717]/75 hover:bg-black/[0.05] hover:text-[#171717]"
              >
                Limpar busca
              </Button>
            </div>
          )}
        </nav>
      </ScrollArea>

      {/* ─── Footer ─── */}
      {!isCollapsed && (
        <div className="shrink-0 px-3 pb-4 pt-2">
          <div className="rounded-2xl bg-white/70 px-4 py-3">
            <p className="text-[13px] font-bold text-sidebar-accent-foreground">EloLab</p>
            <p className="text-xs leading-relaxed text-sidebar-accent-foreground/60">Agenda, pacientes e finanças da clínica em um só lugar.</p>
          </div>
        </div>
      )}
    </aside>
  );
}

// ─── Group Component ───

interface SidebarMenuGroupProps {
  group: MenuGroup;
  collapsed: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onExpand: () => void;
  currentPath: string;
  onNavigate?: () => void;
}

function SidebarMenuGroup({ group, collapsed, isOpen, onToggle, onExpand, currentPath, onNavigate }: SidebarMenuGroupProps) {
  const groupPanelId = useId();
  const GroupIcon = group.icon;
  const hasActiveChild = group.items.some(item => item.href.split('?')[0] === currentPath);

  return (
    <div className="mb-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            onClick={() => collapsed ? onExpand() : onToggle()}
            aria-label={collapsed ? `Expandir menu: ${group.label}` : group.label}
            aria-expanded={!collapsed && isOpen}
            aria-controls={!collapsed && isOpen ? groupPanelId : undefined}
            whileHover={{ x: collapsed ? 0 : 2 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className={cn(
              'w-full flex items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]/50 focus-visible:ring-offset-1',
              collapsed && 'justify-center',
              hasActiveChild
                ? 'text-white shadow-md hover:text-white'
                : 'text-sidebar-accent-foreground/75 hover:bg-black/[0.04] hover:text-sidebar-accent-foreground',
            )}
            style={hasActiveChild ? { background: 'var(--gradient-primary)' } : undefined}
          >
            {collapsed ? (
              <motion.div
                whileHover={{ scale: 1.12 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                className="h-9 w-9 rounded-xl flex items-center justify-center transition-all shadow-sm"
                style={{
                  backgroundColor: hasActiveChild ? 'rgba(255,255,255,.14)' : 'rgba(23,23,23,.05)',
                  color: hasActiveChild ? '#fff' : '#171717',
                }}
              >
                <GroupIcon className="h-4 w-4" />
              </motion.div>
            ) : (
              <>
                <div
                  className="h-6 w-6 rounded-lg flex items-center justify-center shrink-0 transition-all"
                  style={{
                    backgroundColor: hasActiveChild ? 'rgba(255,255,255,.14)' : 'rgba(23,23,23,.05)',
                    color: hasActiveChild ? '#fff' : '#171717',
                  }}
                >
                  <GroupIcon className="h-3.5 w-3.5" />
                </div>
                <span className="flex-1 text-left">{group.label}</span>
                <motion.div
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                >
                  <ChevronDown className="h-3.5 w-3.5 text-current/50" />
                </motion.div>
              </>
            )}
          </motion.button>
        </TooltipTrigger>
        {collapsed && (
          <TooltipContent side="right" className="font-medium text-xs">
            Expandir menu · {group.label}
          </TooltipContent>
        )}
      </Tooltip>

      <AnimatePresence initial={false}>
        {isOpen && !collapsed && (
          <motion.div
            id={groupPanelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-1 py-1.5 pl-3">
              {group.items.map((item, idx) => (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03, duration: 0.2 }}
                >
                  <SidebarNavItem item={item} collapsed={collapsed} groupColor={group.color} onNavigate={onNavigate} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {collapsed && (
        <div className="space-y-px mt-0.5">
          {group.items.map((item) => (
            <SidebarNavItem key={item.href} item={item} collapsed={collapsed} groupColor={group.color} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}
