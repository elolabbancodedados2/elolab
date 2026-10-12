import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, LockKeyhole, RefreshCw, WalletCards, CalendarCheck, ClipboardCheck, FlaskConical, HandCoins } from 'lucide-react';
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
const metricStyles: Record<string, { icon: typeof Activity; card: string; iconBox: string; value: string }> = {
  tasks_completed: { icon: ClipboardCheck, card: 'border-[#d7e8fb] bg-gradient-to-br from-[#f5faff] to-white', iconBox: 'bg-[#e5f1ff] text-[#1766a8]', value: 'text-[#164f80]' },
  appointments_completed: { icon: CalendarCheck, card: 'border-[#d7efe9] bg-gradient-to-br from-[#f2fbf8] to-white', iconBox: 'bg-[#e1f5ee] text-[#168064]', value: 'text-[#126b56]' },
  collections_completed: { icon: FlaskConical, card: 'border-[#e7ddf7] bg-gradient-to-br from-[#faf7ff] to-white', iconBox: 'bg-[#efe7fb] text-[#7450a8]', value: 'text-[#60418d]' },
  payments_received: { icon: WalletCards, card: 'border-[#f5e5c8] bg-gradient-to-br from-[#fffaf1] to-white', iconBox: 'bg-[#fff0d6] text-[#a76a0b]', value: 'text-[#87530a]' },
  payments_value: { icon: HandCoins, card: 'border-[#d7efe9] bg-gradient-to-br from-[#f2fbf8] to-white', iconBox: 'bg-[#e1f5ee] text-[#168064]', value: 'text-[#126b56]' },
  appointments_registered: { icon: CalendarCheck, card: 'border-[#dce4fa] bg-gradient-to-br from-[#f5f7ff] to-white', iconBox: 'bg-[#e9edff] text-[#586fc1]', value: 'text-[#455ca8]' },
};

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
  return <main className="space-y-6 p-2 sm:p-6" aria-labelledby="productivity-title">
    <header className="flex flex-col justify-between gap-4 rounded-2xl border border-[#dce9f6] bg-gradient-to-r from-[#f3f8ff] via-white to-[#f3fbfa] p-5 sm:flex-row sm:items-end sm:p-6"><div>
      <h1 id="productivity-title" className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl"><Activity className="h-7 w-7 text-primary" aria-hidden="true" />Indicadores de produtividade</h1>
      <p className="mt-1 text-muted-foreground">Acompanhe volume e evolução do trabalho sem competição entre pessoas.</p>
    </div><div className="w-full space-y-1.5 sm:w-48"><label htmlFor="productivity-period" className="text-sm font-medium">Período</label>
      <Select value={String(period)} onValueChange={(value) => setPeriod(Number(value) as Period)}><SelectTrigger id="productivity-period"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7">Últimos 7 dias</SelectItem><SelectItem value="30">Últimos 30 dias</SelectItem><SelectItem value="90">Últimos 90 dias</SelectItem></SelectContent></Select>
    </div></header>
    <Card className="border-[#dce9f6] bg-[#f8fbff]"><CardContent className="flex gap-3 p-4 text-sm text-[#42566e]"><LockKeyhole className="h-5 w-5 shrink-0 text-[#4380b5]" aria-hidden="true" /><p>Colaboradores veem apenas seus próprios resultados. Administradores veem totais da clínica, sem nomes, ranking ou dados de pacientes.</p></CardContent></Card>
    {authLoading || metrics.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Carregando indicadores">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-44 rounded-xl" />)}</div>
      : metrics.isError ? <ErrorState error={metrics.error} onRetry={() => metrics.refetch()} />
      : !clinicaId ? <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center"><LockKeyhole className="h-9 w-9 text-muted-foreground" aria-hidden="true" /><div><p className="font-medium">Clínica não identificada</p><p className="text-sm text-muted-foreground">Entre novamente ou peça ao administrador para conferir seu vínculo com a clínica.</p></div></CardContent></Card>
      : metrics.data?.length ? <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Indicadores do período">{metrics.data.map((metric) => {
        const variation = change(metric); const TrendIcon = variation === null || variation === 0 ? ArrowRight : variation > 0 ? ArrowUpRight : ArrowDownRight;
        const style = metricStyles[metric.metric_key] ?? { icon: Activity, card: 'border-[#dce9f6] bg-white', iconBox: 'bg-[#eaf4ff] text-[#1766a8]', value: 'text-[#0c1f54]' };
        const MetricIcon = style.icon;
        return <Card key={metric.metric_key} className={`${style.card} shadow-sm shadow-[#133453]/[0.03]`}><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className={`rounded-xl p-2.5 ${style.iconBox}`}><MetricIcon className="h-5 w-5" aria-hidden="true" /></span><CardTitle className="text-base text-[#172d4e]">{metric.label}</CardTitle></div><Badge variant="secondary" className="bg-white/80 text-[#49617c]">{metric.scope}</Badge></div><CardDescription className="pt-2">Comparação com os {period} dias anteriores</CardDescription></CardHeader><CardContent className="space-y-3"><p className={`text-3xl font-bold tabular-nums ${style.value}`}>{formatted(metric, metric.current_value)}</p><div className="flex items-center gap-2 text-sm text-[#53667d]"><TrendIcon className="h-4 w-4" aria-hidden="true" /><span>{variation === null ? 'Sem base anterior para comparar' : `${variation > 0 ? '+' : ''}${number.format(variation)}% no período`}</span></div><p className="border-t border-[#e8eef5] pt-2 text-xs text-[#718096]">Período anterior: {formatted(metric, metric.previous_value)}</p></CardContent></Card>;
      })}</section>
      : <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center"><Activity className="h-9 w-9 text-muted-foreground" aria-hidden="true" /><div><p className="font-medium">Nenhum indicador disponível</p><p className="text-sm text-muted-foreground">Seu papel ainda não possui atividade mensurável neste período.</p></div><Button variant="outline" onClick={() => metrics.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button></CardContent></Card>}
  </main>;
}
