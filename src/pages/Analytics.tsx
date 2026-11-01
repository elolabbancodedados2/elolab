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

const COR_GRADE = 'hsl(var(--border))';
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

interface KPIItemProps {
  title: string;
  value: string | number;
  change?: number | null;
  icon: React.ReactNode;
  description?: string;
  definition: string;
  source: string;
  period: string;
  valueTone?: 'default' | 'success' | 'destructive';
}

function KPIDefinition({ title, definition, source, period }: Pick<KPIItemProps, 'title' | 'definition' | 'source' | 'period'>) {
  return (
    <details className="mt-1 text-xs" data-testid="analytics-kpi-definition">
      <summary className="w-fit cursor-pointer rounded-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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

function KPIItem({ title, value, change, icon, description, definition, source, period, valueTone = 'default' }: KPIItemProps) {
  const valueColor = valueTone === 'success' ? 'text-success' : valueTone === 'destructive' ? 'text-destructive' : 'text-foreground';
  return (
    <div data-testid="analytics-kpi" className="min-w-0 p-3">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
        <p className="truncate text-sm font-medium text-muted-foreground">{title}</p>
      </div>
      <p className={cn('mt-2 break-words text-2xl font-semibold tabular-nums', valueColor)}>{value}</p>
      {change !== undefined && (
        <div className={cn('mt-1 flex items-center gap-1 text-xs', change === null ? 'text-muted-foreground' : change >= 0 ? 'text-success' : 'text-destructive')}>
          {change === null ? 'Sem base anterior para comparar' : <>
            {change > 0 ? <ArrowUp aria-hidden="true" className="h-3 w-3" /> : change < 0 ? <ArrowDown aria-hidden="true" className="h-3 w-3" /> : <Activity aria-hidden="true" className="h-3 w-3" />}
            {Math.abs(change)}% vs período anterior
          </>}
        </div>
      )}
      {description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      <KPIDefinition title={title} definition={definition} source={source} period={period} />
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
              size="sm" className="h-9 gap-1 rounded-full text-xs"
              aria-pressed={showComparison}
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

      <section aria-labelledby="analytics-summary-title" className="overflow-hidden rounded-xl border border-border bg-card" data-testid="analytics-summary">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 sm:px-5">
          <div>
            <h2 id="analytics-summary-title" className="text-sm font-semibold text-foreground">Resumo do período</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Indicadores de atendimento, receita e operação na janela selecionada.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="h-9 rounded-full" onClick={() => setActiveTab('atendimento')}>Ver atendimento</Button>
            <Button variant="outline" size="sm" className="h-9 rounded-full" onClick={() => setActiveTab('financeiro')}>Ver financeiro</Button>
          </div>
        </header>
        <div className="grid grid-cols-2 divide-x divide-y divide-border lg:grid-cols-4 lg:divide-y-0">
          <KPIItem
            title="Taxa de Comparecimento"
            value={baseComparecimento > 0 ? `${taxaComparecimento}%` : '—'}
            change={showComparison ? (baseComparecimento > 0 ? calcChange(taxaComparecimento, prevTaxaComp) : null) : undefined}
            icon={<Users className="h-4 w-4" />}
            definition="Consultas finalizadas divididas pelo total de consultas finalizadas e faltas. Consultas futuras, em andamento e canceladas ficam fora do denominador."
            source="Agendamentos, pelos estados finalizado, atendimento_finalizado e faltou."
            period={kpiPeriod}
            description={baseComparecimento > 0
              ? `${compareceram} finalizadas de ${baseComparecimento} consultas com desfecho (${faltaram} faltas).`
              : 'Sem consultas finalizadas ou faltas no período.'}
          />
          <KPIItem
            title="Receita do Período"
            value={receitaTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            change={showComparison ? calcChange(receitaTotal, prevReceita) : undefined}
            icon={<DollarSign className="h-4 w-4" />}
            definition="Soma de receitas pagas no período menos estornos cuja data ocorreu no período; registros legados sem pagamentos individuais usam o valor realizado da conta."
            source="Pagamentos e lançamentos legados sem pagamento individual."
            period={kpiPeriod}
            description={`Margem: ${margemLucro === null ? '—' : `${margemLucro}%`}`}
          />
          <KPIItem
            title="Ticket Médio"
            value={atendimentosComRecebimento.size > 0 ? ticketMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
            change={showComparison ? calcChange(ticketMedio, ticketMedioAnterior) : undefined}
            icon={<TrendingUp className="h-4 w-4" />}
            definition="Receita vinculada a agendamentos dividida pela quantidade de agendamentos distintos com recebimento no período."
            source="Pagamentos/lançamentos vinculados a agendamento."
            period={kpiPeriod}
            description={`Média por atendimento com recebimento · Lucro: ${lucroLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
          />
          <KPIItem
            title="Total Agendamentos"
            value={totalAg}
            change={showComparison ? calcChange(totalAg, prevTotalAg) : undefined}
            icon={<CalendarIcon className="h-4 w-4" />}
            definition="Contagem de todos os agendamentos com data dentro do período, independentemente do status."
            source="Agendamentos, campo data."
            period={kpiPeriod}
            description={`${cancelados} cancelados (${taxaCancelamento}%)`}
          />
        </div>
        <div className="border-t border-border bg-muted/30 px-4 py-2 sm:px-5">
          <h3 className="text-xs font-semibold text-muted-foreground">Indicadores complementares</h3>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-border lg:grid-cols-4 lg:divide-y-0">
          <KPIItem
            title="Despesas"
            value={despesaTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            change={showComparison ? changeDespesas : undefined}
            valueTone="destructive"
            icon={<DollarSign className="h-4 w-4" />}
            definition="Soma das despesas pagas no período menos estornos ocorridos no período; contas legadas sem pagamentos individuais usam o valor realizado da conta."
            source="Pagamentos e lançamentos legados sem pagamento individual."
            period={kpiPeriod}
          />
          <KPIItem
            title="Triagens"
            value={triagens.length}
            icon={<Activity className="h-4 w-4" />}
            definition="Quantidade de registros criados dentro do período selecionado."
            source="Triagens, campo created_at."
            period={kpiPeriod}
          />
          <KPIItem
            title="Margem de Lucro"
            value={margemLucro === null ? '—' : `${margemLucro}%`}
            valueTone={margemLucro === null ? 'default' : margemLucro >= 0 ? 'success' : 'destructive'}
            icon={<TrendingUp className="h-4 w-4" />}
            definition="(Receita - despesas) dividido pela receita. Sem receita, o indicador fica indisponível."
            source="Os mesmos eventos de pagamentos e lançamentos usados em Receita e Despesas."
            period={kpiPeriod}
          />
          <KPIItem
            title="Média diária de agendamentos"
            value={(totalAg / (rangeDays || 1)).toFixed(1)}
            icon={<CalendarIcon className="h-4 w-4" />}
            definition="Total de agendamentos dividido pela quantidade inclusiva de dias do período."
            source="Agendamentos, campo data."
            period={kpiPeriod}
          />
        </div>
      </section>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-transparent p-0 sm:grid-cols-3 lg:grid-cols-5">
          <TabsTrigger className="w-full px-2 text-xs" value="atendimento">Atendimento</TabsTrigger>
          <TabsTrigger className="w-full px-2 text-xs" value="produtividade">Produtividade</TabsTrigger>
          <TabsTrigger className="w-full px-2 text-xs" value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger className="w-full px-2 text-xs" value="triagem">Triagem</TabsTrigger>
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
                {agPorDia.length === 0 ? (
                  <p className="flex min-h-[300px] items-center justify-center text-center text-sm text-muted-foreground">
                    Nenhum dado de agendamento disponível no período selecionado.
                  </p>
                ) : <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={agPorDia}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} />
                    <XAxis dataKey="dia" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} />
                    <Bar dataKey="agendamentos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Atual" />
                    {showComparison && (
                      <Bar dataKey="anterior" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} opacity={0.4} name="Anterior" />
                    )}
                    {showComparison && <Legend />}
                  </BarChart>
                </ResponsiveContainer>}
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
                {statusAgendamentos.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">Nenhum agendamento no período selecionado.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(280, statusAgendamentos.length * 32)}>
                    <BarChart data={statusAgendamentos} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={150} interval={0} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                      <Bar dataKey="value" name="Agendamentos" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
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
                        className="flex items-center gap-4 border-b border-border/60 p-3 last:border-b-0 hover:bg-muted/30"
                      >
                        <div className={cn(
                          'h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
                          i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
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
                              className="h-full rounded-full bg-primary transition-all duration-700"
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
          <section aria-label="Resumo financeiro" className="grid divide-y divide-border rounded-xl border border-border bg-card md:grid-cols-3 md:divide-x md:divide-y-0">
            {[
              { label: 'Receita Total', value: receitaTotal, color: 'text-success' },
              { label: 'Despesa Total', value: despesaTotal, color: 'text-destructive' },
              { label: 'Saldo', value: receitaTotal - despesaTotal, color: receitaTotal - despesaTotal >= 0 ? 'text-success' : 'text-destructive' },
            ].map(item => (
              <div key={item.label} className="min-w-0 px-4 py-3 md:px-5">
                <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                <p className={cn('mt-1 break-words text-xl font-semibold tabular-nums', item.color)}>
                  {item.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
            ))}
          </section>

          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>Fluxo de Caixa</CardTitle>
              <CardDescription>Receitas vs Despesas</CardDescription>
            </CardHeader>
            <CardContent>
              {eventosFinanceiros.length === 0 ? (
                <p className="flex min-h-[300px] items-center justify-center text-center text-sm text-muted-foreground">
                  Nenhuma movimentação financeira no período selecionado.
                </p>
              ) : <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={fluxoCaixa}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} />
                  <XAxis dataKey="dia" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                    formatter={(value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
                  <Area type="monotone" dataKey="receitas" stroke="hsl(var(--success))" fill="hsl(var(--success))" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="despesas" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.6} />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>}
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
                {classificacaoRisco.length === 0 ? (
                  <p className="flex min-h-[300px] items-center justify-center text-center text-sm text-muted-foreground">
                    Nenhuma triagem registrada no período selecionado.
                  </p>
                ) : <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={classificacaoRisco} cx="50%" cy="50%" labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={100} dataKey="value">
                      {classificacaoRisco.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>}
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
