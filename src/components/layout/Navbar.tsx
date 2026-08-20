import { Bell, Menu, LogOut, User, Settings, Plus, CalendarPlus, UserPlus, FileText, FlaskConical, Mail, MessageSquare } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
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
import { cn } from '@/lib/utils';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { KeyboardShortcutsDialog } from '@/components/KeyboardShortcutsDialog';
import { useRealtimeNotifications, type AppNotification } from '@/hooks/useRealtimeNotifications';
import { GlobalSearch } from '@/components/GlobalSearch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ContextualHelp } from '@/components/ContextualHelp';

interface NavbarProps {
  onMenuClick?: () => void;
}

export function Navbar({ onMenuClick }: NavbarProps) {
  const { profile, signOut } = useSupabaseAuth();
  const navigate = useNavigate();
  const { notifications: systemNotifications, unreadCount: systemUnread } = useRealtimeNotifications();

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

  const queueUnread = queueNotifications.filter((n: any) => n.status !== 'lida').length;
  const totalUnread = systemUnread + queueUnread;

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
    <header className="sticky top-0 z-30 flex min-h-14 items-center border-b border-border/25 bg-background/75 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-2xl sm:px-3 md:px-5">
      {/* Left: Hamburger */}
      <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-xl md:hidden" aria-label="Abrir menu de navegação" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
      </Button>

      {/* Left: Search */}
      <div className="min-w-0 flex-1 sm:max-w-sm sm:flex-none">
        <GlobalSearch />
      </div>

      {/* Spacer */}
      <div className="hidden flex-1 sm:block" />

      {/* Right actions */}
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <ContextualHelp />
        {/* Quick Add */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden sm:inline-flex h-9 w-9 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/8 transition-all duration-200"
                  aria-label="Adicionar rapidamente"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Ação rápida</TooltipContent>
            </Tooltip>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5">
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
          <DropdownMenuTrigger asChild>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative h-11 w-11 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-all duration-200"
                  aria-label="Abrir notificações"
                >
                  <Bell className="h-[17px] w-[17px]" />
                  {totalUnread > 0 && (
                    <span className="absolute top-1 right-1 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {totalUnread > 0 ? `${totalUnread} notificações` : 'Notificações'}
              </TooltipContent>
            </Tooltip>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-1rem))] rounded-xl p-0" onCloseAutoFocus={(e) => e.preventDefault()}>
            <Tabs defaultValue="alertas" className="w-full">
              <div className="px-3 pt-3 pb-0">
                <TabsList className="w-full grid grid-cols-2 h-9">
                  <TabsTrigger value="alertas" className="text-xs gap-1.5">
                    <Bell className="h-3.5 w-3.5" />
                    Alertas
                    {systemUnread > 0 && (
                      <Badge variant="secondary" className="text-[9px] rounded-full px-1.5 h-4 min-w-4">{systemUnread}</Badge>
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
                  )) : (
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
                            {new Date(notif.created_at).toLocaleDateString('pt-BR')}
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
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Divider */}
        <div className="hidden md:block w-px h-7 bg-border/40 mx-1.5" />

        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-1 py-1 outline-none transition-all hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring md:justify-start md:pr-2">
              <Avatar className="h-8 w-8 ring-2 ring-primary/20">
                <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground text-xs font-bold">
                  {profile?.nome ? getInitials(profile.nome) : 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-[13px] font-semibold leading-tight">{profile?.nome?.split(' ')[0]}</span>
                <span className="flex items-center gap-1 text-[10px] text-primary font-medium leading-tight">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Online
                </span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 rounded-xl p-2">
            <div className="flex items-center gap-3 px-2 py-3 mb-1 rounded-xl bg-accent/30">
              <Avatar className="h-10 w-10 ring-2 ring-primary/20">
                <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground text-sm font-bold">
                  {profile?.nome ? getInitials(profile.nome) : 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{profile?.nome}</p>
                <p className="text-[11px] text-muted-foreground truncate">{profile?.email}</p>
                <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] text-primary font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Online
                </span>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="rounded-lg gap-2.5 py-2.5 mt-1">
              <Link to="/configuracoes"><User className="h-4 w-4 text-primary" />Meu Perfil</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-lg gap-2.5 py-2.5">
              <Link to="/configuracoes"><Settings className="h-4 w-4 text-muted-foreground" />Configurações</Link>
            </DropdownMenuItem>
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
