import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, Bell, BellOff, CheckCircle2, Clock3, RefreshCw, RotateCcw, Search, ServerCrash, Webhook } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';

type Item = {
  id: string;
  clinica_nome?: string;
  tipo?: string;
  status?: string;
  tentativas?: number;
  max_tentativas?: number;
  erro_mensagem?: string;
  created_at: string;
  event_type?: string;
  event_id?: string;
  data_id?: string;
  processado?: boolean;
};

type Data = {
  generated_at: string;
  metrics: Record<string, number>;
  notifications: Item[];
  webhooks: Item[];
};

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR');
};

const notificationStatus = (status?: string) => {
  if (status === 'erro') return { label: 'Erro', variant: 'destructive' as const };
  if (status === 'enviando') return { label: 'Enviando', variant: 'outline' as const };
  if (status === 'pendente') return { label: 'Pendente', variant: 'secondary' as const };
  return { label: status || 'Desconhecido', variant: 'secondary' as const };
};

type Filtro = 'todos' | 'notif_pendente' | 'notif_erro' | 'webhook_pendente';

export default function PlatformFilas() {
  const queryClient = useQueryClient();
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const retryLock = useRef(false);
  const query = useQuery({
    queryKey: ['platform-queues'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('platform_queue_overview');
      if (error) throw error;
      return data as Data;
    },
    refetchInterval: 30_000,
  });

  const retry = async (kind: 'notification' | 'mercadopago', id: string) => {
    const key = `${kind}:${id}`;
    if (retryLock.current) return;
    retryLock.current = true;
    setBusyJob(key);
    try {
      const { data, error } = await supabase.functions.invoke('platform-reprocess-job', { body: { kind, id } });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Não foi possível reprocessar o trabalho.');
      if (data?.already_processed) {
        toast.info('Este webhook já foi processado. A fila foi atualizada.');
      } else if (kind === 'notification' && data?.requeued) {
        toast.success('Notificação recolocada na fila.');
      } else {
        toast.success('Webhook reenviado para processamento.');
      }
      await queryClient.invalidateQueries({ queryKey: ['platform-queues'] });
    } catch (error) {
      toast.error('Reprocessamento falhou', { description: error instanceof Error ? error.message : 'Tente novamente.' });
    } finally {
      retryLock.current = false;
      setBusyJob(null);
    }
  };

  const metrics = query.data?.metrics || {};
  const term = search.trim().toLocaleLowerCase('pt-BR');
  const matchesSearch = (item: Item) => !term || [item.clinica_nome, item.tipo, item.event_type, item.event_id, item.data_id, item.erro_mensagem]
    .some(value => value?.toLocaleLowerCase('pt-BR').includes(term));
  const allNotifications = query.data?.notifications || [];
  const allWebhooks = query.data?.webhooks || [];
  const showNotifications = filtro !== 'webhook_pendente';
  const showWebhooks = filtro === 'todos' || filtro === 'webhook_pendente';
  const notifications = allNotifications.filter(matchesSearch).filter(item =>
    filtro === 'notif_erro' ? item.status === 'erro' : filtro === 'notif_pendente' ? item.status === 'pendente' : true);
  const webhooks = allWebhooks.filter(matchesSearch).filter(item => filtro !== 'webhook_pendente' || !item.processado);
  const hasFilter = !!term || filtro !== 'todos';
  const clearFilters = () => { setSearch(''); setFiltro('todos'); };
  const shown = (showNotifications ? notifications.length : 0) + (showWebhooks ? webhooks.length : 0);
  const stats: Array<{ label: string; value?: number; icon: typeof Bell; cor: string; filtro?: Filtro }> = [
    { label: 'Notificações com erro', value: metrics.notifications_failed, icon: BellOff, cor: 'bg-white/20 text-white', filtro: 'notif_erro' },
    { label: 'Notificações pendentes', value: metrics.notifications_pending, icon: Bell, cor: 'bg-warning/10 text-warning', filtro: 'notif_pendente' },
    { label: 'Webhooks pendentes', value: metrics.webhooks_pending, icon: Clock3, cor: 'bg-[#1080CA]/10 text-[#1080CA]', filtro: 'webhook_pendente' },
    { label: 'Falhas webhook 24h', value: metrics.webhooks_failed_24h, icon: AlertTriangle, cor: 'bg-destructive/10 text-destructive' },
  ];
  const emptyState = (message: string) => (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><CheckCircle2 className="h-6 w-6" /></span>
      <p className="text-sm text-muted-foreground">{message}</p>
      {hasFilter && <Button variant="outline" size="sm" className="rounded-full" onClick={clearFilters}>Limpar filtros</Button>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <PageHeader
          title="Filas e Webhooks"
          icon={<Activity />}
          description={query.data
            ? `${metrics.notifications_failed ?? 0} notificações com erro · ${metrics.notifications_pending ?? 0} pendentes · ${metrics.webhooks_pending ?? 0} webhooks pendentes`
            : 'Falhas operacionais e reprocessamento idempotente com auditoria.'}
          actions={<>
            <Button asChild variant="outline" className="rounded-full gap-2"><Link to="/admin/erros"><ServerCrash className="h-4 w-4" />Logs e erros</Link></Button>
            <Button type="button" variant="outline" size="icon" className="rounded-full" aria-label="Atualizar" onClick={() => void query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} />
            </Button>
          </>}
        />
        {query.data?.generated_at && <p className="mt-2 text-xs text-muted-foreground">Dados consolidados: {formatDate(query.data.generated_at)} · atualização automática a cada 30 segundos</p>}
      </div>

      {query.isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-20 rounded-2xl" />)}</div>
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : query.isError ? (
        <ErrorState title="Não foi possível carregar filas e webhooks" error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {stats.map(({ label, value, icon: Icon, cor, filtro: alvo }, i) => {
              const content = (
                <>
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', cor)}><Icon className="h-5 w-5" /></span>
                  <span className="min-w-0">
                    <span className="block text-2xl font-bold tabular-nums">{value ?? 0}</span>
                    <span className={cn('block text-[11px] font-medium', i === 0 ? 'text-white/80' : 'text-muted-foreground')}>{label}</span>
                  </span>
                </>
              );
              const className = cn(
                'flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 text-left shadow-xs',
                i === 0 && 'border-transparent bg-gradient-primary text-white',
                alvo && filtro === alvo && 'ring-2 ring-[#1080CA]/40',
              );
              return alvo ? (
                <button key={label} type="button" aria-pressed={filtro === alvo} onClick={() => setFiltro(filtro === alvo ? 'todos' : alvo)} className={cn(className, 'transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}>{content}</button>
              ) : <div key={label} className={className}>{content}</div>;
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-60 sm:max-w-lg">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar clínica, tipo, evento ou erro" aria-label="Buscar em notificações e webhooks" />
            </div>
            {hasFilter && <Button variant="ghost" size="sm" className="h-8 rounded-full text-xs" onClick={clearFilters}>Limpar filtros</Button>}
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">{shown} de {allNotifications.length + allWebhooks.length}</span>
          </div>

          {showNotifications && <Card className="rounded-2xl border-border/60 shadow-xs">
            <CardHeader>
              <CardTitle>Fila de notificações</CardTitle>
              <CardDescription>{notifications.length} resultado(s) entre as até 200 notificações mais recentes. Destinatários e conteúdo não são exibidos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {notifications.map(item => {
                const status = notificationStatus(item.status);
                const jobKey = `notification:${item.id}`;
                return (
                  <div key={item.id} className={cn('flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 p-3', item.status === 'erro' && 'border-l-4 border-l-destructive/60')}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.tipo || 'Notificação'} · {item.clinica_nome || 'sem clínica'}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(item.created_at)} · {item.tentativas ?? 0}/{item.max_tentativas ?? 0} tentativas</p>
                      {item.erro_mensagem && <p className="text-xs text-destructive">{item.erro_mensagem}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Badge variant={status.variant} className="rounded-full">{status.label}</Badge>
                      {item.status === 'erro' && <Button size="sm" className="h-9 rounded-full bg-[#1080CA] text-xs text-white hover:brightness-110" disabled={busyJob !== null} onClick={() => void retry('notification', item.id)}><RotateCcw className={`mr-1 h-3 w-3 ${busyJob === jobKey ? 'animate-spin' : ''}`} />Reprocessar</Button>}
                    </div>
                  </div>
                );
              })}
              {!notifications.length && emptyState(hasFilter ? 'Nenhuma notificação corresponde aos filtros.' : 'Não há notificações pendentes ou com erro.')}
            </CardContent>
          </Card>}

          {showWebhooks && <Card className="rounded-2xl border-border/60 shadow-xs">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Webhook className="h-5 w-5" />Mercado Pago</CardTitle>
              <CardDescription>{webhooks.length} resultado(s) entre os até 200 webhooks mais recentes. O payload permanece no servidor e é reenviado pelo canal interno autenticado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {webhooks.map(item => {
                const jobKey = `mercadopago:${item.id}`;
                return (
                  <div key={item.id} className={cn('flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 p-3', !item.processado && item.erro_mensagem && 'border-l-4 border-l-destructive/60')}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.event_type || 'Evento sem tipo'}</p>
                      <p className="text-xs text-muted-foreground">{item.event_id || 'sem id'} · {formatDate(item.created_at)}</p>
                      {item.erro_mensagem && <p className="text-xs text-destructive">{item.erro_mensagem}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Badge variant={item.processado ? 'outline' : item.erro_mensagem ? 'destructive' : 'secondary'} className={cn('rounded-full', item.processado && 'border-success/30 text-success')}>{item.processado ? 'Processado' : item.erro_mensagem ? 'Falhou' : 'Pendente'}</Badge>
                      {!item.processado && <Button size="sm" className="h-9 rounded-full bg-[#1080CA] text-xs text-white hover:brightness-110" disabled={busyJob !== null} onClick={() => void retry('mercadopago', item.id)}><RotateCcw className={`mr-1 h-3 w-3 ${busyJob === jobKey ? 'animate-spin' : ''}`} />Reprocessar</Button>}
                    </div>
                  </div>
                );
              })}
              {!webhooks.length && emptyState(hasFilter ? 'Nenhum webhook corresponde aos filtros.' : 'Nenhum webhook recente para exibir.')}
            </CardContent>
          </Card>}
        </>
      )}
    </div>
  );
}
