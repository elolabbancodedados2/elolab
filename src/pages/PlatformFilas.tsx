import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, RefreshCw, RotateCcw, Search, Webhook } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/ErrorState';
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

export default function PlatformFilas() {
  const queryClient = useQueryClient();
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const [search, setSearch] = useState('');
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
  const notifications = (query.data?.notifications || []).filter(matchesSearch);
  const webhooks = (query.data?.webhooks || []).filter(matchesSearch);
  const stats = [
    ['Notificações pendentes', metrics.notifications_pending],
    ['Notificações com erro', metrics.notifications_failed],
    ['Webhooks pendentes', metrics.webhooks_pending],
    ['Falhas webhook 24h', metrics.webhooks_failed_24h],
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Activity />Filas e Webhooks</h1>
          <p className="text-muted-foreground">Falhas operacionais e reprocessamento idempotente com auditoria.</p>
          {query.data?.generated_at && <p className="mt-1 text-xs text-muted-foreground">Dados consolidados: {formatDate(query.data.generated_at)} · atualização automática a cada 30 segundos</p>}
        </div>
        <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />Atualizar
        </Button>
      </div>

      {query.isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">{[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-20" />)}</div>
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : query.isError ? (
        <ErrorState title="Não foi possível carregar filas e webhooks" error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {stats.map(([label, value]) => (
              <Card key={label}><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value ?? 0}</p></CardContent></Card>
            ))}
          </div>

          <div className="relative max-w-lg">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar clínica, tipo, evento ou erro" aria-label="Buscar em notificações e webhooks" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Fila de notificações</CardTitle>
              <CardDescription>{notifications.length} resultado(s) entre as até 200 notificações mais recentes. Destinatários e conteúdo não são exibidos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {notifications.map(item => {
                const status = notificationStatus(item.status);
                const jobKey = `notification:${item.id}`;
                return (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{item.tipo || 'Notificação'} · {item.clinica_nome || 'sem clínica'}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(item.created_at)} · {item.tentativas ?? 0}/{item.max_tentativas ?? 0} tentativas</p>
                      {item.erro_mensagem && <p className="text-xs text-destructive">{item.erro_mensagem}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {item.status === 'erro' && <Button size="sm" variant="outline" disabled={busyJob !== null} onClick={() => void retry('notification', item.id)}><RotateCcw className={`mr-1 h-3 w-3 ${busyJob === jobKey ? 'animate-spin' : ''}`} />Reprocessar</Button>}
                    </div>
                  </div>
                );
              })}
              {!notifications.length && <div className="flex flex-col items-center gap-2 py-5 text-center"><p className="text-sm text-muted-foreground">{search.trim() ? 'Nenhuma notificação corresponde à busca.' : 'Não há notificações pendentes ou com erro.'}</p>{search.trim() && <Button variant="ghost" size="sm" onClick={() => setSearch('')}>Limpar busca</Button>}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Webhook className="h-5 w-5" />Mercado Pago</CardTitle>
              <CardDescription>{webhooks.length} resultado(s) entre os até 200 webhooks mais recentes. O payload permanece no servidor e é reenviado pelo canal interno autenticado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {webhooks.map(item => {
                const jobKey = `mercadopago:${item.id}`;
                return (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{item.event_type || 'Evento sem tipo'}</p>
                      <p className="text-xs text-muted-foreground">{item.event_id || 'sem id'} · {formatDate(item.created_at)}</p>
                      {item.erro_mensagem && <p className="text-xs text-destructive">{item.erro_mensagem}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Badge variant={item.processado ? 'outline' : item.erro_mensagem ? 'destructive' : 'secondary'}>{item.processado ? 'Processado' : item.erro_mensagem ? 'Falhou' : 'Pendente'}</Badge>
                      {!item.processado && <Button size="sm" variant="outline" disabled={busyJob !== null} onClick={() => void retry('mercadopago', item.id)}><RotateCcw className={`mr-1 h-3 w-3 ${busyJob === jobKey ? 'animate-spin' : ''}`} />Reprocessar</Button>}
                    </div>
                  </div>
                );
              })}
              {!webhooks.length && <div className="flex flex-col items-center gap-2 py-5 text-center"><p className="text-sm text-muted-foreground">{search.trim() ? 'Nenhum webhook corresponde à busca.' : 'Nenhum webhook recente para exibir.'}</p>{search.trim() && <Button variant="ghost" size="sm" onClick={() => setSearch('')}>Limpar busca</Button>}</div>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
