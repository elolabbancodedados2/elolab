import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, History, RefreshCw, Search } from 'lucide-react';

import { ErrorState } from '@/components/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';

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
    <div className="space-y-6 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><History className="h-6 w-6 text-primary" /> Histórico financeiro</h1>
          <p className="mt-1 text-sm text-muted-foreground">Variações de MRR e churn calculados a partir dos eventos de assinatura; não representam valores recebidos.</p>
        </div>
        <div className="flex gap-2">
          <Select value={days} onValueChange={setDays}><SelectTrigger className="w-32" aria-label="Período"><SelectValue /></SelectTrigger><SelectContent>{['30', '90', '180', '365'].map((value) => <SelectItem key={value} value={value}>{value} dias</SelectItem>)}</SelectContent></Select>
          <Button variant="outline" className="min-h-11" onClick={() => void history.refetch()} disabled={history.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${history.isFetching ? 'animate-spin' : ''}`} /> Atualizar</Button>
        </div>
      </header>

      {history.isError && <ErrorState error={history.error} onRetry={() => { void history.refetch(); }} />}

      {history.isLoading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24" />)}</div> : !history.isError && (
        <>
          <Card><CardHeader><CardTitle>Período de rastreamento</CardTitle><CardDescription>Eventos anteriores ao marco inicial não são reconstruídos artificialmente. {history.data?.tracking_since ? `Rastreamento desde ${dateTime(history.data.tracking_since)}.` : 'Ainda não há eventos para definir um marco inicial.'}</CardDescription></CardHeader></Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Expansão de MRR', currency(metrics?.expansion || 0)],
              ['Contração de MRR', currency(metrics?.contraction || 0)],
              ['Cancelamentos', metrics?.churned || 0],
              ['Reativações', metrics?.reactivated || 0],
            ].map(([label, value]) => <Card key={label}><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></CardContent></Card>)}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Linha do tempo</CardTitle>
              <CardDescription>{visibleEvents.length} de {events.length} eventos carregados; até 500 eventos de assinatura no período escolhido.</CardDescription>
              <div className="grid gap-2 pt-2 sm:grid-cols-[minmax(14rem,1fr)_12rem]">
                <div className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={eventSearch} onChange={(event) => setEventSearch(event.target.value)} placeholder="Buscar clínica, plano ou status" aria-label="Buscar eventos financeiros" /></div>
                <Select value={eventType} onValueChange={setEventType}><SelectTrigger aria-label="Filtrar eventos financeiros por tipo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os eventos</SelectItem>{Object.entries(eventLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {visibleEvents.map((event) => {
                const delta = Number(event.mrr_delta || 0);
                return <article key={event.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div><p className="font-medium">{event.clinica_nome || 'Clínica não vinculada'}</p><p className="text-xs text-muted-foreground">{eventLabels[event.event_type] || event.event_type} · {event.old_plan_slug || event.old_status || '—'} → {event.new_plan_slug || event.new_status || '—'} · {dateTime(event.occurred_at)}</p><p className="text-xs text-muted-foreground">{sourceLabels[event.source] || event.source}</p></div>
                  <div className="flex items-center gap-2">{delta !== 0 && (delta > 0 ? <ArrowUpRight className="h-4 w-4 text-success" /> : <ArrowDownRight className="h-4 w-4 text-destructive" />)}<Badge variant={delta < 0 ? 'destructive' : 'outline'}>{delta > 0 ? '+' : ''}{currency(delta)}</Badge></div>
                </article>;
              })}
              {!visibleEvents.length && <div className="flex flex-col items-center gap-2 py-6 text-center"><p className="text-sm text-muted-foreground">{events.length ? 'Nenhum evento corresponde à busca e ao tipo selecionado.' : 'Nenhum evento no período.'}</p>{events.length > 0 && (eventSearch.trim() || eventType !== 'all') && <Button variant="ghost" size="sm" onClick={() => { setEventSearch(''); setEventType('all'); }}>Limpar filtros</Button>}</div>}
              {events.length === 500 && <p role="status" className="text-xs text-muted-foreground">A lista atingiu o limite de 500 eventos; registros anteriores do período podem não aparecer.</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
