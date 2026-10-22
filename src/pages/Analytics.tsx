import { formatWithDatePreference as format } from '@/lib/datePreference';
import { nomeMedico } from '@/lib/formatters';
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
  TrendingUp, Users, Calendar as CalendarIcon, DollarSign, Activity,
  ArrowUp, ArrowDown, Filter, RefreshCw,
  Star, FileBarChart,
} from 'lucide-react';
import { addDays, subDays, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { valorRealizado } from '@/lib/lancamentos';
import { DashboardSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { dateOnlyInTimeZone, inicioDoDiaEmFusoIso, parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { calculateAttendanceRate } from '@/lib/analyticsKpis';
import { AccessibleChartTable } from '@/components/analytics/AccessibleChartTable';

const COLORS = ['#1080CA', '#2ED5E7', '#0B4F7D', 'hsl(var(--warning))', 'hsl(var(--destructive))', 'hsl(var(--success))'];
const GRID_COLOR = '#DCE6F2';
const STATUS_FINALIZADO = new Set(['finalizado', 'atendimento_finalizado']);

function diaFinanceiro(value?: string | null): string | null {
  if (!value) return null;
  return value.includes('T') || value.includes(' ')
    ? dateOnlyInTimeZone(new Date(value), 'America/Sao_Paulo')
    : value.slice(0, 10);
}

function eventosFinanceirosDoPeriodo(lancamentos: any[], pagamentos: any[], inicio: Date, fim: Date) {
  const inicioDia = format(inicio, 'yyyy-MM-dd');
  const fimDia = format(fim, 'yyyy-MM-dd');
  const lancamentosComPagamentos = new Set<string>(pagamentos.map(p => p.lancamento_id));
  const legados = lancamentos
    .filter(l => ['pago', 'parcial'].includes(l.status) && !lancamentosComPagamentos.has(l.id))
    .flatMap(l => {
      const data = diaFinanceiro(l.data_pagamento || l.data);
      return data && data >= inicioDia && data <= fimDia
        ? [{ id: l.id, lancamentoId: l.id, agendamentoId: l.agendamento_id, tipo: l.tipo, data, valor: valorRealizado(l), formaPagamento: l.forma_pagamento || null, estorno: false }]
        : [];
    });
  const individuais = pagamentos.flatMap(p => {
    const conta = Array.isArray(p.lancamentos) ? p.lancamentos[0] : p.lancamentos;
    if (!conta || !['receita', 'despesa'].includes(conta.tipo) || !p.data_pagamento) return [];
    const eventos: any[] = [];
    const dataPagamento = diaFinanceiro(p.data_pagamento);
    if (dataPagamento && dataPagamento >= inicioDia && dataPagamento <= fimDia) eventos.push({
      id: p.id, lancamentoId: p.lancamento_id, agendamentoId: conta.agendamento_id,
      tipo: conta.tipo, data: dataPagamento, valor: Number(p.valor),
      formaPagamento: p.forma_pagamento || null, estorno: false,
    });
    if (p.estornado_em) {
      const dataEstorno = diaFinanceiro(p.estornado_em);
      if (dataEstorno && dataEstorno >= inicioDia && dataEstorno <= fimDia) eventos.push({
        id: `${p.id}:estorno`, lancamentoId: p.lancamento_id, agendamentoId: conta.agendamento_id,
        tipo: conta.tipo, data: dataEstorno, valor: -Number(p.valor),
        formaPagamento: p.forma_pagamento || null, estorno: true,
      });
    }
    return eventos;
  });
  return [...legados, ...individuais];
}

const PERIOD_PRESETS = [
  { label: 'Últimos 7 dias', value: '7d', days: 7 },
  { label: 'Últimos 30 dias', value: '30d', days: 30 },
  { label: 'Últimos 90 dias', value: '90d', days: 90 },
  { label: 'Mês atual', value: 'month', days: 0 },
  { label: 'Mês anterior', value: 'prev_month', days: 0 },
  { label: 'Personalizado', value: 'custom', days: 0 },
];

function limitesTimestampSaoPaulo(inicio: Date, fim: Date) {
  const primeiroDia = format(inicio, 'yyyy-MM-dd');
  const diaSeguinteAoFim = format(addDays(fim, 1), 'yyyy-MM-dd');
  return {
    inicio: inicioDoDiaEmFusoIso(primeiroDia, 'America/Sao_Paulo'),
    fimExclusivo: inicioDoDiaEmFusoIso(diaSeguinteAoFim, 'America/Sao_Paulo'),
  };
}

function getDateRange(preset: string, customFrom?: Date, customTo?: Date): { from: Date; to: Date } {
  const now = parseDateOnly(todaySaoPauloDateOnly())!;
  switch (preset) {
    case '7d': return { from: subDays(now, 6), to: now };
    case '30d': return { from: subDays(now, 29), to: now };
    case '90d': return { from: subDays(now, 89), to: now };
    case 'month': return { from: startOfMonth(now), to: now };
    case 'prev_month': {
      const prev = subMonths(now, 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case 'custom': {
      const from = customFrom || subDays(now, 29);
      const to = customTo || now;
      return from <= to ? { from, to } : { from: to, to: from };
    }
    default: return { from: subDays(now, 30), to: now };
  }
}

interface KPICardProps {
  title: string;
  value: string | number;
  change?: number | null;
  icon: React.ReactNode;
  description?: string;
  definition: string;
  source: string;
  period: string;
  tone: 'primary' | 'success' | 'accent' | 'warning' | 'dark';
  onClick?: () => void;
  pressed?: boolean;
}

function KPIDefinition({ title, definition, source, period }: Pick<KPICardProps, 'title' | 'definition' | 'source' | 'period'>) {
  return (
    <details className="mt-2 text-xs" data-testid="analytics-kpi-definition" onClick={(event) => event.stopPropagation()}>
      <summary className="w-fit cursor-pointer rounded-sm font-medium text-[#1080CA] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Critério e fonte
      </summary>
      <div className="mt-2 space-y-1 rounded-md border border-border/60 bg-card p-2 text-muted-foreground">
        <p><strong className="text-foreground">{title}:</strong> {definition}</p>
        <p><strong className="text-foreground">Fonte:</strong> {source}</p>
        <p><strong className="text-foreground">Período:</strong> {period}</p>
      </div>
    </details>
  );
}

const KPI_TONES = {
  primary: 'border-[#1080CA]/20 from-[#1080CA]/5 to-card',
  success: 'border-success/20 from-success/5 to-card',
  accent: 'border-border/60 from-accent to-card',
  warning: 'border-warning/20 from-warning/5 to-card',
  dark: 'border-transparent bg-gradient-primary text-white',
} as const;

const KPI_ICON_TONES = {
  primary: 'bg-[#1080CA]/10 text-[#1080CA] ring-[#1080CA]/20',
  success: 'bg-success/10 text-success ring-success/20',
  accent: 'bg-accent text-accent-foreground ring-border',
  warning: 'bg-warning/10 text-warning-foreground ring-warning/20',
  dark: 'bg-white/20 text-white ring-white/20',
} as const;

function KPICard({ title, value, change, icon, description, definition, source, period, tone, onClick, pressed }: KPICardProps) {
  const dark = tone === 'dark';
  return (
    <div data-testid="analytics-kpi" className="h-full">
      <Card
        className={cn(
          'h-full border bg-gradient-to-br shadow-xs transition-all',
          KPI_TONES[tone],
          onClick && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md',
        )}
        {...(onClick ? {
          role: 'button' as const,
          tabIndex: 0,
          'aria-pressed': pressed,
          onClick,
          onKeyDown: (event: React.KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onClick();
            }
          },
        } : {})}
      >
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className={cn('text-sm', dark ? 'text-white/70' : 'text-muted-foreground')}>{title}</p>
              <p className={cn('text-3xl font-bold mt-1 tabular-nums', dark && 'text-white')}>{value}</p>
              {change !== undefined && (
                <div className={cn('flex items-center gap-1 text-sm mt-1', change === null ? (dark ? 'text-white/60' : 'text-muted-foreground') : change >= 0 ? 'text-success' : 'text-destructive')}>
                  {change === null ? 'Sem base anterior para comparar' : <>
                    {change > 0 ? <ArrowUp className="h-3 w-3" /> : change < 0 ? <ArrowDown className="h-3 w-3" /> : <Activity className="h-3 w-3" />}
                    {Math.abs(change)}% vs período anterior
                  </>}
                </div>
              )}
              {description && <p className={cn('text-xs mt-1', dark ? 'text-white/70' : 'text-muted-foreground')}>{description}</p>}
              <KPIDefinition title={title} definition={definition} source={source} period={period} />
            </div>
            <div className={cn('rounded-2xl p-3 ring-1', KPI_ICON_TONES[tone])}>{icon}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Analytics() {
  const { user, profile, isLoading: authLoading } = useSupabaseAuth();
  const scopeKey = [user?.id ?? null, profile?.clinica_id ?? null] as const;
  const [periodPreset, setPeriodPreset] = useState('30d');
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [showComparison, setShowComparison] = useState(false);
  const [activeTab, setActiveTab] = useState('atendimento');

  const range = useMemo(() => getDateRange(periodPreset, customFrom, customTo), [periodPreset, customFrom, customTo]);
  const timestampRange = useMemo(() => limitesTimestampSaoPaulo(range.from, range.to), [range]);
  const rangeDays = differenceInDays(range.to, range.from) + 1;
  const kpiPeriod = `${format(range.from, 'dd/MM/yyyy')} a ${format(range.to, 'dd/MM/yyyy')} (horário de São Paulo)`;
  const selectedPeriodFilter = ['Janela selecionada'];
  const appointmentChartFilters = [showComparison ? 'Comparação com o intervalo anterior ligada' : 'Comparação com o intervalo anterior desligada'];
  const prevRange = useMemo(() => ({
    from: subDays(range.from, rangeDays),
    to: subDays(range.to, rangeDays),
  }), [range, rangeDays]);
  const previousTimestampRange = useMemo(() => limitesTimestampSaoPaulo(prevRange.from, prevRange.to), [prevRange]);

  // ─── Data queries ───────────────────────────────────────
  const { data: agendamentos = [], isLoading: loadingAg, error: errorAg, refetch: refetchAg } = useQuery({
    queryKey: ['analytics-ag', ...scopeKey, range.from.toISOString(), range.to.toISOString()],
    enabled: !!profile?.clinica_id,
    queryFn: async () => buscarEmBlocos<any>(() => supabase.from('agendamentos')
        .select('*, medicos(nome, especialidade)')
        .eq('clinica_id', profile!.clinica_id!)
        .gte('data', format(range.from, 'yyyy-MM-dd'))
        .lte('data', format(range.to, 'yyyy-MM-dd'))
        .order('data').order('id')),
  });

  const prevAgendamentosQuery = useQuery({
    queryKey: ['analytics-ag-prev', ...scopeKey, prevRange.from.toISOString(), prevRange.to.toISOString()],
    enabled: showComparison && !!profile?.clinica_id,
    queryFn: async () => buscarEmBlocos<any>(() => supabase.from('agendamentos')
        .select('*')
        .eq('clinica_id', profile!.clinica_id!)
        .gte('data', format(prevRange.from, 'yyyy-MM-dd'))
        .lte('data', format(prevRange.to, 'yyyy-MM-dd'))
        .order('data').order('id')),
  });

  const lancamentosEmissaoQuery = useQuery({
    queryKey: ['analytics-lanc-emissao', ...scopeKey, range.from.toISOString(), range.to.toISOString()],
    enabled: !!profile?.clinica_id,
    queryFn: async () => buscarEmBlocos<any>(() => supabase.from('lancamentos')
        .select('*')
        .eq('clinica_id', profile!.clinica_id!)
        .gte('data', format(range.from, 'yyyy-MM-dd'))
        .lte('data', format(range.to, 'yyyy-MM-dd'))
        .order('data').order('id')),
  });
  const prevAgendamentos = prevAgendamentosQuery.data ?? [];
  const errorPrevAg = prevAgendamentosQuery.error;

  const lancamentosPagamentoQuery = useQuery({
    queryKey: ['analytics-lanc-pagamento', ...scopeKey, range.from.toISOString(), range.to.toISOString()],
    enabled: !!profile?.clinica_id,
    queryFn: async () => buscarEmBlocos<any>(() => supabase.from('lancamentos')
        .select('*')
        .eq('clinica_id', profile!.clinica_id!)
        .gte('data_pagamento', format(range.from, 'yyyy-MM-dd'))
        .lte('data_pagamento', format(range.to, 'yyyy-MM-dd'))
        .order('data_pagamento').order('id')),
  });

  const lancamentos = useMemo(() => {
    const unique = new Map<string, any>();
    for (const item of [...(lancamentosEmissaoQuery.data ?? []), ...(lancamentosPagamentoQuery.data ?? [])]) unique.set(item.id, item);
    return [...unique.values()];
  }, [lancamentosEmissaoQuery.data, lancamentosPagamentoQuery.data]);

  const prevLancamentosEmissaoQuery = useQuery({
    queryKey: ['analytics-lanc-prev-emissao', ...scopeKey, prevRange.from.toISOString(), prevRange.to.toISOString()],
    enabled: showComparison && !!profile?.clinica_id,
    queryFn: async () => buscarEmBlocos<any>(() => supabase.from('lancamentos')
        .select('*')
        .eq('clinica_id', profile!.clinica_id!)
        .gte('data', format(prevRange.from, 'yyyy-MM-dd'))
        .lte('data', format(prevRange.to, 'yyyy-MM-dd'))
        .order('data').order('id')),
  });

  const prevLancamentosPagamentoQuery = useQuery({
    queryKey: ['analytics-lanc-prev-pagamento', ...scopeKey, prevRange.from.toISOString(), prevRange.to.toISOString()],
    enabled: showComparison && !!profile?.clinica_id,
    queryFn: async () => buscarEmBlocos<any>(() => supabase.from('lancamentos')
        .select('*')
        .eq('clinica_id', profile!.clinica_id!)
        .gte('data_pagamento', format(prevRange.from, 'yyyy-MM-dd'))
        .lte('data_pagamento', format(prevRange.to, 'yyyy-MM-dd'))
        .order('data_pagamento').order('id')),
  });

  const prevLancamentos = useMemo(() => {
    const unique = new Map<string, any>();
    for (const item of [...(prevLancamentosEmissaoQuery.data ?? []), ...(prevLancamentosPagamentoQuery.data ?? [])]) unique.set(item.id, item);
    return [...unique.values()];
  }, [prevLancamentosEmissaoQuery.data, prevLancamentosPagamentoQuery.data]);

  const pagamentosQuery = useQuery({
    queryKey: ['analytics-pagamentos', ...scopeKey, timestampRange.inicio, timestampRange.fimExclusivo,
      showComparison ? previousTimestampRange.inicio : null, showComparison ? previousTimestampRange.fimExclusivo : null],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const selecionar = () => supabase.from('pagamentos')
        .select('id,lancamento_id,valor,data_pagamento,estornado_em,forma_pagamento,lancamentos!inner(agendamento_id,tipo,categoria,clinica_id)')
        .eq('clinica_id', profile!.clinica_id!)
        .eq('lancamentos.clinica_id', profile!.clinica_id!)
        .order('id');
      const periodos = [timestampRange, ...(showComparison ? [previousTimestampRange] : [])];
      const eventos = await Promise.all(periodos.flatMap(periodo => [
        buscarEmBlocos<any>(() => selecionar()
          .gte('data_pagamento', periodo.inicio)
          .lt('data_pagamento', periodo.fimExclusivo)),
        buscarEmBlocos<any>(() => selecionar()
          .not('estornado_em', 'is', null)
          .gte('estornado_em', periodo.inicio)
          .lt('estornado_em', periodo.fimExclusivo)),
      ]));
      return [...new Map(eventos.flat().map(pagamento => [pagamento.id, pagamento] as const)).values()];
    },
  });
  const pagamentos = pagamentosQuery.data ?? [];

  const triagensQuery = useQuery({
    queryKey: ['analytics-tri', ...scopeKey, range.from.toISOString(), range.to.toISOString()],
    enabled: !!profile?.clinica_id,
    queryFn: async () => buscarEmBlocos<any>(() => supabase.from('triagens')
        .select('*')
        .eq('clinica_id', profile!.clinica_id!)
        .gte('created_at', timestampRange.inicio)
        .lt('created_at', timestampRange.fimExclusivo)
        .order('created_at').order('id')),
  });
  const triagens = triagensQuery.data ?? [];

  const feedbacksQuery = useQuery({
    queryKey: ['analytics-feedback', ...scopeKey, range.from.toISOString(), range.to.toISOString()],
    enabled: !!profile?.clinica_id,
    queryFn: async () => buscarEmBlocos<any>(() => supabase.from('feedbacks_nps')
        .select('id, nota, comentario, created_at, pacientes(nome), medicos(nome)')
        .eq('clinica_id', profile!.clinica_id!)
        .gte('created_at', timestampRange.inicio)
        .lt('created_at', timestampRange.fimExclusivo)
        .order('created_at', { ascending: false }).order('id')),
  });
  const feedbacks = feedbacksQuery.data ?? [];

  const mediaSatisfacao = feedbacks.length
    ? feedbacks.reduce((total: number, item: any) => total + item.nota, 0) / feedbacks.length : 0;

  // ─── KPI calculations ──────────────────────────────────
  const totalAg = agendamentos.length;
  const attendance = calculateAttendanceRate(agendamentos);
  const compareceram = attendance.attended;
  const faltaram = attendance.missed;
  const cancelados = agendamentos.filter(a => a.status === 'cancelado').length;
  const baseComparecimento = attendance.denominator;
  const taxaComparecimento = attendance.rate ?? 0;
  const taxaCancelamento = totalAg > 0 ? Math.round((cancelados / totalAg) * 100) : 0;

  const prevTotalAg = prevAgendamentos.length;
  const previousAttendance = calculateAttendanceRate(prevAgendamentos);
  const prevTaxaComp = previousAttendance.rate ?? 0;

  const eventosFinanceiros = useMemo(() => eventosFinanceirosDoPeriodo(lancamentos, pagamentos, range.from, range.to), [lancamentos, pagamentos, range]);
  const eventosFinanceirosAnteriores = useMemo(() => eventosFinanceirosDoPeriodo(prevLancamentos, pagamentos, prevRange.from, prevRange.to), [prevLancamentos, pagamentos, prevRange]);
  const receitaTotal = eventosFinanceiros.filter(evento => evento.tipo === 'receita').reduce((acc, evento) => acc + evento.valor, 0);
  const despesaTotal = eventosFinanceiros.filter(evento => evento.tipo === 'despesa').reduce((acc, evento) => acc + evento.valor, 0);
  const lucroLiquido = receitaTotal - despesaTotal;
  const margemLucro = receitaTotal > 0 ? Math.round((lucroLiquido / receitaTotal) * 100) : null;
  const receitaAtendimentos = eventosFinanceiros.filter(evento => evento.tipo === 'receita' && evento.agendamentoId).reduce((acc, evento) => acc + evento.valor, 0);
  const atendimentosComRecebimento = new Set(eventosFinanceiros
    .filter(evento => evento.tipo === 'receita' && evento.agendamentoId)
    .map(evento => evento.agendamentoId));
  const ticketMedio = atendimentosComRecebimento.size > 0 ? receitaAtendimentos / atendimentosComRecebimento.size : 0;

  const prevReceita = eventosFinanceirosAnteriores.filter(evento => evento.tipo === 'receita').reduce((acc, evento) => acc + evento.valor, 0);
  const prevDespesa = eventosFinanceirosAnteriores.filter(evento => evento.tipo === 'despesa').reduce((acc, evento) => acc + evento.valor, 0);
  const receitaAnteriorAtendimentos = eventosFinanceirosAnteriores.filter(evento => evento.tipo === 'receita' && evento.agendamentoId).reduce((acc, evento) => acc + evento.valor, 0);
  const atendimentosAnterioresComRecebimento = new Set(eventosFinanceirosAnteriores
    .filter(evento => evento.tipo === 'receita' && evento.agendamentoId)
    .map(evento => evento.agendamentoId));
  const ticketMedioAnterior = atendimentosAnterioresComRecebimento.size > 0
    ? receitaAnteriorAtendimentos / atendimentosAnterioresComRecebimento.size
    : 0;

  const calcChange = (current: number, previous: number) => {
    if (previous === 0) return null;
    return Math.round(((current - previous) / previous) * 100);
  };
  const changeDespesas = calcChange(despesaTotal, prevDespesa);

  // ─── Productivity per doctor ────────────────────────────
  const produtividade = useMemo(() => {
    const map: Record<string, { nome: string; especialidade: string; total: number; finalizados: number }> = {};
    agendamentos.forEach((a: any) => {
      const medicoNome = a.medicos?.nome || 'Desconhecido';
      const esp = a.medicos?.especialidade || 'Geral';
      if (!map[a.medico_id]) map[a.medico_id] = { nome: medicoNome, especialidade: esp, total: 0, finalizados: 0 };
      map[a.medico_id].total++;
      if (STATUS_FINALIZADO.has(a.status)) map[a.medico_id].finalizados++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [agendamentos]);

  // ─── Chart data ─────────────────────────────────────────
  const days = eachDayOfInterval({ start: range.from, end: range.to });
  const chartInterval = days.length > 60 ? 'week' : 'day';

  const agPorDia = useMemo(() => {
    const points = chartInterval === 'week'
      ? days.filter((_, i) => i % 7 === 0).map(start => ({ start, end: addDays(start, 6) > range.to ? range.to : addDays(start, 6) }))
      : days.slice(-14).map(day => ({ start: day, end: day }));
    return points.map(({ start, end }) => {
      const inicio = format(start, 'yyyy-MM-dd');
      const fim = format(end, 'yyyy-MM-dd');
      const anteriores = showComparison ? { inicio: format(subDays(start, rangeDays), 'yyyy-MM-dd'), fim: format(subDays(end, rangeDays), 'yyyy-MM-dd') } : null;
      return {
        dia: format(start, chartInterval === 'week' ? 'dd/MM' : 'EEE dd', { locale: ptBR }),
        agendamentos: agendamentos.filter(a => a.data >= inicio && a.data <= fim).length,
        ...(anteriores ? { anterior: prevAgendamentos.filter((a: any) => a.data >= anteriores.inicio && a.data <= anteriores.fim).length } : {}),
      };
    });
  }, [agendamentos, prevAgendamentos, days, showComparison, rangeDays, chartInterval, range.to]);

  const statusAgendamentos = [
    { name: 'Finalizados', value: agendamentos.filter(a => STATUS_FINALIZADO.has(a.status)).length },
    { name: 'Confirmados', value: agendamentos.filter(a => a.status === 'confirmado').length },
    { name: 'Agendados', value: agendamentos.filter(a => a.status === 'agendado').length },
    { name: 'Aguardando pagamento', value: agendamentos.filter(a => a.status === 'aguardando_pagamento').length },
    { name: 'Pago', value: agendamentos.filter(a => a.status === 'pago').length },
    { name: 'Aguardando triagem', value: agendamentos.filter(a => a.status === 'aguardando_triagem').length },
    { name: 'Em triagem', value: agendamentos.filter(a => a.status === 'em_triagem').length },
    { name: 'Em atendimento', value: agendamentos.filter(a => a.status === 'em_atendimento').length },
    { name: 'Aguardando', value: agendamentos.filter(a => a.status === 'aguardando').length },
    { name: 'Aguardando pagamento adicional', value: agendamentos.filter(a => a.status === 'aguardando_pagamento_adicional').length },
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
    const points = chartInterval === 'week'
      ? days.filter((_, i) => i % 7 === 0).map(start => ({ start, end: addDays(start, 6) > range.to ? range.to : addDays(start, 6) }))
      : days.slice(-14).map(day => ({ start: day, end: day }));
    return points.map(({ start, end }) => {
      const inicio = format(start, 'yyyy-MM-dd');
      const fim = format(end, 'yyyy-MM-dd');
      const eventosDoPeriodo = eventosFinanceiros.filter(evento => evento.data >= inicio && evento.data <= fim);
      const receitas = eventosDoPeriodo.filter(evento => evento.tipo === 'receita').reduce((acc, evento) => acc + evento.valor, 0);
      const despesas = eventosDoPeriodo.filter(evento => evento.tipo === 'despesa').reduce((acc, evento) => acc + evento.valor, 0);
      return { dia: format(start, 'dd/MM'), receitas, despesas, saldo: receitas - despesas };
    });
  }, [eventosFinanceiros, days, chartInterval, range.to]);

  const isLoadingDados = loadingAg || lancamentosEmissaoQuery.isLoading || lancamentosPagamentoQuery.isLoading ||
    pagamentosQuery.isLoading || triagensQuery.isLoading || feedbacksQuery.isLoading ||
    (showComparison && (prevAgendamentosQuery.isLoading || prevLancamentosEmissaoQuery.isLoading || prevLancamentosPagamentoQuery.isLoading));
  const erroDados = errorAg || lancamentosEmissaoQuery.error || lancamentosPagamentoQuery.error || pagamentosQuery.error ||
    triagensQuery.error || feedbacksQuery.error || (showComparison && (errorPrevAg || prevLancamentosEmissaoQuery.error || prevLancamentosPagamentoQuery.error));
  const fontesNoLimite = [
    { nome: 'agendamentos', total: agendamentos.length },
    { nome: 'lançamentos', total: lancamentos.length },
    { nome: 'pagamentos', total: pagamentos.length },
    { nome: 'triagens', total: triagens.length },
    { nome: 'feedbacks', total: feedbacks.length },
    ...(showComparison ? [
      { nome: 'agendamentos do período anterior', total: prevAgendamentos.length },
      { nome: 'lançamentos do período anterior', total: prevLancamentos.length },
    ] : []),
  ].filter(fonte => fonte.total >= LIMITE_BUSCA_EM_BLOCOS).map(fonte => fonte.nome);

  const refetchTudo = () => {
    refetchAg();
    lancamentosEmissaoQuery.refetch();
    lancamentosPagamentoQuery.refetch();
    pagamentosQuery.refetch();
    triagensQuery.refetch();
    feedbacksQuery.refetch();
    prevLancamentosEmissaoQuery.refetch();
    prevLancamentosPagamentoQuery.refetch();
    if (showComparison) prevAgendamentosQuery.refetch();
  };

  if (authLoading || isLoadingDados) {
    return (
      <div className="pb-8">
        <DashboardSkeleton />
      </div>
    );
  }

  if (!profile?.clinica_id) {
    return (
      <div className="pb-8">
        <ErrorState title="Clínica não identificada" description="Não foi possível carregar os indicadores porque seu usuário não está vinculado a uma clínica. Peça ao administrador para revisar seu acesso." />
      </div>
    );
  }

  if (erroDados) {
    return (
      <div className="pb-8">
        <ErrorState
          title="Não foi possível carregar os indicadores"
          error={erroDados}
          onRetry={refetchTudo}
        />
      </div>
    );
  }

  const semDados = agendamentos.length === 0 && lancamentos.length === 0 && triagens.length === 0 && feedbacks.length === 0;

  if (semDados) {
    return (
      <div className="space-y-4 pb-8">
        <PageHeader
          title="Indicadores da clínica"
          icon={<Activity />}
          description="Escolha outro período para consultar os indicadores."
          actions={
            <>
              <Button aria-label="Atualizar indicadores" variant="outline" size="icon" className="rounded-full" onClick={refetchTudo}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Select value={periodPreset} onValueChange={setPeriodPreset}>
                <SelectTrigger className="w-[180px] h-9 rounded-full" aria-label="Selecionar período dos indicadores">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_PRESETS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
        />
        {periodPreset === 'custom' && (
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 rounded-full text-xs gap-1">
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
                <Button variant="outline" size="sm" className="h-9 rounded-full text-xs gap-1">
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
        <EmptyState
          icon={Activity}
          title="Ainda não há dados neste período"
          description={`Não encontramos agendamentos, lançamentos, triagens ou feedbacks entre ${format(range.from, 'dd/MM/yyyy')} e ${format(range.to, 'dd/MM/yyyy')}. Selecione outro período acima.`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Indicadores da clínica"
        icon={<Activity />}
        description={`${format(range.from, 'dd/MM/yyyy')} a ${format(range.to, 'dd/MM/yyyy')}${showComparison ? ` · comparando com ${format(prevRange.from, 'dd/MM')} a ${format(prevRange.to, 'dd/MM')}` : ''} · para relatórios detalhados e exportações, acesse Relatórios.`}
        actions={
          <>
            <Button aria-label="Atualizar indicadores" variant="outline" size="icon" className="rounded-full" onClick={refetchTudo}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" asChild className="rounded-full gap-1.5">
              <Link to="/relatorios"><FileBarChart className="h-3.5 w-3.5" />Relatórios detalhados</Link>
            </Button>
            <Select value={periodPreset} onValueChange={setPeriodPreset}>
              <SelectTrigger className="w-[180px] h-9 rounded-full" aria-label="Selecionar período de comparação dos indicadores">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_PRESETS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>

            <Button
              variant={showComparison ? 'default' : 'outline'}
              size="sm" className={cn('h-9 rounded-full text-xs gap-1', showComparison && 'bg-gradient-primary text-white hover:brightness-110')}
              onClick={() => setShowComparison(!showComparison)}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Comparar
            </Button>
          </>
        }
      />

      {periodPreset === 'custom' && (
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 rounded-full text-xs gap-1">
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
              <Button variant="outline" size="sm" className="h-9 rounded-full text-xs gap-1">
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
      {fontesNoLimite.length > 0 && <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground"><Activity className="mt-0.5 h-4 w-4 shrink-0" /><p>O limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} registros foi atingido em: {fontesNoLimite.join(', ')}. Estes indicadores podem estar incompletos.</p></div>}

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Taxa de Comparecimento"
          value={baseComparecimento > 0 ? `${taxaComparecimento}%` : '—'}
          change={showComparison ? (baseComparecimento > 0 ? calcChange(taxaComparecimento, prevTaxaComp) : null) : undefined}
          icon={<Users className="h-6 w-6 text-[#1080CA]" />}
          tone="primary"
          onClick={() => setActiveTab('atendimento')}
          pressed={activeTab === 'atendimento'}
          definition="Consultas finalizadas divididas pelo total de consultas finalizadas e faltas. Consultas futuras, em andamento e canceladas ficam fora do denominador."
          source="Agendamentos, pelos estados finalizado, atendimento_finalizado e faltou."
          period={kpiPeriod}
          description={baseComparecimento > 0
            ? `${compareceram} finalizadas de ${baseComparecimento} consultas com desfecho (${faltaram} faltas).`
            : 'Sem consultas finalizadas ou faltas no período.'}
        />
        <KPICard
          title="Receita do Período"
          value={receitaTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          change={showComparison ? calcChange(receitaTotal, prevReceita) : undefined}
          icon={<DollarSign className="h-6 w-6" />}
          tone="dark"
          onClick={() => setActiveTab('financeiro')}
          pressed={activeTab === 'financeiro'}
          definition="Soma de receitas pagas no período menos estornos cuja data ocorreu no período; registros legados sem pagamentos individuais usam o valor realizado da conta."
          source="Pagamentos e lançamentos legados sem pagamento individual."
          period={kpiPeriod}
          description={`Margem: ${margemLucro === null ? '—' : `${margemLucro}%`}`}
        />
        <KPICard
          title="Ticket Médio"
          value={atendimentosComRecebimento.size > 0 ? ticketMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
          change={showComparison ? calcChange(ticketMedio, ticketMedioAnterior) : undefined}
          icon={<TrendingUp className="h-6 w-6 text-accent-foreground" />}
          tone="accent"
          onClick={() => setActiveTab('financeiro')}
          pressed={activeTab === 'financeiro'}
          definition="Receita vinculada a agendamentos dividida pela quantidade de agendamentos distintos com recebimento no período."
          source="Pagamentos/lançamentos vinculados a agendamento."
          period={kpiPeriod}
          description={`Média por atendimento com recebimento · Lucro: ${lucroLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
        />
        <KPICard
          title="Total Agendamentos"
          value={totalAg}
          change={showComparison ? calcChange(totalAg, prevTotalAg) : undefined}
          icon={<CalendarIcon className="h-6 w-6 text-warning-foreground" />}
          tone="warning"
          onClick={() => setActiveTab('atendimento')}
          pressed={activeTab === 'atendimento'}
          definition="Contagem de todos os agendamentos com data dentro do período, independentemente do status."
          source="Agendamentos, campo data."
          period={kpiPeriod}
          description={`${cancelados} cancelados (${taxaCancelamento}%)`}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="shadow-xs"><CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">Despesas</p>
          <p className="text-xl font-bold tabular-nums text-destructive">{despesaTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          {showComparison && <p className={cn('text-[10px]', changeDespesas === null ? 'text-muted-foreground' : changeDespesas <= 0 ? 'text-success' : 'text-destructive')}>
            {changeDespesas === null ? 'Sem base anterior para comparar' : `${changeDespesas <= 0 ? '↓' : '↑'} ${Math.abs(changeDespesas)}% vs anterior`}
          </p>}
          <KPIDefinition title="Despesas" definition="Soma das despesas pagas no período menos estornos ocorridos no período; contas legadas sem pagamentos individuais usam o valor realizado da conta." source="Pagamentos e lançamentos legados sem pagamento individual." period={kpiPeriod} />
        </CardContent></Card>
        <Card className="shadow-xs"><CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">Triagens</p>
          <p className="text-xl font-bold tabular-nums">{triagens.length}</p>
          <p className="text-[10px] text-muted-foreground">No período selecionado</p>
          <KPIDefinition title="Triagens" definition="Quantidade de registros criados dentro do período selecionado." source="Triagens, campo created_at." period={kpiPeriod} />
        </CardContent></Card>
        <Card className="shadow-xs"><CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">Margem de Lucro</p>
          <p className={cn('text-xl font-bold tabular-nums', margemLucro === null ? 'text-muted-foreground' : margemLucro >= 0 ? 'text-success' : 'text-destructive')}>{margemLucro === null ? '—' : `${margemLucro}%`}</p>
          <p className="text-[10px] text-muted-foreground">Receita - Despesa / Receita</p>
          <KPIDefinition title="Margem de lucro" definition="(Receita - despesas) ÷ receita × 100. Sem receita, o indicador fica indisponível." source="Os mesmos eventos de pagamentos e lançamentos usados em Receita e Despesas." period={kpiPeriod} />
        </CardContent></Card>
        <Card className="shadow-xs"><CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">Média diária de agendamentos</p>
          <p className="text-xl font-bold tabular-nums">{(totalAg / (rangeDays || 1)).toFixed(1)}</p>
          <p className="text-[10px] text-muted-foreground">consultas/dia</p>
          <KPIDefinition title="Média diária de atendimentos" definition="Total de agendamentos ÷ quantidade inclusiva de dias do período." source="Agendamentos, campo data." period={kpiPeriod} />
        </CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="atendimento">Atendimento</TabsTrigger>
          <TabsTrigger value="produtividade">Produtividade</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="triagem">Triagem</TabsTrigger>
          <TabsTrigger value="satisfacao">Satisfação</TabsTrigger>
        </TabsList>

        <TabsContent value="atendimento" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle>Agendamentos por Dia</CardTitle>
                <CardDescription>{showComparison ? 'Atual vs Período Anterior' : `Últimos ${Math.min(14, rangeDays)} dias`}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={agPorDia}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                    <XAxis dataKey="dia" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} />
                    <Bar dataKey="agendamentos" fill="#1080CA" radius={[4, 4, 0, 0]} name="Atual" />
                    {showComparison && (
                      <Bar dataKey="anterior" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} opacity={0.4} name="Anterior" />
                    )}
                    {showComparison && <Legend />}
                  </BarChart>
                </ResponsiveContainer>
                <AccessibleChartTable
                  title="Agendamentos por dia"
                  period={kpiPeriod}
                  filters={appointmentChartFilters}
                  columns={[{ key: 'dia', label: 'Dia' }, { key: 'agendamentos', label: 'Agendamentos' }, ...(showComparison ? [{ key: 'anterior', label: 'Período anterior' }] : [])]}
                  rows={agPorDia.map(point => ({ dia: point.dia, agendamentos: point.agendamentos, ...(showComparison ? { anterior: point.anterior ?? 0 } : {}) }))}
                />
              </CardContent>
            </Card>

            <Card className="shadow-xs">
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
                <AccessibleChartTable
                  title="Status dos agendamentos"
                  period={kpiPeriod}
                  filters={selectedPeriodFilter}
                  columns={[{ key: 'status', label: 'Status' }, { key: 'quantidade', label: 'Agendamentos' }]}
                  rows={statusAgendamentos.map(item => ({ status: item.name, quantidade: item.value }))}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Produtividade Tab ─── */}
        <TabsContent value="produtividade" className="space-y-4">
          <Card className="shadow-xs">
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
                      <div key={i}
                        className="flex items-center gap-4 p-3 rounded-xl border border-border/60 bg-card hover:shadow-sm transition-shadow animate-in fade-in slide-in-from-left-2"
                        style={{ animationDelay: `${i * 50}ms` }}
                      >
                        <div className={cn(
                          'h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
                          i === 0 ? 'bg-gradient-primary text-white' : 'bg-muted text-foreground',
                        )}>
                          {i + 1}º
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{nomeMedico(med.nome)}</p>
                          <p className="text-xs text-muted-foreground">{med.especialidade}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-lg tabular-nums">{med.total}</p>
                          <p className="text-[10px] text-muted-foreground">consultas</p>
                        </div>
                        <div className="w-20 shrink-0">
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              style={{ width: `${taxa}%` }}
                              className="h-full bg-gradient-primary rounded-full transition-all duration-700"
                            />
                          </div>
                          <p className="text-[10px] text-center text-muted-foreground mt-0.5">{taxa}% finaliz.</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <AccessibleChartTable
                title="Produtividade por médico"
                period={kpiPeriod}
                filters={selectedPeriodFilter}
                columns={[{ key: 'medico', label: 'Médico' }, { key: 'especialidade', label: 'Especialidade' }, { key: 'agendamentos', label: 'Agendamentos' }, { key: 'finalizados', label: 'Finalizados' }, { key: 'taxa', label: 'Taxa de finalização (%)' }]}
                rows={produtividade.map(item => ({ medico: nomeMedico(item.nome), especialidade: item.especialidade, agendamentos: item.total, finalizados: item.finalizados, taxa: item.total > 0 ? Math.round((item.finalizados / item.total) * 100) : 0 }))}
              />
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
              <Card key={item.label} className="shadow-xs">
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

          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>Fluxo de Caixa</CardTitle>
              <CardDescription>Receitas vs Despesas</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={fluxoCaixa}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                  <XAxis dataKey="dia" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                    formatter={(value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
                  <Area type="monotone" dataKey="receitas" stroke="hsl(var(--success))" fill="hsl(var(--success))" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="despesas" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.6} />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
                <AccessibleChartTable
                  title="Fluxo de caixa"
                  period={kpiPeriod}
                  filters={selectedPeriodFilter}
                  columns={[{ key: 'dia', label: 'Dia' }, { key: 'receitas', label: 'Receitas (R$)' }, { key: 'despesas', label: 'Despesas (R$)' }, { key: 'saldo', label: 'Saldo (R$)' }]}
                  rows={fluxoCaixa}
                />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="triagem" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="shadow-xs">
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
                <AccessibleChartTable
                  title="Classificação de risco das triagens"
                  period={kpiPeriod}
                  filters={selectedPeriodFilter}
                  columns={[{ key: 'classificacao', label: 'Classificação' }, { key: 'quantidade', label: 'Triagens' }]}
                  rows={classificacaoRisco.map(item => ({ classificacao: item.name, quantidade: item.value }))}
                />
              </CardContent>
            </Card>

            <Card className="shadow-xs">
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
            <Card className="shadow-xs"><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Média</p><p className={cn('text-3xl font-bold', feedbacks.length === 0 && 'text-muted-foreground')}>{feedbacks.length > 0 ? `${mediaSatisfacao.toFixed(1)}/5` : '—'}</p>{feedbacks.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Sem respostas no período</p>}</CardContent></Card>
            <Card className="shadow-xs"><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Respostas</p><p className="text-3xl font-bold">{feedbacks.length}</p></CardContent></Card>
            <Card className="shadow-xs"><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Alertas (1–2)</p><p className="text-3xl font-bold text-destructive">{feedbacks.filter((f: any) => f.nota <= 2).length}</p></CardContent></Card>
          </div>
          <Card className="shadow-xs"><CardHeader><CardTitle>Avaliações recentes</CardTitle><CardDescription>Notas e comentários do período</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {feedbacks.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma avaliação no período.</p> : feedbacks.slice(0, 20).map((f: any) => (
                <div key={f.id} className={cn('rounded-lg border border-border/60 p-3', f.nota <= 2 && 'border-destructive/50 bg-destructive/5')}>
                  <div className="flex items-center justify-between"><span className="font-medium">{f.pacientes?.nome || 'Paciente'}</span><Badge variant={f.nota <= 2 ? 'destructive' : 'secondary'} className="rounded-full"><Star className="mr-1 h-3 w-3" />{f.nota}/5</Badge></div>
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
