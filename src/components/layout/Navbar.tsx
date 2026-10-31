import { useEffect, useRef } from 'react';
import { formatDate, primeiroNome } from '@/lib/formatters';
import { Bell, Menu, LogOut, User, Settings, Plus, CalendarPlus, UserPlus, FileText, FlaskConical, Mail, MessageSquare, Shield, History, Activity, MessageSquarePlus, LayoutDashboard, ShieldCheck } from '@/components/icons/elolabIcons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import type { AppRole } from '@/contexts/SupabaseAuthContext';
import { cn } from '@/lib/utils';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { KeyboardShortcutsDialog } from '@/components/KeyboardShortcutsDialog';
import { useRealtimeNotifications, type AppNotification } from '@/hooks/useRealtimeNotifications';
import { GlobalSearch } from '@/components/GlobalSearch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ContextualHelp } from '@/components/ContextualHelp';
import { toast } from 'sonner';
import { BarraHorario } from './BarraHorario';
import logoHorizontalWhite from '@/assets/elolab-logo-identidade.png';
import logoMark from '@/assets/elolab-symbol-identidade.png';
import { getNavigationMode } from '@/config/sidebarMenu';

const roleLabels: Record<AppRole, string> = {
  admin: 'Admin',
  medico: 'Médico',
  recepcao: 'Recepção',
  enfermagem: 'Enfermagem',
  financeiro: 'Financeiro',
};

interface NavbarProps {
  onMenuClick?: () => void;
  mobileMenuOpen: boolean;
}

export function Navbar({ onMenuClick, mobileMenuOpen }: NavbarProps) {
  const { user, profile, signOut, isAdmin, isPlatformAdmin } = useSupabaseAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const navigationMode = isPlatformAdmin && !profile?.clinica_id
    ? 'platform'
    : getNavigationMode(location.pathname, isPlatformAdmin);
  const { notifications: systemNotifications, unreadCount: systemUnread } = useRealtimeNotifications();
  const operationalSeenRef = useRef<{ owner: string; initialized: boolean; ids: Set<string> }>({ owner: '', initialized: false, ids: new Set() });

  const { data: activeClinic } = useQuery({
    queryKey: ['navbar-clinic-context', profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return null;
      const { data, error } = await supabase
        .from('clinicas')
        .select('nome')
        .eq('id', profile.clinica_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(profile?.clinica_id),
    staleTime: 5 * 60_000,
  });

  useKeyboardShortcuts();

  const { data: queueNotifications = [] } = useQuery({
    queryKey: ['notification-queue', profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return [];
      const { data } = await supabase
        .from('notification_queue')
        .select('*')
        .eq('clinica_id', profile.clinica_id)
        .order('created_at', { ascending: false })
        .limit(30);
      return data || [];
    },
    enabled: !!profile?.clinica_id,
    refetchInterval: 15000,
  });

  const { data: operationalNotifications = [] } = useQuery({
    queryKey: ['central-notificacoes', user?.id, profile?.clinica_id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('central_notificacoes_usuario', { p_limit: 250 });
      if (error) throw error;
      return (data ?? []) as Array<{ source_type: string; source_id: string; title: string; message: string; severity: 'info' | 'warning' | 'error'; href: string; is_read: boolean }>;
    },
    enabled: !!user && !!profile?.clinica_id,
    refetchInterval: 20000,
  });

  useEffect(() => {
    if (!user?.id || !profile?.clinica_id) return;
    const owner = `${user.id}:${profile.clinica_id}`;
    const tracker = operationalSeenRef.current;
    if (tracker.owner !== owner) {
      tracker.owner = owner;
      tracker.initialized = false;
      tracker.ids = new Set();
    }
    if (!operationalNotifications.length) return;

    const current = operationalNotifications.map((item) => ({
      item,
      id: `${item.source_type}:${item.source_id}`,
    }));
    if (!tracker.initialized) {
      current.forEach(({ id }) => tracker.ids.add(id));
      tracker.initialized = true;
      return;
    }

    current.forEach(({ item, id }) => {
      if (tracker.ids.has(id)) return;
      tracker.ids.add(id);
      if (item.is_read) return;
      const show = item.severity === 'error' ? toast.error : item.severity === 'warning' ? toast.warning : toast.info;
      show(item.title, {
        description: item.message,
        duration: 8000,
        action: item.href ? { label: 'Ver', onClick: () => navigate(item.href) } : undefined,
        className: 'border border-primary/15 shadow-xl',
      });
    });
  }, [operationalNotifications, user?.id, profile?.clinica_id, navigate]);

  const queueUnread = queueNotifications.filter((n: any) => n.status !== 'lida').length;
  // A aba Alertas mostra a mesma central operacional da tela de notificações.
  const operationalUnread = operationalNotifications.filter((item) => !item.is_read).length;
  const alertasUnread = operationalUnread + systemUnread;
  const totalUnread = alertasUnread + queueUnread;
  type OperationalItem = (typeof operationalNotifications)[number];
  const markOperationalRead = useMutation({
    mutationFn: async (item: OperationalItem) => {
      if (!user || !profile?.clinica_id || item.is_read) return;
      const { error } = await (supabase as any).from('user_notification_state').upsert({
        clinica_id: profile.clinica_id,
        user_id: user.id,
        source_type: item.source_type,
        source_id: item.source_id,
        read_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['central-notificacoes'] }),
  });
  const openOperational = (item: OperationalItem) => {
    markOperationalRead.mutate(item);
    if (item.href) navigate(item.href);
  };
  const operationalColor = (severity: OperationalItem['severity']) =>
    severity === 'error' ? 'bg-destructive' : severity === 'warning' ? 'bg-warning' : 'bg-info';

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  };

  const getNotificationColor = (type: AppNotification['type']) => {
    const colors = { info: 'bg-info', success: 'bg-success', warning: 'bg-warning', error: 'bg-destructive' };
    return colors[type];
  };

  const getQueueIcon = (tipo: string) => {
    if (tipo === 'email') return <Mail className="h-3.5 w-3.5 text-primary" />;
    if (tipo === 'whatsapp') return <MessageSquare className="h-3.5 w-3.5 text-green-600" />;
    return <Bell className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  return (
    <>
    <KeyboardShortcutsDialog />
    <header data-elo-font-preview="shell" className="navbar-gelo sticky top-0 z-30 flex min-h-16 shrink-0 items-center gap-2 border-b border-background/15 bg-foreground px-2 pt-[env(safe-area-inset-top)] text-background shadow-sm sm:gap-3 sm:px-4 md:px-5">
      {/* Left: Hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 shrink-0 rounded-xl text-background hover:bg-background/10 hover:text-background lg:hidden"
        aria-label={mobileMenuOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
        aria-expanded={mobileMenuOpen}
        aria-controls="menu-principal-mobile"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex shrink-0 items-center gap-2">
        <Link
          to={profile?.clinica_id ? '/dashboard' : '/painel-admin'}
          aria-label="EloLab"
          className="flex shrink-0 items-center focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-foreground"
        >
          <img src={logoHorizontalWhite} alt="EloLab" className="hidden h-8 w-auto sm:block" />
          <img src={logoMark} alt="EloLab" className="size-8 object-contain sm:hidden" />
        </Link>

        {isPlatformAdmin && (
          <nav aria-label="Alternar área" className="flex shrink-0 items-center gap-1 rounded-xl border border-background/15 bg-background/5 p-1">
            {profile?.clinica_id ? (
              <Link
                to="/dashboard"
                aria-label="App"
                aria-current={navigationMode === 'app' ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-foreground sm:px-2.5',
                  navigationMode === 'app' ? 'bg-background text-foreground' : 'text-background/80 hover:bg-background/10 hover:text-background',
                )}
              >
                <LayoutDashboard aria-hidden="true" className="size-4" />
                <span className="hidden xl:inline">App</span>
              </Link>
            ) : (
              <Button type="button" variant="ghost" disabled aria-label="App: vínculo da clínica ainda não configurado" className="min-h-10 px-2 text-background/50 sm:px-2.5">
                <LayoutDashboard aria-hidden="true" className="size-4" />
                <span className="hidden xl:inline">App</span>
              </Button>
            )}
            <Link
              to="/painel-admin"
              aria-label="Painel Admin"
              aria-current={navigationMode === 'platform' ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-foreground sm:px-2.5',
                navigationMode === 'platform' ? 'bg-background text-foreground' : 'text-background/80 hover:bg-background/10 hover:text-background',
              )}
            >
              <ShieldCheck aria-hidden="true" className="size-4" />
              <span className="hidden xl:inline">Painel Admin</span>
            </Link>
          </nav>
        )}
      </div>

      {/* Left: Search */}
      <div className="min-w-0 flex-1 sm:max-w-sm sm:flex-none [&_button]:border-background/20 [&_button]:bg-background/10 [&_button]:text-background [&_button]:hover:bg-background/15 [&_button]:focus-visible:ring-background/40 [&_kbd]:border-background/20 [&_kbd]:text-background/80">
        <GlobalSearch />
      </div>

      {profile?.clinica_id && profile.role && (
        <div role="group" aria-label="Contexto ativo" title={activeClinic?.nome || 'Clínica ativa'} className="hidden 2xl:flex min-w-0 max-w-[180px] shrink-0 flex-col px-2">
          <span className="truncate text-xs font-semibold text-background">{activeClinic?.nome || 'Clínica ativa'}</span>
          <span className="truncate text-xs text-background/75">{roleLabels[profile.role]}</span>
        </div>
      )}

      {/* Agenda de hoje (ocupa o espaço livre do cabeçalho) */}
      <div className="hidden min-w-0 max-w-[640px] flex-[2] px-2 lg:block">
        <BarraHorario />
      </div>

      {/* Right actions */}
      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        <ContextualHelp className="hidden text-background/85 hover:bg-background/10 hover:text-background sm:inline-flex" />
        {/* Quick Add */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  className="hidden h-10 px-4 sm:inline-flex"
                  aria-label="Adicionar rapidamente"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                  <span className="hidden xl:inline">Novo</span>
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Ação rápida</TooltipContent>
          </Tooltip>
          <DropdownMenuContent data-elo-font-preview="shell" align="end" className="w-56 rounded-xl p-1.5">
            <DropdownMenuLabel className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-[0.1em] px-2">
              Ações Rápidas
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="rounded-lg gap-2.5 py-2.5">
              <Link to="/agenda">
                <CalendarPlus className="h-4 w-4 text-primary" />
                Nova Consulta
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-lg gap-2.5 py-2.5">
              <Link to="/pacientes">
                <UserPlus className="h-4 w-4 text-success" />
                Novo Paciente
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-lg gap-2.5 py-2.5">
              <Link to="/prescricoes">
                <FileText className="h-4 w-4 text-info" />
                Nova Prescrição
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-lg gap-2.5 py-2.5">
              <Link to="/exames">
                <FlaskConical className="h-4 w-4 text-warning" />
                Solicitar Exame
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Unified Notification Center */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative h-11 w-11 rounded-xl text-background/85 hover:bg-background/10 hover:text-background"
                  aria-label="Abrir notificações"
                >
                  <Bell className="h-[17px] w-[17px]" />
                  {totalUnread > 0 && (
                    <span className="absolute top-2 right-2.5 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-highlight opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-highlight ring-2 ring-card" />
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {totalUnread > 0 ? `${totalUnread} notificações` : 'Notificações'}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent data-elo-font-preview="shell" align="end" className="w-[min(24rem,calc(100vw-1rem))] rounded-2xl p-0" onCloseAutoFocus={(e) => e.preventDefault()}>
            <Tabs defaultValue="alertas" className="w-full">
              <div className="px-3 pt-3 pb-0">
                <TabsList className="w-full grid grid-cols-2 h-9">
                  <TabsTrigger value="alertas" className="text-xs gap-1.5">
                    <Bell className="h-3.5 w-3.5" />
                    Alertas
                    {alertasUnread > 0 && (
                      <Badge variant="secondary" className="text-[9px] rounded-full px-1.5 h-4 min-w-4">{alertasUnread > 99 ? '99+' : alertasUnread}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="enviados" className="text-xs gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    Enviados
                    {queueUnread > 0 && (
                      <Badge variant="secondary" className="text-[9px] rounded-full px-1.5 h-4 min-w-4">{queueUnread}</Badge>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="alertas" className="mt-0 p-1.5">
                <ScrollArea className="h-[280px]">
                  {operationalNotifications.slice(0, 30).map((item) => (
                    <DropdownMenuItem
                      key={`${item.source_type}:${item.source_id}`}
                      onSelect={() => openOperational(item)}
                      className={cn(
                        'flex items-start gap-3 py-2.5 px-2 cursor-pointer rounded-lg mb-0.5 focus:bg-accent/50',
                        !item.is_read && 'bg-accent/30'
                      )}
                    >
                      <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', operationalColor(item.severity))} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{item.message}</p>
                      </div>
                      {!item.is_read && <span className="sr-only">Não lida</span>}
                    </DropdownMenuItem>
                  ))}
                  {systemNotifications.length > 0 ? systemNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={cn(
                        'flex items-start gap-3 py-2.5 px-2 cursor-pointer rounded-lg mb-0.5 hover:bg-accent/50 transition-colors',
                        !notification.read && 'bg-accent/30'
                      )}
                    >
                      <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', getNotificationColor(notification.type))} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{notification.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{notification.message}</p>
                        <p className="text-[10px] text-muted-foreground/40 mt-1">{notification.time}</p>
                      </div>
                    </div>
                  )) : operationalNotifications.length === 0 && (
                    <div className="py-10 text-center text-sm text-muted-foreground/40">
                      <Bell className="h-7 w-7 mx-auto mb-2 opacity-10" />
                      Sem alertas
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="enviados" className="mt-0 p-1.5">
                <ScrollArea className="h-[280px]">
                  {queueNotifications.length > 0 ? queueNotifications.map((notif: any) => (
                    <div
                      key={notif.id}
                      className={cn(
                        'flex items-start gap-2.5 p-2.5 rounded-lg mb-0.5 hover:bg-accent/50 transition-colors cursor-pointer',
                        notif.status !== 'lida' && 'bg-accent/30'
                      )}
                    >
                      <div className="mt-0.5">{getQueueIcon(notif.tipo)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{notif.assunto || notif.tipo}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {notif.destinatario_nome || notif.destinatario_email || notif.destinatario_telefone}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                            {notif.status === 'enviado' ? '✓ Enviado' : notif.status === 'erro' ? '✕ Erro' : notif.status}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground/40">
                            {formatDate(notif.created_at, 'short')}
                          </span>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="py-10 text-center text-sm text-muted-foreground/40">
                      <Mail className="h-7 w-7 mx-auto mb-2 opacity-10" />
                      Nenhum envio recente
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
            <DropdownMenuSeparator className="my-0" />
            <DropdownMenuItem asChild className="cursor-pointer justify-center rounded-none py-2 text-xs font-medium text-primary focus:bg-primary/5">
              <Link to="/notificacoes">Ver todas as notificações</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Divider */}
        <div aria-hidden="true" className="mx-1.5 hidden h-7 w-px bg-background/20 md:block" />

        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button aria-label={`Perfil de ${primeiroNome(profile?.nome) || 'usuário'}`} className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-1 py-1 text-background outline-none transition-colors hover:bg-background/10 focus-visible:ring-2 focus-visible:ring-ring md:justify-start md:pr-2">
              <Avatar className="h-10 w-10 ring-1 ring-border">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                  {profile?.nome ? getInitials(profile.nome) : 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-semibold leading-tight">{primeiroNome(profile?.nome)}</span>
                <span className="flex items-center gap-1 text-xs text-background/80 font-medium leading-tight">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  Online
                </span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent data-elo-font-preview="shell" align="end" className="w-64 rounded-2xl p-2">
            <div className="flex items-center gap-3 px-2 py-3 mb-1 rounded-xl bg-accent/30">
              <Avatar className="h-10 w-10 ring-2 ring-primary/20">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
                  {profile?.nome ? getInitials(profile.nome) : 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{profile?.nome}</p>
                <p className="text-[11px] text-muted-foreground truncate">{profile?.email}</p>
                {profile?.clinica_id && profile.role && (
                  <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
                    {activeClinic?.nome || 'Clínica ativa'} · {roleLabels[profile.role]}
                  </p>
                )}
                <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] text-primary font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Online
                </span>
              </div>
            </div>
            <DropdownMenuSeparator />
            {/* "Meu Perfil" e "Configurações" apontavam para /configuracoes, que é
                só de admin: quem não era admin clicava e recebia "sem permissão". */}
            {[
              { to: '/preferencias', icon: User, label: 'Minhas preferências' },
              { to: '/seguranca', icon: Shield, label: 'Segurança da conta' },
              { to: '/meu-historico', icon: History, label: 'Meu histórico' },
              { to: '/indicadores', icon: Activity, label: 'Meus indicadores' },
              { to: '/feedback', icon: MessageSquarePlus, label: 'Enviar feedback' },
            ].map(({ to, icon: Icon, label }, i) => (
              <DropdownMenuItem key={to} asChild className={cn('rounded-lg gap-2.5 py-2', i === 0 && 'mt-1')}>
                <Link to={to}><Icon className="h-4 w-4 text-muted-foreground" />{label}</Link>
              </DropdownMenuItem>
            ))}
            {isAdmin() && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="rounded-lg gap-2.5 py-2">
                  <Link to="/configuracoes"><Settings className="h-4 w-4 text-muted-foreground" />Configurações da clínica</Link>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="rounded-lg gap-2.5 py-2.5 text-destructive focus:text-destructive focus:bg-destructive/8"
            >
              <LogOut className="h-4 w-4" />Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
    </>
  );
}
