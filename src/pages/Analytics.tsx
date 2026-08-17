import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
} from 'recharts';
import {
  TrendingUp, Users, Calendar as CalendarIcon, DollarSign, Activity, Stethoscope,
  ArrowUp, ArrowDown, Filter, Download,
  Star,
} from 'lucide-react';
import { format, subDays, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { valorRealizado } from '@/lib/lancamentos';
import { DashboardSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--info))', 'hsl(var(--destructive))'];

const PERIOD_PRESETS = [
  { label: 'Últimos 7 dias', value: '7d', days: 7 },
  { label: 'Últimos 30 dias', value: '30d', days: 30 },
  { label: 'Últimos 90 dias', value: '90d', days: 90 },
  { label: 'Mês atual', value: 'month', days: 0 },
  { label: 'Mês anterior', value: 'prev_month', days: 0 },
  { label: 'Personalizado', value: 'custom', days: 0 },
];

function getDateRange(preset: string, customFrom?: Date, customTo?: Date): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case '7d': return { from: subDays(now, 7), to: now };
    case '30d': return { from: subDays(now, 30), to: now };
    case '90d': return { from: subDays(now, 90), to: now };
    case 'month': return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'prev_month': {
      const prev = subMonths(now, 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case 'custom': return { from: customFrom || subDays(now, 30), to: customTo || now };
    default: return { from: subDays(now, 30), to: now };
  }
}

interface KPICardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  description?: string;
}

function KPICard({ title, value, change, icon, description }: KPICardProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{title}</p>
              <p className="text-3xl font-bold mt-1 tabular-nums">{value}</p>
              {change !== undefined && (
                <div className={cn('flex items-center gap-1 text-sm mt-1', change >= 0 ? 'text-success' : 'text-destructive')}>
                  {change >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  {Math.abs(change)}% vs período anterior
                </div>
              )}
              {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
            </div>
            <div className="p-3 bg-primary/10 rounded-full">{icon}</div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function Analytics() {
  const [periodPreset, setPeriodPreset] = useState('30d');
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [showComparison, setShowComparison] = useState(false);

  const range = useMemo(() => getDateRange(periodPreset, customFrom, customTo), [periodPreset, customFrom, customTo]);
  const rangeDays = differenceInDays(range.to, range.from) || 1;
  const prevRange = useMemo(() => ({
    from: subDays(range.from, rangeDays),
    to: subDays(range.to, rangeDays),
  }), [range, rangeDays]);

  // ─── Data queries ───────────────────────────────────────
  const { data: agendamentos = [], isLoading: loadingAg, error: errorAg, refetch: refetchAg } = useQuery({
    queryKey: ['analytics-ag', range.from.toISOString(), range.to.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.from('agendamentos')
        .select('*, medicos(nome, especialidade)')
        .gte('data', format(range.from, 'yyyy-MM-dd'))
        .lte('data', format(range.to, 'yyyy-MM-dd'));
      if (error) throw error;
      return data || [];
    },
  });

  const { data: prevAgendamentos = [] } = useQuery({
    queryKey: ['analytics-ag-prev', prevRange.from.toISOString(), prevRange.to.toISOString()],
    enabled: showComparison,
    queryFn: async () => {
      const { data } = await supabase.from('agendamentos')
        .select('*')
        .gte('data', format(prevRange.from, 'yyyy-MM-dd'))
        .lte('data', format(prevRange.to, 'yyyy-MM-dd'));
      return data || [];
    },
  });

  const { data: lancamentos = [], isLoading: loadingLanc, error: errorLanc, refetch: refetchLanc } = useQuery({
    queryKey: ['analytics-lanc', range.from.toISOString(), range.to.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.from('lancamentos')
        .select('*')
        .gte('data', format(range.from, 'yyyy-MM-dd'))
        .lte('data', format(range.to, 'yyyy-MM-dd'));
      if (error) throw error;
      return data || [];
    },
  });

  const { data: prevLancamentos = [] } = useQuery({
    queryKey: ['analytics-lanc-prev', prevRange.from.toISOString(), prevRange.to.toISOString()],
    enabled: showComparison,
    queryFn: async () => {
      const { data } = await supabase.from('lancamentos')
        .select('*')
        .gte('data', format(prevRange.from, 'yyyy-MM-dd'))
        .lte('data', format(prevRange.to, 'yyyy-MM-dd'));
      return data || [];
    },
  });

  const { data: triagens = [] } = useQuery({
    queryKey: ['analytics-tri', range.from.toISOString(), range.to.toISOString()],
    queryFn: async () => {
      const { data } = await supabase.from('triagens')
        .select('*')
        .gte('created_at', range.from.toISOString())
        .lte('created_at', range.to.toISOString());
      return data || [];
    },
  });

  const { data: feedbacks = [] } = useQuery({
    queryKey: ['analytics-feedback', range.from.toISOString(), range.to.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.from('feedbacks_nps')
        .select('id, nota, comentario, created_at, pacientes(nome), medicos(nome)')
        .gte('created_at', range.from.toISOString()).lte('created_at', range.to.toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const mediaSatisfacao = feedbacks.length
    ? feedbacks.reduce((total: number, item: any) => total + item.nota, 0) / feedbacks.length : 0;

  // ─── KPI calculations ──────────────────────────────────
  const totalAg = agendamentos.length;
  const finalizados = agendamentos.filter(a => a.status === 'finalizado').length;
  const cancelados = agendamentos.filter(a => a.status === 'cancelado').length;
  const taxaComparecimento = totalAg > 0 ? Math.round((finalizados / totalAg) * 100) : 0;
  const taxaCancelamento = totalAg > 0 ? Math.round((cancelados / totalAg) * 100) : 0;

  const prevTotalAg = prevAgendamentos.length;
  const prevFinalizados = prevAgendamentos.filter((a: any) => a.status === 'finalizado').length;
  const prevTaxaComp = prevTotalAg > 0 ? Math.round((prevFinalizados / prevTotalAg) * 100) : 0;

  const receitaTotal = lancamentos.filter(l => l.tipo === 'receita' && l.status === 'pago').reduce((acc, l) => acc + valorRealizado(l), 0);
  const despesaTotal = lancamentos.filter(l => l.tipo === 'despesa' && l.status === 'pago').reduce((acc, l) => acc + valorRealizado(l), 0);
  const lucroLiquido = receitaTotal - despesaTotal;
  const margemLucro = receitaTotal > 0 ? Math.round((lucroLiquido / receitaTotal) * 100) : 0;
  const ticketMedio = finalizados > 0 ? receitaTotal / finalizados : 0;

  const prevReceita = prevLancamentos.filter((l: any) => l.tipo === 'receita' && l.status === 'pago').reduce((acc: number, l: any) => acc + valorRealizado(l), 0);
  const prevDespesa = prevLancamentos.filter((l: any) => l.tipo === 'despesa' && l.status === 'pago').reduce((acc: number, l: any) => acc + valorRealizado(l), 0);

  const calcChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  // ─── Productivity per doctor ────────────────────────────
  const produtividade = useMemo(() => {
    const map: Record<string, { nome: string; especialidade: string; total: number; finalizados: number }> = {};
    agendamentos.forEach((a: any) => {
      const medicoNome = a.medicos?.nome || 'Desconhecido';
      const esp = a.medicos?.especialidade || 'Geral';
      if (!map[a.medico_id]) map[a.medico_id] = { nome: medicoNome, especialidade: esp, total: 0, finalizados: 0 };
      map[a.medico_id].total++;
      if (a.status === 'finalizado') map[a.medico_id].finalizados++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [agendamentos]);

  // ─── Chart data ─────────────────────────────────────────
  const days = eachDayOfInterval({ start: range.from, end: range.to });
  const chartInterval = days.length > 60 ? 'week' : 'day';

  const agPorDia = useMemo(() => {
    const slice = chartInterval === 'week' ? days.filter((_, i) => i % 7 === 0) : days.slice(-14);
    return slice.map(d => {
      const ds = format(d, 'yyyy-MM-dd');
      return {
        dia: format(d, chartInterval === 'week' ? 'dd/MM' : 'EEE dd', { locale: ptBR }),
        agendamentos: agendamentos.filter(a => a.data === ds).length,
        ...(showComparison ? {
          anterior: prevAgendamentos.filter((a: any) => {
            const pd = format(subDays(d, rangeDays), 'yyyy-MM-dd');
            return a.data === pd;
          }).length,
        } : {}),
      };
    });
  }, [agendamentos, prevAgendamentos, days, showComparison, rangeDays, chartInterval]);

  const statusAgendamentos = [
    { name: 'Finalizados', value: agendamentos.filter(a => a.status === 'finalizado').length },
    { name: 'Confirmados', value: agendamentos.filter(a => a.status === 'confirmado').length },
    { name: 'Aguardando', value: agendamentos.filter(a => a.status === 'aguardando').length },
    { name: 'Cancelados', value: agendamentos.filter(a => a.status === 'cancelado').length },
    { name: 'Faltou', value: agendamentos.filter(a => a.status === 'faltou').length },
  ].filter(s => s.value > 0);

  const classificacaoRisco = [
    { name: 'Verde', value: triagens.filter(t => t.classificacao_risco === 'verde').length, color: '#22c55e' },
    { name: 'Amarelo', value: triagens.filter(t => t.classificacao_risco === 'amarelo').length, color: '#eab308' },
    { name: 'Laranja', value: triagens.filter(t => t.classificacao_risco === 'laranja').length, color: '#f97316' },
    { name: 'Vermelho', value: triagens.filter(t => t.classificacao_risco === 'vermelho').length, color: '#ef4444' },
  ].filter(c => c.value > 0);

  const fluxoCaixa = useMemo(() => {
    const slice = chartInterval === 'week' ? days.filter((_, i) => i % 7 === 0) : days.slice(-14);
    return slice.map(d => {
      const ds = format(d, 'yyyy-MM-dd');
      const receitas = lancamentos.filter(l => l.data === ds && l.tipo === 'receita' && l.status === 'pago').reduce((acc, l) => acc + valorRealizado(l), 0);
      const despesas = lancamentos.filter(l => l.data === ds && l.tipo === 'despesa' && l.status === 'pago').reduce((acc, l) => acc + valorRealizado(l), 0);
      return { dia: format(d, 'dd/MM'), receitas, despesas, saldo: receitas - despesas };
    });
  }, [lancamentos, days, chartInterval]);

  const isLoadingDados = loadingAg || loadingLanc;
  const erroDados = errorAg || errorLanc;

  if (isLoadingDados) {
    return (
      <div className="pb-8">
        <DashboardSkeleton />
      </div>
    );
  }

  if (erroDados) {
    return (
      <div className="pb-8">
        <ErrorState
          title="Não foi possível carregar os indicadores"
          error={erroDados}
          onRetry={() => {
            refetchAg();
            refetchLanc();
          }}
        />
      </div>
    );
  }

  const semDados = agendamentos.length === 0 && lancamentos.length === 0;

  if (semDados) {
    return (
      <div className="pb-8">
        <EmptyState
          icon={Activity}
          title="Ainda não há dados neste período"
          description="Assim que houver agendamentos ou lançamentos financeiros no intervalo selecionado, os indicadores aparecerão aqui. Experimente ampliar o período."
          action={{ label: 'Ver últimos 90 dias', onClick: () => setPeriodPreset('90d') }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header + Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" /> Dashboard Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Métricas e indicadores de desempenho da clínica</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={periodPreset} onValueChange={setPeriodPreset}>
            <SelectTrigger className="w-[180px] h-9">
              <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_PRESETS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>

          {periodPreset === 'custom' && (
            <div className="flex items-center gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 text-xs gap-1">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {customFrom ? format(customFrom, 'dd/MM/yy') : 'De'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground text-xs">→</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 text-xs gap-1">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {customTo ? format(customTo, 'dd/MM/yy') : 'Até'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customTo} onSelect={setCustomTo} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <Button
            variant={showComparison ? 'default' : 'outline'}
            size="sm" className="h-9 text-xs gap-1"
            onClick={() => setShowComparison(!showComparison)}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Comparar
          </Button>
        </div>
      </div>

      {/* Period indicator */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs">
          {format(range.from, 'dd/MM/yyyy')} — {format(range.to, 'dd/MM/yyyy')}
        </Badge>
        {showComparison && (
          <Badge variant="secondary" className="text-xs">
            vs {format(prevRange.from, 'dd/MM')} — {format(prevRange.to, 'dd/MM')}
          </Badge>
        )}
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Taxa de Comparecimento"
          value={`${taxaComparecimento}%`}
          change={showComparison ? calcChange(taxaComparecimento, prevTaxaComp) : undefined}
          icon={<Users className="h-6 w-6 text-primary" />}
          description={`${finalizados} de ${totalAg} consultas`}
        />
        <KPICard
          title="Receita do Período"
          value={receitaTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          change={showComparison ? calcChange(receitaTotal, prevReceita) : undefined}
          icon={<DollarSign className="h-6 w-6 text-primary" />}
          description={`Margem: ${margemLucro}%`}
        />
        <KPICard
          title="Ticket Médio"
          value={ticketMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          change={showComparison ? calcChange(ticketMedio, prevReceita / (prevFinalizados || 1)) : undefined}
          icon={<TrendingUp className="h-6 w-6 text-primary" />}
          description={`Lucro: ${lucroLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
        />
        <KPICard
          title="Total Agendamentos"
          value={totalAg}
          change={showComparison ? calcChange(totalAg, prevTotalAg) : undefined}
          icon={<CalendarIcon className="h-6 w-6 text-primary" />}
          description={`${cancelados} cancelados (${taxaCancelamento}%)`}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">Despesas</p>
          <p className="text-xl font-bold tabular-nums text-destructive">{despesaTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          {showComparison && <p className={cn('text-[10px]', calcChange(despesaTotal, prevDespesa) <= 0 ? 'text-success' : 'text-destructive')}>
            {calcChange(despesaTotal, prevDespesa) <= 0 ? '↓' : '↑'} {Math.abs(calcChange(despesaTotal, prevDespesa))}% vs anterior
          </p>}
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">Triagens</p>
          <p className="text-xl font-bold tabular-nums">{triagens.length}</p>
          <p className="text-[10px] text-muted-foreground">No período selecionado</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">Margem de Lucro</p>
          <p className={cn('text-xl font-bold tabular-nums', margemLucro >= 0 ? 'text-success' : 'text-destructive')}>{margemLucro}%</p>
          <p className="text-[10px] text-muted-foreground">Receita - Despesa / Receita</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">Média Diária Atendimentos</p>
          <p className="text-xl font-bold tabular-nums">{(totalAg / (rangeDays || 1)).toFixed(1)}</p>
          <p className="text-[10px] text-muted-foreground">consultas/dia</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="atendimento" className="space-y-4">
        <TabsList>
          <TabsTrigger value="atendimento">Atendimento</TabsTrigger>
          <TabsTrigger value="produtividade">Produtividade</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="triagem">Triagem</TabsTrigger>
          <TabsTrigger value="satisfacao">Satisfação</TabsTrigger>
        </TabsList>

        <TabsContent value="atendimento" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Agendamentos por Dia</CardTitle>
                <CardDescription>{showComparison ? 'Atual vs Período Anterior' : `Últimos ${Math.min(14, rangeDays)} dias`}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={agPorDia}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="dia" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} />
                    <Bar dataKey="agendamentos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Atual" />
                    {showComparison && (
                      <Bar dataKey="anterior" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} opacity={0.4} name="Anterior" />
                    )}
                    {showComparison && <Legend />}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Status dos Agendamentos</CardTitle>
                <CardDescription>Distribuição por status</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={statusAgendamentos} cx="50%" cy="50%" labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100} dataKey="value">
                      {statusAgendamentos.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Produtividade Tab ─── */}
        <TabsContent value="produtividade" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Produtividade por Médico</CardTitle>
              <CardDescription>Atendimentos no período selecionado</CardDescription>
            </CardHeader>
            <CardContent>
              {produtividade.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum dado disponível</p>
              ) : (
                <div className="space-y-3">
                  {produtividade.map((med, i) => {
                    const taxa = med.total > 0 ? Math.round((med.finalizados / med.total) * 100) : 0;
                    return (
                      <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                        className="flex items-center gap-4 p-3 rounded-xl border bg-card hover:shadow-sm transition-shadow"
                      >
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                          {i + 1}º
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">Dr(a). {med.nome}</p>
                          <p className="text-xs text-muted-foreground">{med.especialidade}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-lg tabular-nums">{med.total}</p>
                          <p className="text-[10px] text-muted-foreground">consultas</p>
                        </div>
                        <div className="w-20 shrink-0">
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${taxa}%` }}
                              transition={{ duration: 0.8, delay: i * 0.05 }}
                              className="h-full bg-primary rounded-full"
                            />
                          </div>
                          <p className="text-[10px] text-center text-muted-foreground mt-0.5">{taxa}% finaliz.</p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financeiro" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: 'Receita Total', value: receitaTotal, color: 'text-success' },
              { label: 'Despesa Total', value: despesaTotal, color: 'text-destructive' },
              { label: 'Saldo', value: receitaTotal - despesaTotal, color: receitaTotal - despesaTotal >= 0 ? 'text-success' : 'text-destructive' },
            ].map(item => (
              <Card key={item.label}>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">{item.label}</p>
                    <p className={cn('text-3xl font-bold tabular-nums', item.color)}>
                      {item.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Fluxo de Caixa</CardTitle>
              <CardDescription>Receitas vs Despesas</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={fluxoCaixa}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="dia" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                    formatter={(value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
                  <Area type="monotone" dataKey="receitas" stroke="hsl(var(--success))" fill="hsl(var(--success))" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="despesas" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.6} />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="triagem" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Classificação de Risco</CardTitle>
                <CardDescription>Protocolo Manchester</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={classificacaoRisco} cx="50%" cy="50%" labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={100} dataKey="value">
                      {classificacaoRisco.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resumo de Triagens</CardTitle>
                <CardDescription>Estatísticas do período</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: 'Total de Triagens', value: triagens.length, bg: 'bg-muted', color: '' },
                  { label: 'Risco Baixo (Verde)', value: triagens.filter(t => t.classificacao_risco === 'verde').length, bg: 'bg-success/10', color: 'text-success' },
                  { label: 'Risco Médio (Amarelo)', value: triagens.filter(t => t.classificacao_risco === 'amarelo').length, bg: 'bg-warning/10', color: 'text-warning' },
                  { label: 'Risco Alto', value: triagens.filter(t => ['laranja', 'vermelho'].includes(t.classificacao_risco || '')).length, bg: 'bg-destructive/10', color: 'text-destructive' },
                ].map(item => (
                  <div key={item.label} className={cn('flex justify-between items-center p-3 rounded-lg', item.bg)}>
                    <span>{item.label}</span>
                    <span className={cn('font-bold', item.color)}>{item.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="satisfacao" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Média</p><p className="text-3xl font-bold">{mediaSatisfacao.toFixed(1)}/5</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Respostas</p><p className="text-3xl font-bold">{feedbacks.length}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Alertas (1–2)</p><p className="text-3xl font-bold text-destructive">{feedbacks.filter((f: any) => f.nota <= 2).length}</p></CardContent></Card>
          </div>
          <Card><CardHeader><CardTitle>Avaliações recentes</CardTitle><CardDescription>Notas e comentários do período</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {feedbacks.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma avaliação no período.</p> : feedbacks.slice(0, 20).map((f: any) => (
                <div key={f.id} className={cn('rounded-lg border p-3', f.nota <= 2 && 'border-destructive/50 bg-destructive/5')}>
                  <div className="flex items-center justify-between"><span className="font-medium">{f.pacientes?.nome || 'Paciente'}</span><Badge variant={f.nota <= 2 ? 'destructive' : 'secondary'}><Star className="mr-1 h-3 w-3" />{f.nota}/5</Badge></div>
                  {f.comentario && <p className="mt-2 text-sm text-muted-foreground">{f.comentario}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
