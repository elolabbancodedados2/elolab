import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, LockKeyhole, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorState } from '@/components/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

type Period = 7 | 30 | 90;
type Metric = { metric_key: string; label: string; current_value: number; previous_value: number; unit: string; scope: string };
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const formatted = (metric: Metric, value: number) => metric.unit === 'BRL' ? brl.format(value) : `${number.format(value)} ${metric.unit}`;
const change = (metric: Metric) => metric.previous_value === 0 ? (metric.current_value === 0 ? 0 : null) : ((metric.current_value - metric.previous_value) / Math.abs(metric.previous_value)) * 100;

export default function IndicadoresProdutividade() {
  const { user, clinicaId } = useSupabaseAuth();
  const [period, setPeriod] = useState<Period>(30);
  const metrics = useQuery({
    queryKey: ['indicadores-produtividade', user?.id, clinicaId, period], enabled: Boolean(user && clinicaId),
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('indicadores_produtividade', { p_days: period });
      if (error) throw error;
      return (data ?? []).map((item: Metric) => ({ ...item, current_value: Number(item.current_value), previous_value: Number(item.previous_value) })) as Metric[];
    },
  });
  return <main className="space-y-6 p-2 sm:p-6" aria-labelledby="productivity-title">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div>
      <h1 id="productivity-title" className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl"><Activity className="h-7 w-7 text-primary" aria-hidden="true" />Indicadores de produtividade</h1>
      <p className="mt-1 text-muted-foreground">Acompanhe volume e evolução do trabalho sem competição entre pessoas.</p>
    </div><div className="w-full space-y-1.5 sm:w-48"><label htmlFor="productivity-period" className="text-sm font-medium">Período</label>
      <Select value={String(period)} onValueChange={(value) => setPeriod(Number(value) as Period)}><SelectTrigger id="productivity-period"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7">Últimos 7 dias</SelectItem><SelectItem value="30">Últimos 30 dias</SelectItem><SelectItem value="90">Últimos 90 dias</SelectItem></SelectContent></Select>
    </div></header>
    <Card className="border-primary/15 bg-primary/[0.03]"><CardContent className="flex gap-3 p-4 text-sm"><LockKeyhole className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><p>Colaboradores veem apenas seus próprios resultados. Administradores veem totais da clínica, sem nomes, ranking ou dados de pacientes.</p></CardContent></Card>
    {metrics.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Carregando indicadores">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-44 rounded-xl" />)}</div>
      : metrics.isError ? <ErrorState error={metrics.error} onRetry={() => metrics.refetch()} />
      : metrics.data?.length ? <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Indicadores do período">{metrics.data.map((metric) => {
        const variation = change(metric); const TrendIcon = variation === null || variation === 0 ? ArrowRight : variation > 0 ? ArrowUpRight : ArrowDownRight;
        return <Card key={metric.metric_key}><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><CardTitle className="text-base">{metric.label}</CardTitle><Badge variant="secondary">{metric.scope}</Badge></div><CardDescription>Comparação com os {period} dias anteriores</CardDescription></CardHeader><CardContent className="space-y-3"><p className="text-3xl font-bold tabular-nums">{formatted(metric, metric.current_value)}</p><div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendIcon className="h-4 w-4" aria-hidden="true" /><span>{variation === null ? 'Sem base anterior para comparar' : `${variation > 0 ? '+' : ''}${number.format(variation)}% no período`}</span></div><p className="text-xs text-muted-foreground">Período anterior: {formatted(metric, metric.previous_value)}</p></CardContent></Card>;
      })}</section>
      : <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center"><Activity className="h-9 w-9 text-muted-foreground" aria-hidden="true" /><div><p className="font-medium">Nenhum indicador disponível</p><p className="text-sm text-muted-foreground">Seu papel ainda não possui atividade mensurável neste período.</p></div><Button variant="outline" onClick={() => metrics.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button></CardContent></Card>}
  </main>;
}
