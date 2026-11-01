import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, LockKeyhole, RefreshCw, WalletCards, CalendarCheck, ClipboardCheck, FlaskConical, HandCoins } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorState } from '@/components/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';

type Period = 7 | 30 | 90;
type Metric = { metric_key: string; label: string; current_value: number; previous_value: number; unit: string; scope: string };
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const formatted = (metric: Metric, value: number) => metric.unit === 'BRL' ? brl.format(value) : `${number.format(value)} ${metric.unit}`;
const change = (metric: Metric) => metric.previous_value === 0 ? (metric.current_value === 0 ? 0 : null) : ((metric.current_value - metric.previous_value) / Math.abs(metric.previous_value)) * 100;
const metricStyles: Record<string, { icon: typeof Activity }> = {
  tasks_completed: { icon: ClipboardCheck },
  appointments_completed: { icon: CalendarCheck },
  collections_completed: { icon: FlaskConical },
  payments_received: { icon: WalletCards },
  payments_value: { icon: HandCoins },
  appointments_registered: { icon: CalendarCheck },
};
const PERIOD_PILLS: { value: Period; label: string }[] = [
  { value: 7, label: 'Últimos 7 dias' },
  { value: 30, label: 'Últimos 30 dias' },
  { value: 90, label: 'Últimos 90 dias' },
];

export default function IndicadoresProdutividade() {
  const { user, clinicaId, isLoading: authLoading } = useSupabaseAuth();
  const [period, setPeriod] = useState<Period>(30);
  const metrics = useQuery({
    queryKey: ['indicadores-produtividade', user?.id, clinicaId, period], enabled: Boolean(user && clinicaId),
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('indicadores_produtividade', { p_days: period });
      if (error) throw error;
      return (data ?? []).map((item: Metric) => ({ ...item, current_value: Number(item.current_value), previous_value: Number(item.previous_value) })) as Metric[];
    },
  });
  return <main className="space-y-6 p-2 sm:p-6" aria-label="Indicadores de produtividade">
    <PageHeader
      title="Indicadores de produtividade"
      icon={<Activity />}
      description="Acompanhe volume e evolução do trabalho sem competição entre pessoas."
      actions={
        <>
          <Button aria-label="Atualizar indicadores de produtividade" variant="outline" size="icon" className="rounded-full" onClick={() => metrics.refetch()} disabled={metrics.isFetching}>
            <RefreshCw className={cn('h-4 w-4', metrics.isFetching && 'animate-spin')} />
          </Button>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
            {PERIOD_PILLS.map(pill => (
              <button
                key={pill.value}
                type="button"
                aria-pressed={period === pill.value}
                onClick={() => setPeriod(pill.value)}
                className={cn(
                  'h-8 rounded-full border px-3 text-xs font-medium transition-colors',
                  period === pill.value
                    ? 'border-transparent bg-gradient-primary text-white shadow-sm'
                    : 'border-border/60 bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground',
                )}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </>
      }
    />
    <Card className="rounded-2xl border-border/60 bg-muted/40 shadow-xs"><CardContent className="flex gap-3 p-4 text-sm text-foreground"><LockKeyhole className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><p>Colaboradores veem apenas seus próprios resultados. Administradores veem totais da clínica, sem nomes, ranking ou dados de pacientes.</p></CardContent></Card>
    {authLoading || metrics.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Carregando indicadores">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-44 rounded-2xl" />)}</div>
      : metrics.isError ? <ErrorState error={metrics.error} onRetry={() => metrics.refetch()} />
      : !clinicaId ? <Card className="rounded-2xl border-border/60 shadow-xs"><CardContent className="flex flex-col items-center gap-3 py-12 text-center"><LockKeyhole className="h-9 w-9 text-muted-foreground" aria-hidden="true" /><div><p className="font-medium">Clínica não identificada</p><p className="text-sm text-muted-foreground">Entre novamente ou peça ao administrador para conferir seu vínculo com a clínica.</p></div></CardContent></Card>
      : metrics.data?.length ? <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Indicadores do período">{metrics.data.map((metric) => {
        const variation = change(metric); const TrendIcon = variation === null || variation === 0 ? ArrowRight : variation > 0 ? ArrowUpRight : ArrowDownRight;
        const style = metricStyles[metric.metric_key] ?? { icon: Activity };
        const MetricIcon = style.icon;
        return <Card key={metric.metric_key} className="border-border bg-card shadow-xs"><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="rounded-xl bg-primary/10 p-2.5 text-primary"><MetricIcon className="h-5 w-5" aria-hidden="true" /></span><CardTitle className="text-base text-foreground">{metric.label}</CardTitle></div><Badge variant="secondary" className="rounded-full">{metric.scope}</Badge></div><CardDescription className="pt-2">Comparação com os {period} dias anteriores</CardDescription></CardHeader><CardContent className="space-y-3"><p className="text-3xl font-bold tabular-nums text-foreground">{formatted(metric, metric.current_value)}</p><div className={cn('flex items-center gap-2 text-sm', variation === null ? 'text-muted-foreground' : variation > 0 ? 'text-success' : variation < 0 ? 'text-destructive' : 'text-muted-foreground')}><TrendIcon className="h-4 w-4" aria-hidden="true" /><span>{variation === null ? 'Sem base anterior para comparar' : `${variation > 0 ? '+' : ''}${number.format(variation)}% no período`}</span></div><p className="border-t border-border/60 pt-2 text-xs text-muted-foreground">Período anterior: {formatted(metric, metric.previous_value)}</p></CardContent></Card>;
      })}</section>
      : <Card className="rounded-2xl border-border/60 shadow-xs"><CardContent className="flex flex-col items-center gap-3 py-12 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground"><Activity className="h-7 w-7" aria-hidden="true" /></span><div><p className="font-medium">Nenhum indicador disponível</p><p className="text-sm text-muted-foreground">Seu papel ainda não possui atividade mensurável neste período.</p></div><Button variant="outline" className="rounded-full" onClick={() => metrics.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button></CardContent></Card>}
  </main>;
}
