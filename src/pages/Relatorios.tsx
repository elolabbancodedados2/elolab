import { formatWithDatePreference as format } from '@/lib/datePreference';
import { useState, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, startOfMonth, endOfMonth, subMonths, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  FileText,
  Calendar,
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  FileSpreadsheet,
  BarChart2, AlertTriangle, RefreshCw, Package,
  Download, ChevronDown, Bookmark, LineChart,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { usePacientes, useAgendamentosPeriodo, useSupabaseQuery, useEstoque, useMedicos } from '@/hooks/useSupabaseData';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { exportarFinanceiro, exportarPacientes, exportarAgendamentos, exportarEstoque } from '@/lib/excelExporter';
import { gerarRelatorioFinanceiro, gerarRelatorioAtendimentos, openPDF } from '@/lib/pdfGenerator';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import RelatorioCustomizado from '@/components/relatorios/RelatorioCustomizado';
import { valorRealizado } from '@/lib/lancamentos';
import { friendlyErrorMessage } from '@/components/ErrorState';
import { ActionableEmptyState } from '@/components/ActionableEmptyState';
import { PageHeader } from '@/components/PageHeader';
import { podeAcessarRelatorioCompletoDePacientes, podeExportarFontesCompletas } from '@/lib/reportAccess';
import { dateOnlyInTimeZone, inicioDoDiaEmFusoIso, parseDateOnly } from '@/lib/dateOnly';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
];
const GRID_COLOR = 'hsl(var(--border))';
const STATUS_FINALIZADO = new Set(['finalizado', 'atendimento_finalizado']);
const dateOnlyFromValue = (value: string) => value.includes('T') || value.includes(' ')
  ? dateOnlyInTimeZone(new Date(value), 'America/Sao_Paulo')
  : value.slice(0, 10);
const saldoEmAberto = (lancamento: { valor: number; valor_pago: number | null; desconto?: number | null; acrescimo?: number | null }) =>
  Math.max(0, Number(lancamento.valor || 0) - Number(lancamento.desconto || 0)
    + Number(lancamento.acrescimo || 0) - Number(lancamento.valor_pago || 0));

function ChartEmptyState({ message }: { message: string }) {
  return (
    <div role="status" className="flex min-h-44 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function ReportDataBoundary({
  title,
  loading,
  error,
  onRetry,
  children,
}: {
  title: string;
  loading: boolean;
  error?: unknown;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div role="status" aria-label={`Carregando ${title.toLowerCase()}`} aria-busy="true" className="space-y-3 py-2">
        <div className="flex min-h-10 items-center gap-2 text-sm font-medium text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
          <span>Carregando {title.toLowerCase()}…</span>
        </div>
        <Skeleton className="h-40 w-full rounded-xl" aria-hidden="true" />
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center">
        <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Não foi possível carregar {title}</p>
          <p className="text-sm text-muted-foreground">{friendlyErrorMessage(error)}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onRetry} className="shrink-0">
          <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  return children;
}

interface EventoFinanceiro {
  id: string;
  lancamentoId: string;
  agendamentoId: string | null;
  tipo: string;
  categoria: string;
  descricao: string;
  data: string;
  valor: number;
  formaPagamento: string | null;
  observacoes: string | null;
  dataVencimento: string | null;
  estornado: boolean;
}

const PERIODO_PILLS: { value: string; label: string }[] = [
  { value: 'mes_atual', label: 'Mês Atual' },
  { value: 'mes_anterior', label: 'Mês Anterior' },
  { value: 'ultimos_3_meses', label: 'Últimos 3 Meses' },
  { value: 'ultimos_6_meses', label: 'Últimos 6 Meses' },
  { value: 'ultimos_12_meses', label: 'Últimos 12 Meses' },
  { value: 'este_ano', label: 'Este Ano' },
  { value: 'personalizado', label: 'Personalizado' },
];

export default function Relatorios() {
  const [periodo, setPeriodo] = useState('mes_atual');
  const [activeTab, setActiveTab] = useState('customizado');
  const [exportando, setExportando] = useState<string | null>(null);
  const [customInicio, setCustomInicio] = useState(() => {
    const hoje = parseDateOnly(dateOnlyInTimeZone(new Date(), 'America/Sao_Paulo'))!;
    return format(startOfMonth(hoje), 'yyyy-MM-dd');
  });
  const [customFim, setCustomFim] = useState(() => dateOnlyInTimeZone(new Date(), 'America/Sao_Paulo'));

  const periodoRange = useMemo(() => {
    const now = parseDateOnly(dateOnlyInTimeZone(new Date(), 'America/Sao_Paulo'))!;
    let start: Date;
    let end: Date = now;

    switch (periodo) {
      case 'este_ano':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case 'ultimos_12_meses':
        start = startOfMonth(subMonths(now, 11));
        break;
      case 'personalizado': {
        const ini = parseDateOnly(customInicio);
        const fim = parseDateOnly(customFim);
        start = !ini || Number.isNaN(ini.getTime()) ? startOfMonth(now) : ini;
        end = !fim || Number.isNaN(fim.getTime()) ? endOfMonth(now) : new Date(fim.getFullYear(), fim.getMonth(), fim.getDate(), 23, 59, 59, 999);
        if (start > end) [start, end] = [new Date(end.getFullYear(), end.getMonth(), end.getDate()), new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999)];
        break;
      }
      case 'mes_atual':
        start = startOfMonth(now);
        break;
      case 'mes_anterior':
        start = startOfMonth(subMonths(now, 1));
        end = endOfMonth(subMonths(now, 1));
        break;
      case 'ultimos_3_meses':
        start = startOfMonth(subMonths(now, 2));
        break;
      case 'ultimos_6_meses':
        start = startOfMonth(subMonths(now, 5));
        break;
      default:
        start = startOfMonth(now);
    }

    return { start, end };
  }, [periodo, customInicio, customFim]);

  // Agenda e lançamentos vêm do servidor já recortados pelo período; antes a
  // tela baixava o histórico inteiro e filtrava no navegador.
  const inicioStr = format(periodoRange.start, 'yyyy-MM-dd');
  const fimStr = format(periodoRange.end, 'yyyy-MM-dd');
  const { profile } = useSupabaseAuth();
  const podeVerAgenda = !!profile?.roles?.some(role => ['admin', 'medico', 'enfermagem'].includes(role));
  const ehAdmin = !!profile?.roles?.includes('admin');
  const podeVerRelatorioPacientes = podeAcessarRelatorioCompletoDePacientes(profile?.roles);
  const pacientesQuery = usePacientes(podeVerRelatorioPacientes, { suppressGlobalErrorToast: true });
  const pacientes = pacientesQuery.data ?? [];
  const agendamentosQuery = useAgendamentosPeriodo(inicioStr, fimStr, {
    enabled: podeVerAgenda,
    keepPrevious: true,
    suppressGlobalErrorToast: true,
  });
  const agendamentos = agendamentosQuery.data ?? [];
  const lancamentosEmitidosQuery = useSupabaseQuery<any>('lancamentos', {
    orderBy: { column: 'data', ascending: false },
    filters: [
      { column: 'data', operator: 'gte', value: inicioStr },
      { column: 'data', operator: 'lte', value: fimStr },
    ],
    keepPrevious: true,
    suppressGlobalErrorToast: true,
  });
  const lancamentosPagosQuery = useSupabaseQuery<any>('lancamentos', {
    orderBy: { column: 'data_pagamento', ascending: false },
    filters: [
      { column: 'data_pagamento', operator: 'gte', value: inicioStr },
      { column: 'data_pagamento', operator: 'lte', value: fimStr },
    ],
    keepPrevious: true,
    suppressGlobalErrorToast: true,
  });
  const lancamentosVencidosQuery = useSupabaseQuery<any>('lancamentos', {
    orderBy: { column: 'data_vencimento', ascending: false },
    filters: [
      { column: 'data_vencimento', operator: 'gte', value: inicioStr },
      { column: 'data_vencimento', operator: 'lte', value: fimStr },
    ],
    keepPrevious: true,
    suppressGlobalErrorToast: true,
  });
  const pagamentosQuery = useQuery({
    queryKey: ['pagamentos-relatorios', profile?.clinica_id ?? null, inicioStr, fimStr],
    queryFn: async () => {
      // `pagamentos` usa timestamptz. As fronteiras precisam acompanhar o dia
      // civil da clínica (São Paulo), e o fim é exclusivo para incluir o dia
      // final inteiro sem depender de precisão de milissegundos.
      const inicioLocal = inicioDoDiaEmFusoIso(inicioStr, 'America/Sao_Paulo');
      const fimLocalExclusivo = inicioDoDiaEmFusoIso(
        format(addDays(parseDateOnly(fimStr)!, 1), 'yyyy-MM-dd'),
        'America/Sao_Paulo',
      );
      const selecionar = () => supabase.from('pagamentos')
        .select('id, lancamento_id, valor, data_pagamento, estornado_em, forma_pagamento, observacoes, lancamentos!inner(agendamento_id, tipo, categoria, descricao, data_vencimento, clinica_id)')
        .eq('clinica_id', profile!.clinica_id!)
        .eq('lancamentos.clinica_id', profile!.clinica_id!)
        .order('id', { ascending: true });
      const [pagamentosNoPeriodo, estornosNoPeriodo] = await Promise.all([
        buscarEmBlocos<any>(() => selecionar()
          .gte('data_pagamento', inicioLocal)
          .lt('data_pagamento', fimLocalExclusivo)),
        buscarEmBlocos<any>(() => selecionar()
          .not('estornado_em', 'is', null)
          .gte('estornado_em', inicioLocal)
          .lt('estornado_em', fimLocalExclusivo)),
      ]);
      return [...new Map([...pagamentosNoPeriodo, ...estornosNoPeriodo]
        .map(pagamento => [pagamento.id, pagamento] as const)).values()];
    },
    enabled: !!profile?.clinica_id,
    meta: { suppressGlobalErrorToast: true },
  });
  const lancamentos = useMemo(() => {
    const porId = new Map<string, any>();
    for (const lancamento of [
      ...(lancamentosEmitidosQuery.data ?? []),
      ...(lancamentosPagosQuery.data ?? []),
      ...(lancamentosVencidosQuery.data ?? []),
    ]) porId.set(lancamento.id, lancamento);
    return [...porId.values()];
  }, [lancamentosEmitidosQuery.data, lancamentosPagosQuery.data, lancamentosVencidosQuery.data]);
  const idsLancamentosPagos = useMemo(() => lancamentos
    .filter(lancamento => ['pago', 'parcial'].includes(lancamento.status))
    .map(lancamento => lancamento.id), [lancamentos]);
  const lancamentosComHistoricoPagamentoQuery = useQuery({
    queryKey: ['lancamentos-com-historico-pagamento-relatorios', profile?.clinica_id ?? null, inicioStr, fimStr, idsLancamentosPagos],
    queryFn: async () => {
      const idsComHistorico = new Set<string>();
      const lotesIds = Array.from({ length: Math.ceil(idsLancamentosPagos.length / 250) }, (_, index) =>
        idsLancamentosPagos.slice(index * 250, (index + 1) * 250));
      let atingiuLimite = false;
      for (let inicio = 0; inicio < lotesIds.length; inicio += 4) {
        const resultados = await Promise.all(lotesIds.slice(inicio, inicio + 4).map(ids =>
          buscarEmBlocos<any>(() => supabase.from('pagamentos')
            .select('id, lancamento_id')
            .eq('clinica_id', profile!.clinica_id!)
            .in('lancamento_id', ids)
            .order('id', { ascending: true }))));
        for (const pagamentosDaConta of resultados) {
          if (pagamentosDaConta.length >= LIMITE_BUSCA_EM_BLOCOS) atingiuLimite = true;
          for (const pagamento of pagamentosDaConta) idsComHistorico.add(pagamento.lancamento_id);
        }
      }
      return { ids: [...idsComHistorico], atingiuLimite };
    },
    enabled: !!profile?.clinica_id && idsLancamentosPagos.length > 0,
    meta: { suppressGlobalErrorToast: true },
  });
  const medicosQuery = useMedicos({ enabled: podeVerAgenda, suppressGlobalErrorToast: true });
  const medicos = medicosQuery.data ?? [];
  const estoqueQuery = useEstoque({ suppressGlobalErrorToast: true });
  const estoque = estoqueQuery.data ?? [];

  const financialQueries = [lancamentosEmitidosQuery, lancamentosPagosQuery, lancamentosVencidosQuery, pagamentosQuery, lancamentosComHistoricoPagamentoQuery];
  const agendaQueries = [agendamentosQuery, medicosQuery];
  const patientQueries = [pacientesQuery];
  const stockQueries = [estoqueQuery];
  const summaryQueries = [...financialQueries, ...(podeVerAgenda ? agendaQueries : [])];
  const queries = [...patientQueries, ...(podeVerAgenda ? agendaQueries : []), ...financialQueries, ...stockQueries];
  const isFetching = queries.some(query => query.isFetching);
  const financialError = financialQueries.find(query => query.isError)?.error;
  const agendaError = podeVerAgenda ? agendaQueries.find(query => query.isError)?.error : undefined;
  const patientError = podeVerRelatorioPacientes ? patientQueries.find(query => query.isError)?.error : undefined;
  const stockError = stockQueries.find(query => query.isError)?.error;
  const financialLoading = financialQueries.some(query => query.isLoading);
  const agendaLoading = podeVerAgenda && agendaQueries.some(query => query.isLoading);
  const patientLoading = podeVerRelatorioPacientes && patientQueries.some(query => query.isLoading);
  const stockLoading = stockQueries.some(query => query.isLoading);
  const summaryLoading = summaryQueries.some(query => query.isLoading);
  const summaryError = podeVerAgenda
    ? financialError ?? agendaError
    : financialError;
  const activeQueries = activeTab === 'financeiro' || activeTab === 'dre'
    ? financialQueries
    : activeTab === 'atendimentos' || activeTab === 'medicos'
      ? agendaQueries
      : activeTab === 'status'
        ? [agendamentosQuery]
        : activeTab === 'pacientes'
          ? patientQueries
          : activeTab === 'estoque'
            ? stockQueries
            : [];
  const activeReportFetching = activeQueries.some(query => query.isFetching);
  const fontesNoLimite = [
    { nome: 'pacientes', total: pacientes.length },
    { nome: 'agendamentos', total: agendamentos.length },
    { nome: 'lançamentos', total: lancamentos.length },
    { nome: 'pagamentos', total: (pagamentosQuery.data ?? []).length },
    { nome: 'médicos', total: medicos.length },
    { nome: 'estoque', total: estoque.length },
  ].filter(fonte => fonte.total >= LIMITE_BUSCA_EM_BLOCOS).map(fonte => fonte.nome);
  if (lancamentosComHistoricoPagamentoQuery.data?.atingiuLimite) fontesNoLimite.push('histórico de pagamentos');

  // Filtrar dados pelo período
  const agendamentosFiltrados = useMemo(() => {
    return agendamentos.filter(a => {
      const data = parseDateOnly(a.data)!;
      return data >= periodoRange.start && data <= periodoRange.end;
    });
  }, [agendamentos, periodoRange]);

  const lancamentosFiltrados = useMemo(() => lancamentos.filter(l => {
    const dentroDoPeriodo = (data?: string | null) => {
      const dia = data?.slice(0, 10);
      return !!dia && dia >= inicioStr && dia <= fimStr;
    };
    return dentroDoPeriodo(l.data) || dentroDoPeriodo(l.data_pagamento) || dentroDoPeriodo(l.data_vencimento);
  }), [lancamentos, inicioStr, fimStr]);
  const pagamentos = pagamentosQuery.data ?? [];
  const eventosFinanceiros = useMemo<EventoFinanceiro[]>(() => {
    const lancamentosComPagamentos = new Set<string>([
      ...pagamentos.map((pagamento: any) => pagamento.lancamento_id),
      ...(lancamentosComHistoricoPagamentoQuery.data?.ids ?? []),
    ]);
    const eventosAntigos: EventoFinanceiro[] = lancamentosFiltrados
      .filter(l => ['pago', 'parcial'].includes(l.status) && !lancamentosComPagamentos.has(l.id))
      .map(l => ({
        id: l.id,
        lancamentoId: l.id,
        agendamentoId: l.agendamento_id || null,
        tipo: l.tipo,
        categoria: l.categoria || 'Outros',
        descricao: l.descricao,
        data: dateOnlyFromValue(l.data_pagamento || l.data),
        valor: valorRealizado(l),
        formaPagamento: l.forma_pagamento || null,
        observacoes: null,
        dataVencimento: l.data_vencimento || null,
        estornado: false,
      }))
      .filter(evento => evento.data >= inicioStr && evento.data <= fimStr);
    const eventosIndividuais: EventoFinanceiro[] = pagamentos.flatMap((pagamento: any) => {
      const conta = Array.isArray(pagamento.lancamentos) ? pagamento.lancamentos[0] : pagamento.lancamentos;
      if (!conta || !['receita', 'despesa'].includes(conta.tipo) || !pagamento.data_pagamento) return [];
      const eventos: EventoFinanceiro[] = [];
      const dataPagamento = dateOnlyFromValue(pagamento.data_pagamento);
      if (dataPagamento >= inicioStr && dataPagamento <= fimStr) eventos.push({
        id: pagamento.id,
        lancamentoId: pagamento.lancamento_id,
        agendamentoId: conta.agendamento_id || null,
        tipo: conta.tipo,
        categoria: conta.categoria || 'Outros',
        descricao: conta.descricao,
        data: dataPagamento,
        valor: Number(pagamento.valor),
        formaPagamento: pagamento.forma_pagamento || null,
        observacoes: pagamento.observacoes || null,
        dataVencimento: conta.data_vencimento || null,
        estornado: false,
      });
      if (pagamento.estornado_em) {
        const dataEstorno = dateOnlyFromValue(pagamento.estornado_em);
        if (dataEstorno >= inicioStr && dataEstorno <= fimStr) eventos.push({
          id: `${pagamento.id}:estorno`,
          lancamentoId: pagamento.lancamento_id,
          agendamentoId: conta.agendamento_id || null,
          tipo: conta.tipo,
          categoria: conta.categoria || 'Outros',
          descricao: conta.descricao,
          data: dataEstorno,
          valor: -Number(pagamento.valor),
          formaPagamento: pagamento.forma_pagamento || null,
          observacoes: pagamento.observacoes || null,
          dataVencimento: conta.data_vencimento || null,
          estornado: true,
        });
      }
      return eventos;
    });
    return [...eventosAntigos, ...eventosIndividuais];
  }, [lancamentosFiltrados, pagamentos, lancamentosComHistoricoPagamentoQuery.data, inicioStr, fimStr]);
  // Estatísticas gerais
  const estatisticas = useMemo(() => {
    const totalAtendimentos = agendamentosFiltrados.length;
    const atendimentosFinalizados = agendamentosFiltrados.filter(a => STATUS_FINALIZADO.has(a.status)).length;
    const cancelamentos = agendamentosFiltrados.filter(a => a.status === 'cancelado').length;
    const faltas = agendamentosFiltrados.filter(a => a.status === 'faltou').length;
    const atendimentosComDesfecho = atendimentosFinalizados + faltas;

    // Cada pagamento individual é lançado na data real; contas antigas sem
    // histórico filho usam o total realizado consolidado pela conta.
    const receitas = eventosFinanceiros
      .filter(evento => evento.tipo === 'receita')
      .reduce((acc, evento) => acc + evento.valor, 0);
    const eventosDeAtendimento = eventosFinanceiros.filter(evento => evento.tipo === 'receita' && evento.lancamentoId && evento.agendamentoId);
    const atendimentosComRecebimento = new Set(eventosDeAtendimento.map(evento => evento.agendamentoId));
    const receitaAtendimentos = eventosDeAtendimento.reduce((acc, evento) => acc + evento.valor, 0);

    const despesas = eventosFinanceiros
      .filter(evento => evento.tipo === 'despesa')
      .reduce((acc, evento) => acc + evento.valor, 0);

    // Pendente é o que ainda está em aberto: aqui `valor` é o certo.
    const pendentes = lancamentosFiltrados
      .filter(l => {
        const dia = (l.data_vencimento || l.data)?.slice(0, 10);
        return ['pendente', 'parcial', 'atrasado'].includes(l.status) && !!dia && dia >= inicioStr && dia <= fimStr;
      })
      .reduce((acc, l) => acc + saldoEmAberto(l), 0);

    const taxaComparecimento = atendimentosComDesfecho > 0
      ? Math.round((atendimentosFinalizados / atendimentosComDesfecho) * 100)
      : null;

    return {
      totalAtendimentos,
      atendimentosFinalizados,
      cancelamentos,
      faltas,
      atendimentosComDesfecho,
      receitas,
      receitaAtendimentos,
      atendimentosComRecebimento: atendimentosComRecebimento.size,
      ticketMedio: atendimentosComRecebimento.size > 0 ? receitaAtendimentos / atendimentosComRecebimento.size : null,
      despesas,
      lucro: receitas - despesas,
      pendentes,
      taxaComparecimento,
    };
  }, [agendamentosFiltrados, lancamentosFiltrados, eventosFinanceiros, inicioStr, fimStr]);

  // Dados por dia
  const dadosDiarios = useMemo(() => {
    const dias = eachDayOfInterval({
      start: periodoRange.start,
      end: periodoRange.end,
    });

    return dias.map(dia => {
      const diaStr = format(dia, 'yyyy-MM-dd');
      const atendimentos = agendamentosFiltrados.filter(a => a.data === diaStr).length;
      const eventosDoDia = eventosFinanceiros.filter(evento => evento.data === diaStr);
      const receita = eventosDoDia
        .filter(evento => evento.tipo === 'receita')
        .reduce((acc, evento) => acc + evento.valor, 0);
      const despesa = eventosDoDia
        .filter(evento => evento.tipo === 'despesa')
        .reduce((acc, evento) => acc + evento.valor, 0);

      return {
        data: format(dia, 'dd/MM'),
        atendimentos,
        receita,
        despesa,
      };
    });
  }, [agendamentosFiltrados, eventosFinanceiros, periodoRange]);

  // Dados por médico
  const dadosPorMedico = useMemo(() => {
    return medicos.map(medico => {
      const atendimentos = agendamentosFiltrados.filter(a => a.medico_id === medico.id).length;
      const finalizados = agendamentosFiltrados.filter(
        a => a.medico_id === medico.id && STATUS_FINALIZADO.has(a.status)
      ).length;

      return {
        nome: medico.nome || medico.crm,
        especialidade: medico.especialidade || 'Geral',
        atendimentos,
        finalizados,
        taxa: atendimentos > 0 ? Math.round((finalizados / atendimentos) * 100) : 0,
      };
    }).sort((a, b) => b.atendimentos - a.atendimentos);
  }, [medicos, agendamentosFiltrados]);

  // Dados por tipo de atendimento
  const dadosPorTipo = useMemo(() => {
    const tipos: Record<string, number> = {};
    agendamentosFiltrados.forEach(a => {
      const tipo = a.tipo || 'consulta';
      tipos[tipo] = (tipos[tipo] || 0) + 1;
    });
    return Object.entries(tipos).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }));
  }, [agendamentosFiltrados]);

  // Dados por forma de pagamento
  const dadosPorPagamento = useMemo(() => {
    const formas: Record<string, number> = {};
    eventosFinanceiros
      .filter(evento => evento.tipo === 'receita')
      .forEach(l => {
        const forma = l.formaPagamento || 'Não informado';
        formas[forma] = (formas[forma] || 0) + l.valor;
      });
    return Object.entries(formas).map(([name, value]) => ({
      name: name.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
      value,
    }));
  }, [eventosFinanceiros]);
  const categoriasDRE = [...new Set(eventosFinanceiros.map(evento => evento.categoria || 'Outros'))];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const obterRotuloPeriodo = () => {
    if (periodo === 'personalizado') {
      return `${format(parseDateOnly(inicioStr)!, 'dd/MM/yyyy')} a ${format(parseDateOnly(fimStr)!, 'dd/MM/yyyy')}`;
    }
    return ({
      mes_atual: 'Mês Atual',
      mes_anterior: 'Mês Anterior',
      ultimos_3_meses: 'Últimos 3 Meses',
      ultimos_6_meses: 'Últimos 6 Meses',
      ultimos_12_meses: 'Últimos 12 Meses',
      este_ano: `Ano de ${periodoRange.start.getFullYear()}`,
    } as Record<string, string>)[periodo] || periodo;
  };

  const lancamentosEmAberto = lancamentosFiltrados
    .filter(l => ['pendente', 'parcial', 'atrasado'].includes(l.status))
    .map(l => ({ lancamento: l, saldo: saldoEmAberto(l) }))
    .filter(item => item.saldo > 0);

  const linhasFinanceiras = [
    ...eventosFinanceiros.map(evento => ({
      data: evento.data,
      dataPagamento: evento.data,
      dataVencimento: evento.dataVencimento || '',
      tipo: evento.tipo,
      categoria: evento.categoria,
      descricao: `${evento.estornado ? 'Estorno — ' : ''}${evento.descricao}${evento.observacoes ? ` — ${evento.observacoes}` : ''}`,
      valor: Math.abs(evento.valor),
      valorPago: evento.valor,
      saldoAberto: 0,
      status: evento.estornado ? 'estornado' : 'pago',
      formaPagamento: evento.formaPagamento || '',
    })),
    ...lancamentosEmAberto.map(({ lancamento, saldo }) => ({
      data: lancamento.data,
      dataPagamento: '',
      dataVencimento: lancamento.data_vencimento || '',
      tipo: lancamento.tipo,
      categoria: lancamento.categoria || 'Outros',
      descricao: `${lancamento.descricao} — saldo em aberto`,
      valor: saldo,
      valorPago: 0,
      saldoAberto: saldo,
      status: lancamento.status || 'pendente',
      formaPagamento: lancamento.forma_pagamento || '',
    })),
  ];

  const executarExportacao = async (nome: string, acao: () => unknown | Promise<unknown>, fontes = ['lançamentos', 'pagamentos', 'histórico de pagamentos']) => {
    if (exportando) return;
    if (!podeExportarFontesCompletas(fontes, fontesNoLimite)) {
      toast.error(`Exportação de ${nome.toLowerCase()} bloqueada`, {
        description: 'Uma das fontes atingiu o limite de leitura. Ajuste o período ou os filtros antes de exportar.',
      });
      return;
    }
    setExportando(nome);
    try {
      await acao();
      toast.success(`${nome} exportado com sucesso.`);
    } catch (error) {
      toast.error(`Não foi possível exportar ${nome.toLowerCase()}.`, {
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    } finally {
      setExportando(null);
    }
  };

  const handleExportExcel = () => executarExportacao('Financeiro para Excel', () => exportarFinanceiro(linhasFinanceiras));

  const handleExportPDF = () => executarExportacao('Financeiro para PDF', async () => {
    const periodoLabel = obterRotuloPeriodo();

    const doc = await gerarRelatorioFinanceiro({
      periodo: periodoLabel,
      receitas: estatisticas.receitas,
      despesas: estatisticas.despesas,
      lucro: estatisticas.lucro,
      lancamentos: linhasFinanceiras.map(l => ({
        data: format(parseDateOnly(l.data)!, 'dd/MM/yyyy'),
        tipo: l.tipo,
        categoria: l.categoria,
        descricao: l.descricao,
        valor: l.valor,
        valorRealizado: l.valorPago,
        saldoAberto: l.saldoAberto,
        status: l.status,
      })),
    });
    openPDF(doc);
  });

  const handleExportAtendimentosPDF = () => executarExportacao('Atendimentos para PDF', async () => {
    const periodoLabel = obterRotuloPeriodo();

    const doc = await gerarRelatorioAtendimentos({
      periodo: periodoLabel,
      totalAtendimentos: estatisticas.totalAtendimentos,
      porMedico: dadosPorMedico,
      porTipo: dadosPorTipo.map(t => ({ tipo: t.name, quantidade: t.value })),
    });
    openPDF(doc);
  }, ['agendamentos', 'médicos']);

  const handleExportPacientesExcel = () => executarExportacao('Pacientes para Excel', () => {
    exportarPacientes(pacientes.map(p => ({
      nome: p.nome,
      cpf: p.cpf || '',
      dataNascimento: p.data_nascimento || '',
      telefone: p.telefone || '',
      email: p.email || '',
      sexo: p.sexo || '',
    })));
  }, ['pacientes']);

  const handleExportAgendamentosExcel = () => executarExportacao('Agenda para Excel', () => {
    exportarAgendamentos(agendamentosFiltrados.map(a => ({
      data: a.data,
      horaInicio: a.hora_inicio || '',
      horaFim: a.hora_fim || '',
      paciente: a.pacientes?.nome_social || a.pacientes?.nome || a.paciente_id || '—',
      medico: a.medicos?.nome || a.medico_id || '—',
      tipo: a.tipo || 'consulta',
      status: a.status || 'agendado',
    })));
  }, ['agendamentos', 'médicos']);

  const handleExportEstoqueExcel = () => executarExportacao('Estoque para Excel', () => {
    exportarEstoque(estoque.map(e => ({
      nome: e.nome,
      categoria: e.categoria,
      quantidade: e.quantidade,
      quantidadeMinima: e.quantidade_minima || 0,
      unidade: e.unidade || 'un',
      valorUnitario: Number(e.valor_unitario) || 0,
      fornecedor: e.fornecedor || '',
      validade: e.validade || '',
    })));
  }, ['estoque']);

  const refreshTudo = () => { for (const query of queries) void query.refetch(); };
  const refreshFinancial = () => { for (const query of financialQueries) void query.refetch(); };
  const refreshAgenda = () => { for (const query of agendaQueries) void query.refetch(); };
  const refreshPatients = () => { for (const query of patientQueries) void query.refetch(); };
  const refreshStock = () => { for (const query of stockQueries) void query.refetch(); };
  const refreshSummary = () => { for (const query of summaryQueries) void query.refetch(); };

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Relatórios da clínica"
        icon={<FileText />}
        description={activeTab === 'customizado'
          ? 'Monte um relatório escolhendo a fonte de dados, o período e os filtros.'
          : `${obterRotuloPeriodo()} · ${podeVerAgenda
            ? 'o período se aplica à agenda e ao financeiro; pacientes e estoque mostram o cadastro e o saldo atuais'
            : 'o período se aplica ao financeiro'}`}
        actions={
          activeTab !== 'customizado' && <>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/relatorios/salvos"><Bookmark className="h-4 w-4" aria-hidden="true" />Relatórios salvos</Link>
            </Button>
            {ehAdmin && <Button asChild variant="outline" className="gap-2">
              <Link to="/analytics"><LineChart className="h-4 w-4" aria-hidden="true" />Indicadores da clínica</Link>
            </Button>}
            <Button aria-label="Atualizar dados dos relatórios" variant="outline" size="icon" className="rounded-full" onClick={refreshTudo} disabled={isFetching}>
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  disabled={activeReportFetching || !!exportando}
                  className="gap-2"
                  aria-label="Exportar relatórios"
                >
                  <Download className="h-4 w-4" />
                  Exportar
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Opções de exportação</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={financialLoading || !!financialError || !podeExportarFontesCompletas(['lançamentos', 'pagamentos', 'histórico de pagamentos'], fontesNoLimite)} onSelect={handleExportExcel}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Financeiro em Excel
                </DropdownMenuItem>
                <DropdownMenuItem disabled={financialLoading || !!financialError || !podeExportarFontesCompletas(['lançamentos', 'pagamentos', 'histórico de pagamentos'], fontesNoLimite)} onSelect={handleExportPDF}>
                  <FileText className="mr-2 h-4 w-4" /> Financeiro em PDF
                </DropdownMenuItem>
                {podeVerAgenda && <DropdownMenuItem disabled={agendaLoading || !!agendaError || !podeExportarFontesCompletas(['agendamentos', 'médicos'], fontesNoLimite)} onSelect={handleExportAgendamentosExcel}>
                  <Calendar className="mr-2 h-4 w-4" /> Agenda em Excel
                </DropdownMenuItem>}
                {podeVerRelatorioPacientes && <DropdownMenuItem disabled={patientLoading || !!patientError || !podeExportarFontesCompletas(['pacientes'], fontesNoLimite)} onSelect={handleExportPacientesExcel}>
                  <Users className="mr-2 h-4 w-4" /> Pacientes em Excel
                </DropdownMenuItem>}
                <DropdownMenuItem disabled={stockLoading || !!stockError || !podeExportarFontesCompletas(['estoque'], fontesNoLimite)} onSelect={handleExportEstoqueExcel}>
                  <Package className="mr-2 h-4 w-4" /> Estoque em Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {/* Pílulas de período */}
      {activeTab !== 'customizado' && <div role="group" aria-label="Filtrar relatórios por período" className="flex flex-wrap items-center gap-2">
        {PERIODO_PILLS.map(pill => (
          <button
            key={pill.value}
            type="button"
            aria-pressed={periodo === pill.value}
            onClick={() => setPeriodo(pill.value)}
            className={cn(
              'h-8 rounded-full border px-3 text-xs font-medium transition-colors',
              periodo === pill.value
                ? 'border-transparent bg-primary text-primary-foreground shadow-sm'
                : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
          >
            {pill.label}
          </button>
        ))}
        {periodo === 'personalizado' && (
          <div className="flex items-center gap-1.5">
            <Input type="date" aria-label="Data inicial" className="h-8 w-36 rounded-full" value={customInicio} max={customFim || undefined} onChange={e => setCustomInicio(e.target.value)} />
            <span className="text-xs text-muted-foreground">até</span>
            <Input type="date" aria-label="Data final" className="h-8 w-36 rounded-full" value={customFim} min={customInicio || undefined} onChange={e => setCustomFim(e.target.value)} />
          </div>
        )}
      </div>}

      {activeTab !== 'customizado' && activeReportFetching && <p role="status" className="text-sm text-muted-foreground">Atualizando dados deste relatório…</p>}
      {exportando && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Gerando {exportando}…</p>}

      {activeTab !== 'customizado' && fontesNoLimite.length > 0 && <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>O limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} registros foi atingido em: {fontesNoLimite.join(', ')}. Indicadores e exportações dessas fontes podem estar incompletos.</p></div>}

      {activeTab !== 'customizado' && <section aria-label="Resumo do período" className="overflow-hidden rounded-xl border border-border bg-card">
        <ReportDataBoundary title="o resumo do período" loading={summaryLoading} error={summaryError} onRetry={refreshSummary}>
        <div className={cn('grid grid-cols-2 md:grid-cols-4', podeVerAgenda ? 'grid-cols-2' : 'md:grid-cols-3')}>
          {podeVerAgenda && <button
            type="button"
            aria-pressed={activeTab === 'atendimentos'}
            onClick={() => setActiveTab('atendimentos')}
            className="flex min-h-20 items-center gap-3 border-b border-r border-border px-4 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-pressed:bg-primary/5"
          >
            <Calendar className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">Atendimentos</span>
              <span className="block text-xl font-semibold tabular-nums">{estatisticas.totalAtendimentos}</span>
              <span className="block text-xs text-muted-foreground">{estatisticas.atendimentosFinalizados} finalizados</span>
            </span>
          </button>}
          <button
            type="button"
            aria-pressed={activeTab === 'financeiro'}
            onClick={() => setActiveTab('financeiro')}
            className="flex min-h-20 items-center gap-3 border-b border-r border-border px-4 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-pressed:bg-primary/5"
          >
            <TrendingUp className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">Receitas</span>
              <span className="block text-lg font-semibold tabular-nums text-success">{formatCurrency(estatisticas.receitas)}</span>
            </span>
          </button>
          <button
            type="button"
            aria-pressed={activeTab === 'financeiro'}
            onClick={() => setActiveTab('financeiro')}
            className="flex min-h-20 items-center gap-3 border-b border-r border-border px-4 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-pressed:bg-primary/5"
          >
            <TrendingDown className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">Despesas</span>
              <span className="block text-lg font-semibold tabular-nums text-destructive">{formatCurrency(estatisticas.despesas)}</span>
            </span>
          </button>
          <button
            type="button"
            aria-pressed={activeTab === 'dre'}
            onClick={() => setActiveTab('dre')}
            className="flex min-h-20 items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-pressed:bg-primary/5"
          >
            <DollarSign className={cn('h-4 w-4 shrink-0', estatisticas.lucro < 0 ? 'text-destructive' : estatisticas.lucro > 0 ? 'text-success' : 'text-muted-foreground')} aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">Resultado</span>
              <span className={cn('block text-lg font-semibold tabular-nums', estatisticas.lucro < 0 ? 'text-destructive' : estatisticas.lucro > 0 ? 'text-success' : 'text-foreground')}>
                {formatCurrency(estatisticas.lucro)}
              </span>
            </span>
          </button>
        </div>
        <dl className={cn('grid grid-cols-2 gap-x-6 gap-y-3 bg-muted/20 px-4 py-3 md:grid-cols-4', !podeVerAgenda && 'md:grid-cols-1')}>
          {podeVerAgenda && <div>
            <dt className="text-xs text-muted-foreground">Comparecimento</dt>
            <dd className="font-semibold tabular-nums">{estatisticas.taxaComparecimento === null ? '—' : `${estatisticas.taxaComparecimento}%`}</dd>
            <p className="text-xs text-muted-foreground">{estatisticas.atendimentosComDesfecho} desfechos; sem cancelados e futuros</p>
          </div>}
          {podeVerAgenda && <div>
            <dt className="text-xs text-muted-foreground">Ticket médio</dt>
            <dd className="font-semibold tabular-nums">{estatisticas.ticketMedio === null ? '—' : formatCurrency(estatisticas.ticketMedio)}</dd>
            <p className="text-xs text-muted-foreground">Por atendimento com recebimento</p>
          </div>}
          {podeVerAgenda && <div>
            <dt className="text-xs text-muted-foreground">Cancelamentos</dt>
            <dd className="font-semibold tabular-nums text-destructive">{estatisticas.cancelamentos}</dd>
          </div>}
          <div>
            <dt className="text-xs text-muted-foreground">Valores pendentes</dt>
            <dd className="font-semibold tabular-nums text-destructive">{formatCurrency(estatisticas.pendentes)}</dd>
            <p className="text-xs text-muted-foreground">Saldo com vencimento no período</p>
          </div>
        </dl>
        </ReportDataBoundary>
      </section>}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="h-auto w-full max-w-full flex-wrap justify-start gap-1 overflow-visible rounded-xl">
          <TabsTrigger value="customizado">Relatório customizado</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="dre">DRE</TabsTrigger>
          {podeVerAgenda && <TabsTrigger value="atendimentos">Atendimentos</TabsTrigger>}
          {podeVerAgenda && <TabsTrigger value="medicos">Por Médico</TabsTrigger>}
          {podeVerRelatorioPacientes && <TabsTrigger value="pacientes">Pacientes</TabsTrigger>}
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
          {podeVerAgenda && <TabsTrigger value="status">Status</TabsTrigger>}
        </TabsList>

        <TabsContent value="customizado" className="space-y-6">
          <RelatorioCustomizado />
        </TabsContent>

        <TabsContent value="financeiro" className="space-y-6">
          <ReportDataBoundary title="os dados financeiros" loading={financialLoading} error={financialError} onRetry={refreshFinancial}>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Gráfico de Receitas x Despesas */}
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle>Receitas x Despesas</CardTitle>
                <CardDescription>Comparativo diário</CardDescription>
              </CardHeader>
              <CardContent>
                {eventosFinanceiros.length === 0 ? <ChartEmptyState message="Sem movimentações financeiras no período." /> : <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dadosDiarios}>
                      <defs>
                        <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorDespesa" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                      <XAxis dataKey="data" fontSize={12} />
                      <YAxis fontSize={12} tickFormatter={(v) => `R$${v}`} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="receita"
                        stroke="hsl(var(--success))"
                        fill="url(#colorReceita)"
                        name="Receita"
                      />
                      <Area
                        type="monotone"
                        dataKey="despesa"
                        stroke="hsl(var(--destructive))"
                        fill="url(#colorDespesa)"
                        name="Despesa"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>}
              </CardContent>
            </Card>

            {/* Gráfico de Formas de Pagamento */}
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle>Formas de Pagamento</CardTitle>
                <CardDescription>Recebimentos líquidos por forma de pagamento, incluindo estornos na data em que ocorreram.</CardDescription>
              </CardHeader>
              <CardContent>
                {!dadosPorPagamento.some(item => item.value !== 0) ? <ChartEmptyState message="Sem recebimentos líquidos por forma de pagamento no período." /> : <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dadosPorPagamento} layout="vertical" margin={{ left: 8, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                      <XAxis type="number" fontSize={11} tickFormatter={value => formatCurrency(Number(value))} />
                      <YAxis type="category" dataKey="name" width={108} fontSize={11} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Bar dataKey="value" name="Recebimentos líquidos" barSize={24} radius={[0, 4, 4, 0]}>
                        {dadosPorPagamento.map(item => (
                          <Cell key={item.name} fill={item.value < 0 ? 'hsl(var(--destructive))' : 'hsl(var(--primary))'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>}
              </CardContent>
            </Card>
          </div>
          </ReportDataBoundary>
        </TabsContent>

        {/* DRE - Demonstrativo de Resultado */}
        <TabsContent value="dre" className="space-y-6">
          <ReportDataBoundary title="os dados financeiros" loading={financialLoading} error={financialError} onRetry={refreshFinancial}>
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-primary" />
                DRE Simplificado
              </CardTitle>
              <CardDescription>Demonstrativo de Resultado do Exercício por Categoria</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const receitasPorCategoria: Record<string, number> = {};
                const despesasPorCategoria: Record<string, number> = {};
                eventosFinanceiros.forEach(l => {
                  const cat = l.categoria || 'Outros';
                  const val = l.valor;
                  if (l.tipo === 'receita') {
                    receitasPorCategoria[cat] = (receitasPorCategoria[cat] || 0) + val;
                  } else if (l.tipo === 'despesa') {
                    despesasPorCategoria[cat] = (despesasPorCategoria[cat] || 0) + val;
                  }
                });

                const totalReceitas = Object.values(receitasPorCategoria).reduce((a, b) => a + b, 0);
                const totalDespesas = Object.values(despesasPorCategoria).reduce((a, b) => a + b, 0);
                const resultado = totalReceitas - totalDespesas;

                return (
                  <div className="space-y-6">
                    {/* Receitas */}
                    <div>
                      <h3 className="text-sm font-semibold text-success flex items-center gap-2 mb-3">
                        <TrendingUp className="h-4 w-4" /> RECEITAS
                      </h3>
                      <div className="space-y-2">
                        {Object.entries(receitasPorCategoria)
                          .sort(([, a], [, b]) => b - a)
                          .map(([cat, val]) => (
                            <div key={cat} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/30">
                              <span className="text-sm capitalize">{cat.replace(/_/g, ' ')}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] text-muted-foreground tabular-nums">
                                  {totalReceitas > 0 ? Math.round((val / totalReceitas) * 100) : 0}%
                                </span>
                                <span className="text-sm font-semibold tabular-nums text-success">{formatCurrency(val)}</span>
                              </div>
                            </div>
                          ))}
                        {Object.keys(receitasPorCategoria).length === 0 && (
                          <p className="text-sm text-muted-foreground py-2">Nenhuma receita no período</p>
                        )}
                        <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-success/10 border border-success/20 font-bold">
                          <span className="text-sm">Total Receitas</span>
                          <span className="tabular-nums text-success">{formatCurrency(totalReceitas)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Despesas */}
                    <div>
                      <h3 className="text-sm font-semibold text-destructive flex items-center gap-2 mb-3">
                        <TrendingDown className="h-4 w-4" /> DESPESAS
                      </h3>
                      <div className="space-y-2">
                        {Object.entries(despesasPorCategoria)
                          .sort(([, a], [, b]) => b - a)
                          .map(([cat, val]) => (
                            <div key={cat} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/30">
                              <span className="text-sm capitalize">{cat.replace(/_/g, ' ')}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] text-muted-foreground tabular-nums">
                                  {totalDespesas > 0 ? Math.round((val / totalDespesas) * 100) : 0}%
                                </span>
                                <span className="text-sm font-semibold tabular-nums text-destructive">-{formatCurrency(val)}</span>
                              </div>
                            </div>
                          ))}
                        {Object.keys(despesasPorCategoria).length === 0 && (
                          <p className="text-sm text-muted-foreground py-2">Nenhuma despesa no período</p>
                        )}
                        <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-destructive/10 border border-destructive/20 font-bold">
                          <span className="text-sm">Total Despesas</span>
                          <span className="tabular-nums text-destructive">{totalDespesas > 0 ? `-${formatCurrency(totalDespesas)}` : formatCurrency(totalDespesas)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Resultado */}
                    <div className={cn(
                      'flex items-center justify-between py-3 px-4 rounded-xl border-2 font-bold text-lg',
                      resultado > 0
                        ? 'bg-success/10 border-success/30 text-success'
                        : resultado < 0
                          ? 'bg-destructive/10 border-destructive/30 text-destructive'
                          : 'bg-muted/30 border-border text-muted-foreground'
                    )}>
                      <span className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5" />
                        RESULTADO DO PERÍODO
                        <span className="text-xs font-normal opacity-70">
                          (margem: {totalReceitas > 0 ? `${Math.round((resultado / totalReceitas) * 100)}%` : '—'})
                        </span>
                      </span>
                      <span className="tabular-nums">{formatCurrency(resultado)}</span>
                    </div>

                    {/* Chart */}
                    {categoriasDRE.length === 0 ? <ChartEmptyState message="Sem receitas ou despesas por categoria no período." /> : <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={(() => {
                          const allCats = new Set([
                            ...Object.keys(receitasPorCategoria),
                            ...Object.keys(despesasPorCategoria),
                          ]);
                          return Array.from(allCats).map(cat => ({
                            categoria: cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                            receita: receitasPorCategoria[cat] || 0,
                            despesa: -(despesasPorCategoria[cat] || 0),
                          }));
                        })()}>
                          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                          <XAxis dataKey="categoria" fontSize={11} />
                          <YAxis fontSize={11} tickFormatter={(v) => `R$${Math.abs(v)}`} />
                          <Tooltip formatter={(value: number) => formatCurrency(Math.abs(value))} />
                          <Legend />
                          <Bar dataKey="receita" fill="hsl(var(--success))" name="Receita" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="despesa" fill="hsl(var(--destructive))" name="Despesa" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
          </ReportDataBoundary>
        </TabsContent>

        {podeVerAgenda && <TabsContent value="atendimentos" className="space-y-6">
          <ReportDataBoundary title="a agenda" loading={agendaLoading} error={agendaError} onRetry={refreshAgenda}>
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleExportAtendimentosPDF} disabled={agendaLoading || !!agendaError || !!exportando || !podeExportarFontesCompletas(['agendamentos', 'médicos'], fontesNoLimite)} className="gap-2 rounded-full">
              <FileText className="h-4 w-4" />
              Exportar PDF
            </Button>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Gráfico de Atendimentos */}
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle>Volume de Atendimentos</CardTitle>
                <CardDescription>Por dia</CardDescription>
              </CardHeader>
              <CardContent>
                {agendamentosFiltrados.length === 0 ? <ChartEmptyState message="Sem atendimentos no período selecionado." /> : <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dadosDiarios}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                      <XAxis dataKey="data" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip />
                      <Bar dataKey="atendimentos" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="Atendimentos" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>}
              </CardContent>
            </Card>

            {/* Por Tipo */}
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle>Por Tipo de Atendimento</CardTitle>
                <CardDescription>Distribuição por categoria</CardDescription>
              </CardHeader>
              <CardContent>
                {dadosPorTipo.length === 0 ? <ChartEmptyState message="Sem tipos de atendimento no período selecionado." /> : <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dadosPorTipo}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {dadosPorTipo.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>}
              </CardContent>
            </Card>
          </div>
          </ReportDataBoundary>
        </TabsContent>}

        {podeVerAgenda && <TabsContent value="medicos" className="space-y-6">
          <ReportDataBoundary title="a agenda" loading={agendaLoading} error={agendaError} onRetry={refreshAgenda}>
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>Desempenho por Médico</CardTitle>
              <CardDescription>Atendimentos realizados no período</CardDescription>
            </CardHeader>
            <CardContent>
              {dadosPorMedico.length === 0 ? (
                <ActionableEmptyState
                  icon={BarChart2}
                  title="Nenhum atendimento no período"
                  description="Ajuste o período selecionado para ver o desempenho dos médicos."
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Médico</TableHead>
                        <TableHead>Especialidade</TableHead>
                        <TableHead className="text-right">Agendados</TableHead>
                        <TableHead className="text-right">Finalizados</TableHead>
                        <TableHead className="text-right">Taxa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dadosPorMedico.map((medico, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{medico.nome}</TableCell>
                          <TableCell>{medico.especialidade}</TableCell>
                          <TableCell className="text-right">{medico.atendimentos}</TableCell>
                          <TableCell className="text-right">{medico.finalizados}</TableCell>
                          <TableCell className="text-right">
                            <Badge className={cn(
                              'rounded-full',
                              medico.taxa >= 80 && 'bg-success/10 text-success',
                              medico.taxa >= 50 && medico.taxa < 80 && 'bg-warning/10 text-warning-foreground',
                              medico.taxa < 50 && 'bg-destructive/10 text-destructive'
                            )}>
                              {medico.taxa}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          </ReportDataBoundary>
        </TabsContent>}

        {podeVerRelatorioPacientes && <TabsContent value="pacientes" className="space-y-6">
          <ReportDataBoundary title="os pacientes" loading={patientLoading} error={patientError} onRetry={refreshPatients}>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="shadow-xs">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Total de Pacientes</p>
                <p className="text-2xl font-bold">{pacientes.length}</p>
              </CardContent>
            </Card>
            <Card className="shadow-xs">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Com Convênio</p>
                <p className="text-2xl font-bold">{pacientes.filter(p => p.convenio_id).length}</p>
              </CardContent>
            </Card>
            <Card className="shadow-xs">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Com Alergias</p>
                <p className="text-2xl font-bold text-destructive">
                  {pacientes.filter(p => p.alergias && p.alergias.length > 0).length}
                </p>
              </CardContent>
            </Card>
          </div>
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>Distribuição por Sexo</CardTitle>
            </CardHeader>
            <CardContent>
              {pacientes.length === 0 ? <ChartEmptyState message="Ainda não há pacientes para esta distribuição." /> : <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={(() => {
                        const sexos: Record<string, number> = {};
                        pacientes.forEach(p => {
                          const s = p.sexo || 'Não informado';
                          sexos[s] = (sexos[s] || 0) + 1;
                        });
                        return Object.entries(sexos).map(([name, value]) => ({
                          name: name === 'M' ? 'Masculino' : name === 'F' ? 'Feminino' : name,
                          value,
                        }));
                      })()}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {[0, 1, 2, 3].map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>}
            </CardContent>
          </Card>
          </ReportDataBoundary>
        </TabsContent>}

        <TabsContent value="estoque" className="space-y-6">
          <ReportDataBoundary title="o estoque" loading={stockLoading} error={stockError} onRetry={refreshStock}>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="shadow-xs">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Itens em Estoque</p>
                <p className="text-2xl font-bold">{estoque.length}</p>
              </CardContent>
            </Card>
            <Card className="shadow-xs">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Estoque Crítico</p>
                <p className="text-2xl font-bold text-destructive">
                  {estoque.filter(e => e.quantidade <= (e.quantidade_minima || 0)).length}
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-xs">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Valor Total</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(estoque.reduce((acc, e) => acc + (e.quantidade * (e.valor_unitario || 0)), 0))}
                </p>
              </CardContent>
            </Card>
          </div>
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>Itens com Estoque Crítico</CardTitle>
              <CardDescription>Abaixo da quantidade mínima</CardDescription>
            </CardHeader>
            <CardContent>
              {estoque.filter(e => e.quantidade <= (e.quantidade_minima || 0)).length === 0 ? (
                <ActionableEmptyState
                  icon={Package}
                  title="Nenhum item com estoque crítico"
                  description="Todos os itens estão acima da quantidade mínima configurada."
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">Qtd. Atual</TableHead>
                        <TableHead className="text-right">Qtd. Mínima</TableHead>
                        <TableHead className="text-right">Valor Unit.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {estoque
                        .filter(e => e.quantidade <= (e.quantidade_minima || 0))
                        .sort((a, b) => a.quantidade - b.quantidade)
                        .map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.nome}</TableCell>
                            <TableCell>{item.categoria}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="destructive" className="rounded-full">{item.quantidade}</Badge>
                            </TableCell>
                            <TableCell className="text-right">{item.quantidade_minima || 0}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.valor_unitario || 0)}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>Distribuição por Categoria</CardTitle>
            </CardHeader>
            <CardContent>
              {estoque.length === 0 ? <ChartEmptyState message="Ainda não há itens cadastrados para esta distribuição." /> : <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(() => {
                    const cats: Record<string, number> = {};
                    estoque.forEach(e => {
                      cats[e.categoria] = (cats[e.categoria] || 0) + 1;
                    });
                    return Object.entries(cats).map(([name, value]) => ({ name, quantidade: value }));
                  })()}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="quantidade" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="Itens" />
                  </BarChart>
                </ResponsiveContainer>
              </div>}
            </CardContent>
          </Card>
          </ReportDataBoundary>
        </TabsContent>

        {podeVerAgenda && <TabsContent value="status" className="space-y-6">
          <ReportDataBoundary title="a agenda" loading={agendamentosQuery.isLoading} error={agendamentosQuery.error} onRetry={() => { void agendamentosQuery.refetch(); }}>
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>Distribuição por Status</CardTitle>
              <CardDescription>Status dos agendamentos no período</CardDescription>
            </CardHeader>
            <CardContent>
              {agendamentosFiltrados.length === 0 ? <ChartEmptyState message="Sem agendamentos no período selecionado." /> : <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(() => {
                    const statusCount: Record<string, number> = {};
                    agendamentosFiltrados.forEach(a => {
                      const s = a.status || 'agendado';
                      statusCount[s] = (statusCount[s] || 0) + 1;
                    });
                    return Object.entries(statusCount).map(([name, value]) => ({
                      name: name.charAt(0).toUpperCase() + name.slice(1).replace('_', ' '),
                      quantidade: value,
                    }));
                  })()}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="quantidade" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="Quantidade" />
                  </BarChart>
                </ResponsiveContainer>
              </div>}
            </CardContent>
          </Card>
          </ReportDataBoundary>
        </TabsContent>}
      </Tabs>
    </div>
  );
}
