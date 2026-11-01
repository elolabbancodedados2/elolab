import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, CreditCard, History, RefreshCw, RotateCcw, Search, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { usePlatformRealtime } from '@/hooks/usePlatformRealtime';

type SubscriptionEvent = {
  id: number;
  clinica_nome: string | null;
  event_type: string;
  old_plan_slug: string | null;
  new_plan_slug: string | null;
  old_status: string | null;
  new_status: string | null;
  mrr_delta: number;
  occurred_at: string;
  source: string;
};
type FinancialHistory = {
  tracking_since: string | null;
  metrics: { expansion: number; contraction: number; churned: number; reactivated: number };
  events: SubscriptionEvent[];
};

const currency = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const eventLabels: Record<string, string> = {
  baseline: 'Marco inicial', created: 'Nova assinatura', upgrade: 'Upgrade', downgrade: 'Downgrade',
  canceled: 'Cancelamento', reactivated: 'Reativação', status_changed: 'Mudança de status',
};
const sourceLabels: Record<string, string> = { migration: 'Marco importado', database: 'Evento do banco' };

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR');
}

export default function PlatformHistoricoFinanceiro() {
  usePlatformRealtime();
  const [days, setDays] = useState('90');
  const [eventSearch, setEventSearch] = useState('');
  const [eventType, setEventType] = useState('all');
  const history = useQuery({
    queryKey: ['platform-financial-history', days],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('platform_financial_history', { p_days: Number(days) });
      if (error) throw error;
      return data as FinancialHistory;
    },
    refetchInterval: 30_000,
  });
  const metrics = history.data?.metrics;
  const events = history.data?.events || [];
  const visibleEvents = events.filter((event) => {
    if (eventType !== 'all' && event.event_type !== eventType) return false;
    const term = eventSearch.trim().toLocaleLowerCase('pt-BR');
    if (!term) return true;
    return [event.clinica_nome, eventLabels[event.event_type], event.event_type, event.old_plan_slug, event.new_plan_slug, event.old_status, event.new_status, sourceLabels[event.source], event.source]
      .some((value) => value?.toLocaleLowerCase('pt-BR').includes(term));
  });

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 pb-10">
      <PageHeader
        title="Histórico financeiro"
        icon={<History />}
        description={history.data
          ? `${events.length} eventos nos últimos ${days} dias · ${metrics?.churned || 0} cancelamentos · ${metrics?.reactivated || 0} reativações. Valores calculados a partir dos eventos de assinatura; não representam valores recebidos.`
          : 'Variações de MRR e churn calculados a partir dos eventos de assinatura; não representam valores recebidos.'}
        actions={<>
          <Button asChild variant="outline" className="rounded-full gap-2">
            <Link to="/admin/cobrancas"><CreditCard className="h-4 w-4" />Cobranças</Link>
          </Button>
          <Select value={days} onValueChange={setDays}><SelectTrigger className="h-10 w-32 rounded-full" aria-label="Período"><SelectValue /></SelectTrigger><SelectContent>{['30', '90', '180', '365'].map((value) => <SelectItem key={value} value={value}>{value} dias</SelectItem>)}</SelectContent></Select>
          <Button variant="outline" size="icon" className="rounded-full" onClick={() => void history.refetch()} disabled={history.isFetching} aria-label="Atualizar"><RefreshCw className={cn('h-4 w-4', history.isFetching && 'animate-spin')} /></Button>
        </>}
      />

      {history.isError && <ErrorState error={history.error} onRetry={() => { void history.refetch(); }} />}

      {history.isLoading ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24 rounded-2xl" />)}</div> : !history.isError && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Indicadores do histórico financeiro">
            {([
              { key: null, label: 'Expansão de MRR', value: currency(metrics?.expansion || 0), detail: 'variações positivas no período', icon: ArrowUpRight, tone: '', destaque: true },
              { key: null, label: 'Contração de MRR', value: currency(metrics?.contraction || 0), detail: 'variações negativas no período', icon: ArrowDownRight, tone: 'bg-warning/10 text-warning', destaque: false },
              { key: 'canceled', label: 'Cancelamentos', value: metrics?.churned || 0, detail: 'ver cancelamentos', icon: XCircle, tone: 'bg-destructive/10 text-destructive', destaque: false },
              { key: 'reactivated', label: 'Reativações', value: metrics?.reactivated || 0, detail: 'ver reativações', icon: RotateCcw, tone: 'bg-success/10 text-success', destaque: false },
            ] as const).map(({ key, label, value, detail, icon: Icon, tone, destaque }) => {
              const conteudo = (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={cn('text-sm', destaque ? 'text-white/80' : 'text-muted-foreground')}>{label}</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
                    <p className={cn('mt-0.5 text-[11px]', destaque ? 'text-white/70' : 'text-muted-foreground')}>{detail}</p>
                  </div>
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', destaque ? 'bg-white/20 text-white' : tone)}><Icon className="h-5 w-5" /></span>
                </div>
              );
              const base = cn('rounded-2xl border p-4 text-left shadow-xs', destaque ? 'border-transparent bg-gradient-primary text-white' : 'border-border/60 bg-card');
              return key === null ? <div key={label} className={base}>{conteudo}</div> : (
                <button
                  key={label}
                  type="button"
                  aria-pressed={eventType === key}
                  onClick={() => setEventType(eventType === key ? 'all' : key)}
                  className={cn(base, 'transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2', eventType === key && 'border-primary ring-1 ring-primary/40')}
                >
                  {conteudo}
                </button>
              );
            })}
          </section>
          <Card className="rounded-2xl border-border bg-secondary shadow-xs"><CardHeader><CardTitle className="text-base">Período de rastreamento</CardTitle><CardDescription>Eventos anteriores ao marco inicial não são reconstruídos artificialmente. {history.data?.tracking_since ? `Rastreamento desde ${dateTime(history.data.tracking_since)}.` : 'Ainda não há eventos para definir um marco inicial.'}</CardDescription></CardHeader></Card>
          <Card className="rounded-2xl border-border/60 shadow-xs">
            <CardHeader>
              <CardTitle>Linha do tempo</CardTitle>
              <CardDescription>{visibleEvents.length} de {events.length} eventos carregados; até 500 eventos de assinatura no período escolhido.</CardDescription>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <div className="relative w-full min-w-56 flex-1 sm:w-auto"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-10 rounded-full pl-9 focus-visible:ring-primary" value={eventSearch} onChange={(event) => setEventSearch(event.target.value)} placeholder="Buscar clínica, plano ou status" aria-label="Buscar eventos financeiros" /></div>
                {(eventSearch.trim() || eventType !== 'all') && <Button variant="outline" className="h-10 rounded-full" onClick={() => { setEventSearch(''); setEventType('all'); }}>Limpar filtros</Button>}
                <Select value={eventType} onValueChange={setEventType}><SelectTrigger className="h-10 w-full rounded-full sm:w-48" aria-label="Filtrar eventos financeiros por tipo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os eventos</SelectItem>{Object.entries(eventLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {visibleEvents.map((event) => {
                const delta = Number(event.mrr_delta || 0);
                return <article key={event.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3 transition-colors hover:border-foreground/25 hover:bg-secondary">
                  <div><p className="font-medium">{event.clinica_nome || 'Clínica não vinculada'}</p><p className="text-xs text-muted-foreground">{eventLabels[event.event_type] || event.event_type} · {event.old_plan_slug || event.old_status || '—'} → {event.new_plan_slug || event.new_status || '—'} · {dateTime(event.occurred_at)}</p><p className="text-xs text-muted-foreground">{sourceLabels[event.source] || event.source}</p></div>
                  <div className="flex items-center gap-2">{delta !== 0 && (delta > 0 ? <ArrowUpRight className="h-4 w-4 text-success" /> : <ArrowDownRight className="h-4 w-4 text-destructive" />)}<Badge variant={delta < 0 ? 'destructive' : 'outline'} className={cn('rounded-full tabular-nums', delta > 0 && 'border-success/30 bg-success/10 text-success')}>{delta > 0 ? '+' : ''}{currency(delta)}</Badge></div>
                </article>;
              })}
              {!visibleEvents.length && <div className="flex flex-col items-center gap-3 py-8 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><History className="h-6 w-6" /></span><p className="text-sm text-foreground">{events.length ? 'Nenhum evento corresponde à busca e ao tipo selecionado.' : 'Nenhum evento no período.'}</p>{events.length > 0 && (eventSearch.trim() || eventType !== 'all') ? <Button variant="outline" className="rounded-full" onClick={() => { setEventSearch(''); setEventType('all'); }}>Limpar filtros</Button> : !events.length && days !== '365' && <Button variant="outline" className="rounded-full" onClick={() => setDays('365')}>Ver últimos 365 dias</Button>}</div>}
              {events.length === 500 && <p role="status" className="text-xs text-muted-foreground">A lista atingiu o limite de 500 eventos; registros anteriores do período podem não aparecer.</p>}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
