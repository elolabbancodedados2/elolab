import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Activity, Clock, Headset, KeyRound, MailWarning, RefreshCw, Search, ShieldCheck, UserCog, Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type Admin = {
  user_id: string;
  email: string;
  nome: string;
  level: string;
  active: boolean;
  created_at: string;
  last_sign_in_at?: string | null;
  mfa_enabled: boolean;
};

type Action = {
  id: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  action: string;
  collection: string;
  record_id: string | null;
  record_name?: string | null;
  timestamp: string;
};

type Data = {
  generated_at: string;
  metrics: Record<string, number>;
  admins: Admin[];
  recent_sensitive_actions: Action[];
};

const metricLabels = [
  ['Usuários', 'users', Users, '/usuarios'],
  ['Usuários com MFA', 'mfa_enabled', KeyRound, null],
  ['E-mail pendente', 'unconfirmed_email', MailWarning, '/usuarios'],
  ['Nunca / sem acesso há 90 dias', 'inactive_90d', Clock, '/usuarios'],
  ['Sessões registradas', 'open_sessions', Activity, null],
  ['Administradores ativos', 'platform_admins', UserCog, null],
  ['Acesso assistido ativo', 'assisted_access', Headset, '/admin/acesso-assistido'],
] as const;

type AdminFilter = 'todos' | 'sem_mfa' | 'inativos';
const adminFilters: Array<[AdminFilter, string]> = [['todos', 'Todos'], ['sem_mfa', 'Sem MFA'], ['inativos', 'Inativos']];

const actionLabels: Record<string, string> = {
  create: 'Criou',
  update: 'Atualizou',
  delete: 'Removeu',
  access: 'Acessou',
  sign: 'Assinou',
  edit_request: 'Solicitou edição',
};

const collectionLabels: Record<string, string> = {
  platform_restore_requests: 'Solicitações de restauração',
  support_access: 'Acesso assistido',
  platform_incidents: 'Incidentes',
  notification_queue: 'Fila de notificações',
  mercadopago_webhook_logs: 'Webhooks do Mercado Pago',
  platform_tenant_limits: 'Limites de consumo',
  platform_ai_config: 'Configuração de IA',
  platform_announcements: 'Comunicados globais',
  platform_operational_state: 'Controles operacionais',
  platform_feature_flags: 'Feature flags',
  lgpd_access_request_log: 'Solicitações LGPD',
};

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR');
}

export default function PlatformSeguranca() {
  const [actionSearch, setActionSearch] = useState('');
  const [adminFilter, setAdminFilter] = useState<AdminFilter>('todos');
  const query = useQuery({
    queryKey: ['platform-security'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('platform_security_overview');
      if (error) throw error;
      return data as Data;
    },
    refetchInterval: 60_000,
  });

  const metrics = query.data?.metrics ?? {};
  const admins = query.data?.admins ?? [];
  const actions = query.data?.recent_sensitive_actions ?? [];
  const visibleActions = useMemo(() => {
    const term = actionSearch.trim().toLocaleLowerCase('pt-BR');
    if (!term) return actions;
    return actions.filter((action) => [
      actionLabels[action.action] || action.action,
      collectionLabels[action.collection] || action.collection,
      action.user_name,
      action.user_email,
      action.user_id,
      action.record_name,
      action.record_id,
    ].some((value) => value?.toLocaleLowerCase('pt-BR').includes(term)));
  }, [actions, actionSearch]);

  const visibleAdmins = admins.filter((admin) => (
    adminFilter === 'sem_mfa' ? !admin.mfa_enabled : adminFilter === 'inativos' ? !admin.active : true
  ));
  const adminsSemMfa = admins.filter((admin) => !admin.mfa_enabled).length;

  if (query.isLoading) {
    return <div className="space-y-6"><Skeleton className="h-10 w-72" /><div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">{metricLabels.map(([label]) => <Skeleton key={label} className="h-28 rounded-2xl" />)}</div><Skeleton className="h-64 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>;
  }

  if (query.error) return <ErrorState error={query.error} onRetry={() => { void query.refetch(); }} />;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 pb-10">
      <PageHeader
        title="Central de Segurança"
        icon={<ShieldCheck />}
        description={`${metrics.users ?? 0} usuários · ${metrics.mfa_enabled ?? 0} com MFA · ${admins.length} administradores${adminsSemMfa ? ` (${adminsSemMfa} sem MFA)` : ''} · ${actions.length} ações sensíveis recentes`}
        actions={
          <Button type="button" variant="outline" size="icon" className="rounded-full" onClick={() => { void query.refetch(); }} disabled={query.isFetching} aria-label="Atualizar dados">
            <RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} />
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7" aria-label="Indicadores de segurança">
        {metricLabels.map(([label, key, Icon, href], index) => {
          const main = index === 0;
          const content = (
            <Card className={cn('h-full rounded-2xl border-border/60 shadow-xs transition-all', href && 'group-hover:-translate-y-0.5 group-hover:shadow-md', main && 'border-transparent bg-gradient-primary text-white')}>
              <CardContent className="space-y-2 p-4">
                <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', main ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary')}><Icon className="h-5 w-5" /></span>
                <p className="text-2xl font-bold tabular-nums">{metrics[key] ?? 0}</p>
                <p className={cn('text-[11px] leading-tight', main ? 'text-white/75' : 'text-muted-foreground')}>{label}</p>
              </CardContent>
            </Card>
          );
          return href
            ? <Link key={key} to={href} className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{content}</Link>
            : <div key={key}>{content}</div>;
        })}
      </section>

      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader className="space-y-3">
          <div><CardTitle>Administradores da plataforma</CardTitle><CardDescription>Contas privilegiadas devem usar MFA e ser revisadas periodicamente.</CardDescription></div>
          <div className="flex flex-wrap items-center gap-2">
            {adminFilters.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={adminFilter === value}
                onClick={() => setAdminFilter(value)}
                className={cn('h-8 rounded-full border px-3 text-xs font-medium transition-colors', adminFilter === value ? 'border-transparent bg-gradient-primary text-white shadow-sm' : 'border-border bg-card hover:border-foreground/25')}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto text-xs text-muted-foreground">{visibleAdmins.length} de {admins.length}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {visibleAdmins.map(admin => (
            <div key={admin.user_id} className="flex flex-col gap-3 rounded-xl border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="truncate text-sm font-medium">{admin.nome || admin.email}</p><p className="truncate text-xs text-muted-foreground">{admin.email} · {admin.level}</p><p className="text-xs text-muted-foreground">Último acesso: {admin.last_sign_in_at ? new Date(admin.last_sign_in_at).toLocaleString('pt-BR') : 'nunca'}</p></div>
              <div className="flex gap-2"><Badge variant={admin.active ? 'outline' : 'destructive'} className="rounded-full">{admin.active ? 'ativo' : 'inativo'}</Badge><Badge variant={admin.mfa_enabled ? 'outline' : 'destructive'} className="rounded-full">{admin.mfa_enabled ? 'MFA ativo' : 'sem MFA'}</Badge></div>
            </div>
          ))}
          {admins.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum administrador cadastrado.</p>}
          {admins.length > 0 && visibleAdmins.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-sm text-muted-foreground">Nenhum administrador neste filtro.</p>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setAdminFilter('todos')}>Limpar filtros</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader>
          <CardTitle>Ações sensíveis recentes</CardTitle>
          <CardDescription>{visibleActions.length} de {actions.length} eventos exibidos. A busca cobre os até 100 eventos mais recentes em módulos administrativos e de acesso assistido.</CardDescription>
          <div className="relative pt-2"><Search aria-hidden="true" className="absolute left-3 top-5 h-4 w-4 text-muted-foreground" /><Input className="h-10 rounded-full pl-9 focus-visible:ring-primary" value={actionSearch} onChange={(event) => setActionSearch(event.target.value)} placeholder="Buscar ação, módulo, pessoa ou registro" aria-label="Buscar ações sensíveis" /></div>
        </CardHeader>
        <CardContent className="space-y-2">
          {visibleActions.map(action => (
            <div key={action.id} className="flex flex-col gap-2 rounded-xl border border-border/60 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="break-words">{actionLabels[action.action] || action.action} · {collectionLabels[action.collection] || action.collection}{action.record_name || action.record_id ? ` · ${action.record_name || action.record_id}` : ''}</p><p className="truncate text-xs text-muted-foreground">{action.user_name || action.user_email || action.user_id || 'Sistema'}{action.user_email && action.user_name ? ` · ${action.user_email}` : ''}</p></div>
              <time className="shrink-0 text-xs text-muted-foreground">{dateTime(action.timestamp)}</time>
            </div>
          ))}
          {visibleActions.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><ShieldCheck className="h-6 w-6" /></span>
              <p className="text-sm text-muted-foreground">{actions.length ? 'Nenhum evento corresponde à busca dentro dos 100 mais recentes.' : 'Nenhuma ação sensível registrada.'}</p>
              {actions.length > 0 && actionSearch.trim() && <Button variant="outline" size="sm" className="rounded-full" onClick={() => setActionSearch('')}>Limpar busca</Button>}
            </div>
          )}
        </CardContent>
      </Card>

      {query.data?.generated_at && <p className="text-right text-xs text-muted-foreground">Dados atualizados em {new Date(query.data.generated_at).toLocaleString('pt-BR')}</p>}
    </main>
  );
}
