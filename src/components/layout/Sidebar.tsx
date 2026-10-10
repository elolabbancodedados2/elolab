import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ChevronLeft, ChevronDown, LayoutDashboard, PanelLeftOpen, Search, ShieldCheck } from 'lucide-react';
import logoIcon from '@/assets/elolab-symbol-v2.png';
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

const STORAGE_KEY = 'elolab_sidebar_collapsed';
const GROUPS_KEY = 'elolab_sidebar_groups_v3';
const DEFAULT_OPEN_GROUPS = ['Início', 'Atendimento', 'Pacientes', 'Painel da plataforma', 'Clientes', 'Receita'];

interface SidebarProps {
  forceExpanded?: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ forceExpanded = false, onNavigate }: SidebarProps) {
  const { profile, isAdmin, isSuperAdmin, isPlatformAdmin } = useSupabaseAuth();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const navigationMode = isPlatformAdmin && !profile?.clinica_id
    ? 'platform'
    : getNavigationMode(location.pathname, isPlatformAdmin);

  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'true';
  });

  const [openGroups, setOpenGroups] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(GROUPS_KEY);
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

  const filteredMenuGroups = getFilteredMenuGroups(
    profile?.roles || [],
    isAdmin(),
    isSuperAdmin,
    // Durante a impersonação o perfil recebe a clinica_id da clínica visitada,
    // então as telas de clínica reaparecem — que é justamente quando o dono
    // precisa delas.
    !!profile?.clinica_id,
    navigationMode
  );

  const searchedGroups = search.trim()
    ? filteredMenuGroups
        .map(g => ({
          ...g,
          items: g.items.filter(i =>
            i.label.toLowerCase().includes(search.toLowerCase())
          ),
        }))
        .filter(g => g.items.length > 0)
    : filteredMenuGroups;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(openGroups));
  }, [openGroups]);

  useEffect(() => {
    const activeGroup = filteredMenuGroups.find(group =>
      group.items.some(item => item.href === location.pathname)
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
        'flex h-screen flex-col transition-all duration-300 ease-out',
        'bg-sidebar border-r border-sidebar-border/40',
        isCollapsed ? 'w-[72px]' : 'w-[286px]'
      )}
      style={{ background: 'var(--gradient-sidebar)' }}
    >
      {/* ─── Header ─── */}
      <div className={cn(
        'flex items-center shrink-0',
        isCollapsed ? 'justify-center px-2 h-[76px]' : 'justify-between px-5 h-[76px]'
      )}>
        {!isCollapsed ? (
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl shrink-0 overflow-hidden bg-white shadow-sm ring-1 ring-sidebar-border/70">
              <img src={logoIcon} alt="EloLab" className="h-8 w-8 object-contain" />
              <div className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-white" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-base font-bold tracking-tight text-foreground">
                EloLab
              </span>
              <span className="mt-1 text-[10px] font-semibold tracking-[0.14em] text-sidebar-foreground/45 uppercase">
                Gestão clínica
              </span>
            </div>
          </div>
        ) : (
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/15">
            <img src={logoIcon} alt="EloLab" className="h-7 w-7 object-contain" />
            <div className="absolute -right-px -top-px h-2 w-2 rounded-full bg-primary ring-2 ring-sidebar animate-pulse" />
          </div>
        )}

        {!isCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(true)}
            aria-label="Recolher menu lateral"
            className="h-9 w-9 rounded-xl text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/70"
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
                  ? 'bg-white text-primary shadow-sm ring-1 ring-primary/15'
                  : 'text-sidebar-foreground/65 hover:bg-white/70 hover:text-sidebar-foreground',
              )}
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
              className="flex min-h-12 justify-center gap-2.5 rounded-xl px-2 text-sm font-semibold"
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
                ? 'bg-white text-primary shadow-sm ring-1 ring-primary/15'
                : 'text-sidebar-foreground/65 hover:bg-white/70 hover:text-sidebar-foreground',
            )}
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>Painel Admin</span>}
          </Link>
        </div>
      )}

      {!isCollapsed && (
        <div className="px-4 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sidebar-foreground/40" />
            <Input
              aria-label="Buscar no menu"
              name="menu-search"
              autoComplete="off"
              placeholder="Buscar no menu"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-10 rounded-xl border-sidebar-border/70 bg-white/75 pl-10 text-sm shadow-sm placeholder:text-sidebar-foreground/40 focus-visible:bg-white focus-visible:ring-sidebar-primary/25"
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
                className="h-10 w-full rounded-xl text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/70"
              >
                <PanelLeftOpen className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Expandir menu</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* ─── Navigation ─── */}
      <ScrollArea className="flex-1 px-3 py-2">
        <nav className="flex flex-col gap-1">
          {searchedGroups.map((group) => (
            <SidebarMenuGroup
              key={group.label}
              group={group}
              collapsed={isCollapsed}
              isOpen={openGroups.includes(group.label) || !!search.trim()}
              onToggle={() => toggleGroup(group.label)}
              currentPath={location.pathname}
              onNavigate={onNavigate}
            />
          ))}
        </nav>
      </ScrollArea>

      {/* ─── Footer ─── */}
      {!isCollapsed && (
        <div className="shrink-0 border-t border-sidebar-border/60 px-5 py-3">
          <p className="text-xs font-medium text-sidebar-foreground/45">
            EloLab <span className="px-1 text-sidebar-foreground/25">·</span> Gestão clínica
          </p>
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
  currentPath: string;
  onNavigate?: () => void;
}

function SidebarMenuGroup({ group, collapsed, isOpen, onToggle, currentPath, onNavigate }: SidebarMenuGroupProps) {
  const GroupIcon = group.icon;
  const hasActiveChild = group.items.some(item => item.href === currentPath);

  return (
    <div className="mb-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            onClick={() => !collapsed && onToggle()}
            whileHover={{ x: collapsed ? 0 : 2 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className={cn(
              'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] transition-all duration-200',
              collapsed && 'justify-center',
              hasActiveChild
                ? 'text-sidebar-foreground/90 bg-sidebar-accent/55'
                : 'text-sidebar-foreground/50 hover:text-sidebar-foreground/80 hover:bg-sidebar-accent/30',
            )}
          >
            {collapsed ? (
              <motion.div
                whileHover={{ scale: 1.12 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                className="h-9 w-9 rounded-xl flex items-center justify-center transition-all shadow-sm"
                style={{
                  backgroundColor: `${group.color}14`,
                  color: group.color,
                }}
              >
                <GroupIcon className="h-4 w-4" />
              </motion.div>
            ) : (
              <>
                <div
                  className="h-6 w-6 rounded-lg flex items-center justify-center shrink-0 transition-all"
                  style={{
                    backgroundColor: `${group.color}14`,
                    color: group.color,
                  }}
                >
                  <GroupIcon className="h-3.5 w-3.5" />
                </div>
                <span className="flex-1 text-left">{group.label}</span>
                <motion.div
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                >
                  <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/35" />
                </motion.div>
              </>
            )}
          </motion.button>
        </TooltipTrigger>
        {collapsed && (
          <TooltipContent side="right" className="font-medium text-xs">
            {group.label}
          </TooltipContent>
        )}
      </Tooltip>

      <AnimatePresence initial={false}>
        {isOpen && !collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-1 py-1.5 pl-1">
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
