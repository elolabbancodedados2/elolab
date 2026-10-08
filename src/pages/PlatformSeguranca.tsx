import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';

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
  ['Usuários', 'users'],
  ['Usuários com MFA', 'mfa_enabled'],
  ['E-mail pendente', 'unconfirmed_email'],
  ['Nunca / sem acesso há 90 dias', 'inactive_90d'],
  ['Sessões registradas', 'open_sessions'],
  ['Administradores ativos', 'platform_admins'],
  ['Acesso assistido ativo', 'assisted_access'],
] as const;

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

  if (query.isLoading) {
    return <div className="space-y-6"><Skeleton className="h-10 w-72" /><div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">{metricLabels.map(([label]) => <Skeleton key={label} className="h-24" />)}</div><Skeleton className="h-64" /><Skeleton className="h-64" /></div>;
  }

  if (query.error) return <ErrorState error={query.error} onRetry={() => { void query.refetch(); }} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ShieldCheck />Central de Segurança</h1>
          <p className="text-muted-foreground">Postura de acesso, MFA, sessões e operações sensíveis.</p>
          {query.data?.generated_at && <p className="mt-1 text-xs text-muted-foreground">Dados atualizados em {new Date(query.data.generated_at).toLocaleString('pt-BR')}</p>}
        </div>
        <Button variant="outline" onClick={() => { void query.refetch(); }} disabled={query.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />Atualizar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {metricLabels.map(([label, key]) => (
          <Card key={key}><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{metrics[key] ?? 0}</p></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Administradores da plataforma</CardTitle><CardDescription>Contas privilegiadas devem usar MFA e ser revisadas periodicamente.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {admins.map(admin => (
            <div key={admin.user_id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-sm font-medium">{admin.nome || admin.email}</p><p className="text-xs text-muted-foreground">{admin.email} · {admin.level}</p><p className="text-xs text-muted-foreground">Último acesso: {admin.last_sign_in_at ? new Date(admin.last_sign_in_at).toLocaleString('pt-BR') : 'nunca'}</p></div>
              <div className="flex gap-2"><Badge variant={admin.active ? 'outline' : 'destructive'}>{admin.active ? 'ativo' : 'inativo'}</Badge><Badge variant={admin.mfa_enabled ? 'outline' : 'destructive'}>{admin.mfa_enabled ? 'MFA ativo' : 'sem MFA'}</Badge></div>
            </div>
          ))}
          {admins.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum administrador cadastrado.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ações sensíveis recentes</CardTitle>
          <CardDescription>{visibleActions.length} de {actions.length} eventos exibidos. A busca cobre os até 100 eventos mais recentes em módulos administrativos e de acesso assistido.</CardDescription>
          <div className="relative pt-2"><Search aria-hidden="true" className="absolute left-3 top-5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={actionSearch} onChange={(event) => setActionSearch(event.target.value)} placeholder="Buscar ação, módulo, pessoa ou registro" aria-label="Buscar ações sensíveis" /></div>
        </CardHeader>
        <CardContent className="space-y-2">
          {visibleActions.map(action => (
            <div key={action.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div><p>{actionLabels[action.action] || action.action} · {collectionLabels[action.collection] || action.collection}{action.record_name || action.record_id ? ` · ${action.record_name || action.record_id}` : ''}</p><p className="text-xs text-muted-foreground">{action.user_name || action.user_email || action.user_id || 'Sistema'}{action.user_email && action.user_name ? ` · ${action.user_email}` : ''}</p></div>
              <time className="text-xs text-muted-foreground">{dateTime(action.timestamp)}</time>
            </div>
          ))}
          {visibleActions.length === 0 && <div className="flex flex-col items-center gap-2 py-6 text-center"><p className="text-sm text-muted-foreground">{actions.length ? 'Nenhum evento corresponde à busca dentro dos 100 mais recentes.' : 'Nenhuma ação sensível registrada.'}</p>{actions.length > 0 && actionSearch.trim() && <Button variant="ghost" size="sm" onClick={() => setActionSearch('')}>Limpar busca</Button>}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
