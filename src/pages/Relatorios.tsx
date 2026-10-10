import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, startOfMonth, endOfMonth, subMonths, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  FileText,
  Calendar,
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  FileSpreadsheet,
Download, Printer, BarChart2, Activity, AlertTriangle} from 'lucide-react';
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
import { usePacientes, useAgendamentosPeriodo, useSupabaseQuery, useEstoque } from '@/hooks/useSupabaseData';
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
import { ErrorState } from '@/components/ErrorState';
import { dateOnlyInTimeZone, inicioDoDiaEmFusoIso, parseDateOnly } from '@/lib/dateOnly';
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

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))', 'hsl(var(--info))'];
const STATUS_FINALIZADO = new Set(['finalizado', 'atendimento_finalizado']);
const dateOnlyFromValue = (value: string) => value.includes('T') || value.includes(' ')
  ? dateOnlyInTimeZone(new Date(value), 'America/Sao_Paulo')
  : value.slice(0, 10);
const saldoEmAberto = (lancamento: { valor: number; valor_pago: number | null; desconto?: number | null; acrescimo?: number | null }) =>
  Math.max(0, Number(lancamento.valor || 0) - Number(lancamento.desconto || 0)
    + Number(lancamento.acrescimo || 0) - Number(lancamento.valor_pago || 0));

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

export default function Relatorios() {
  const [periodo, setPeriodo] = useState('mes_atual');
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
  const pacientesQuery = usePacientes();
  const pacientes = pacientesQuery.data ?? [];
  const agendamentosQuery = useAgendamentosPeriodo(inicioStr, fimStr, { enabled: podeVerAgenda, keepPrevious: true });
  const agendamentos = agendamentosQuery.data ?? [];
  const lancamentosEmitidosQuery = useSupabaseQuery<any>('lancamentos', {
    orderBy: { column: 'data', ascending: false },
    filters: [
      { column: 'data', operator: 'gte', value: inicioStr },
      { column: 'data', operator: 'lte', value: fimStr },
    ],
    keepPrevious: true,
  });
  const lancamentosPagosQuery = useSupabaseQuery<any>('lancamentos', {
    orderBy: { column: 'data_pagamento', ascending: false },
    filters: [
      { column: 'data_pagamento', operator: 'gte', value: inicioStr },
      { column: 'data_pagamento', operator: 'lte', value: fimStr },
    ],
    keepPrevious: true,
  });
  const lancamentosVencidosQuery = useSupabaseQuery<any>('lancamentos', {
    orderBy: { column: 'data_vencimento', ascending: false },
    filters: [
      { column: 'data_vencimento', operator: 'gte', value: inicioStr },
      { column: 'data_vencimento', operator: 'lte', value: fimStr },
    ],
    keepPrevious: true,
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
  });
  const medicosQuery = useSupabaseQuery<any>('medicos', {
    orderBy: { column: 'nome', ascending: true },
    enabled: podeVerAgenda,
  });
  const medicos = medicosQuery.data ?? [];
  const estoqueQuery = useEstoque();
  const estoque = estoqueQuery.data ?? [];

  const queries = [pacientesQuery, ...(podeVerAgenda ? [agendamentosQuery, medicosQuery] : []), lancamentosEmitidosQuery, lancamentosPagosQuery, lancamentosVencidosQuery, pagamentosQuery, lancamentosComHistoricoPagamentoQuery, estoqueQuery];
  const isLoading = queries.some(query => query.isLoading);
  const isFetching = queries.some(query => query.isFetching);
  const failedQuery = queries.find(query => query.isError);
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
  const vencimentosNoPeriodo = (l: any) => {
    const dia = (l.data_vencimento || l.data)?.slice(0, 10);
    return !!dia && dia >= inicioStr && dia <= fimStr;
  };

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
      .filter(l => ['pendente', 'parcial', 'atrasado'].includes(l.status) && vencimentosNoPeriodo(l))
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
  }, [agendamentosFiltrados, lancamentosFiltrados, eventosFinanceiros, inicioStr, fimStr, pagamentos]);

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

  const executarExportacao = async (nome: string, acao: () => unknown | Promise<unknown>) => {
    if (exportando) return;
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
  });

  const handleExportPacientesExcel = () => executarExportacao('Pacientes para Excel', () => {
    exportarPacientes(pacientes.map(p => ({
      nome: p.nome,
      cpf: p.cpf || '',
      dataNascimento: p.data_nascimento || '',
      telefone: p.telefone || '',
      email: p.email || '',
      sexo: p.sexo || '',
    })));
  });

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
  });

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
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (failedQuery) {
    return <ErrorState title="Não foi possível montar os relatórios" description="Uma ou mais fontes de dados falharam. Os números e exportações foram pausados para evitar relatórios incompletos." error={failedQuery.error} onRetry={() => { for (const query of queries) void query.refetch(); }} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Relatórios da clínica</h1>
          <p className="text-muted-foreground">Consulte dados por área, exporte arquivos ou salve relatórios personalizados. Para acompanhar tendências em painel, use Indicadores da clínica.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {podeVerAgenda
              ? 'O período se aplica à agenda e ao financeiro. Pacientes e estoque mostram o cadastro e o saldo atuais.'
              : 'O período se aplica ao financeiro. Pacientes e estoque mostram o cadastro e o saldo atuais.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mes_atual">Mês Atual</SelectItem>
              <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
              <SelectItem value="ultimos_3_meses">Últimos 3 Meses</SelectItem>
              <SelectItem value="ultimos_6_meses">Últimos 6 Meses</SelectItem>
              <SelectItem value="ultimos_12_meses">Últimos 12 Meses</SelectItem>
              <SelectItem value="este_ano">Este Ano</SelectItem>
              <SelectItem value="personalizado">Personalizado...</SelectItem>
            </SelectContent>
          </Select>
          {periodo === 'personalizado' && (
            <div className="flex items-center gap-1.5">
              <Input type="date" aria-label="Data inicial" className="w-40" value={customInicio} max={customFim || undefined} onChange={e => setCustomInicio(e.target.value)} />
              <span className="text-sm text-muted-foreground">até</span>
              <Input type="date" aria-label="Data final" className="w-40" value={customFim} min={customInicio || undefined} onChange={e => setCustomFim(e.target.value)} />
            </div>
          )}
          <Button variant="outline" onClick={handleExportExcel} disabled={isFetching || !!exportando} className="gap-2" aria-label="Exportar financeiro para Excel">
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
          <Button variant="outline" onClick={handleExportPDF} disabled={isFetching || !!exportando} className="gap-2" aria-label="Exportar financeiro para PDF">
            <FileText className="h-4 w-4" />
            PDF
          </Button>
          <Button variant="outline" onClick={handleExportPacientesExcel} disabled={isFetching || !!exportando} className="gap-2" aria-label="Exportar pacientes para Excel">
            <Users className="h-4 w-4" />
            Pacientes
          </Button>
          {podeVerAgenda && (
            <Button variant="outline" onClick={handleExportAgendamentosExcel} disabled={isFetching || !!exportando} className="gap-2" aria-label="Exportar agendamentos para Excel">
              <Calendar className="h-4 w-4" />
              Agenda
            </Button>
          )}
          <Button variant="outline" onClick={handleExportEstoqueExcel} disabled={isFetching || !!exportando} className="gap-2" aria-label="Exportar estoque para Excel">
            <FileSpreadsheet className="h-4 w-4" />
            Estoque
          </Button>
        </div>
      </div>

      {isFetching && <p role="status" className="text-sm text-muted-foreground">Atualizando dados do relatório…</p>}
      {exportando && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Gerando {exportando}…</p>}

      {fontesNoLimite.length > 0 && <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>O limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} registros foi atingido em: {fontesNoLimite.join(', ')}. Indicadores e exportações dessas fontes podem estar incompletos.</p></div>}

      {/* Cards de Resumo */}
      <div className={cn('grid gap-4 md:grid-cols-2', podeVerAgenda ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
        {podeVerAgenda && <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-info/10">
                <Calendar className="h-6 w-6 text-info" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Atendimentos</p>
                <p className="text-2xl font-bold">{estatisticas.totalAtendimentos}</p>
                <p className="text-xs text-muted-foreground">
                  {estatisticas.atendimentosFinalizados} finalizados
                </p>
              </div>
            </div>
          </CardContent>
        </Card>}

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-success/10">
                <TrendingUp className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Receitas</p>
                <p className="text-2xl font-bold text-success">
                  {formatCurrency(estatisticas.receitas)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-destructive/10">
                <TrendingDown className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Despesas</p>
                <p className="text-2xl font-bold text-destructive">
                  {formatCurrency(estatisticas.despesas)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Lucro</p>
                <p className={cn(
                  'text-2xl font-bold',
                  estatisticas.lucro >= 0 ? 'text-success' : 'text-destructive'
                )}>
                  {formatCurrency(estatisticas.lucro)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPIs Extras */}
      <div className={cn('grid gap-4', podeVerAgenda ? 'md:grid-cols-4' : 'md:grid-cols-1')}>
        {podeVerAgenda && <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Taxa Comparecimento</p>
            <p className="text-2xl font-bold text-primary">{estatisticas.taxaComparecimento === null ? '—' : `${estatisticas.taxaComparecimento}%`}</p>
            <p className="mt-1 text-xs text-muted-foreground">Base: {estatisticas.atendimentosComDesfecho} desfechos; exclui cancelados e futuros.</p>
          </CardContent>
        </Card>}
        {podeVerAgenda && <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Ticket Médio</p>
            <p className="text-2xl font-bold">
              {estatisticas.ticketMedio === null ? '—' : formatCurrency(estatisticas.ticketMedio)}
            </p>
            <p className="text-xs text-muted-foreground">Por atendimento com recebimento no período</p>
          </CardContent>
        </Card>}
        {podeVerAgenda && <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Cancelamentos</p>
            <p className="text-2xl font-bold text-destructive">{estatisticas.cancelamentos}</p>
          </CardContent>
        </Card>}
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Valores Pendentes</p>
            <p className="text-2xl font-bold text-destructive">{formatCurrency(estatisticas.pendentes)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Saldo de contas com vencimento no período</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="customizado" className="space-y-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="customizado">⚡ Customizado</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="dre">DRE</TabsTrigger>
          {podeVerAgenda && <TabsTrigger value="atendimentos">Atendimentos</TabsTrigger>}
          {podeVerAgenda && <TabsTrigger value="medicos">Por Médico</TabsTrigger>}
          <TabsTrigger value="pacientes">Pacientes</TabsTrigger>
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
          {podeVerAgenda && <TabsTrigger value="status">Status</TabsTrigger>}
        </TabsList>

        <TabsContent value="customizado" className="space-y-6">
          <RelatorioCustomizado />
        </TabsContent>

        <TabsContent value="financeiro" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Gráfico de Receitas x Despesas */}
            <Card>
              <CardHeader>
                <CardTitle>Receitas x Despesas</CardTitle>
                <CardDescription>Comparativo diário</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
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
                      <CartesianGrid strokeDasharray="3 3" />
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
                </div>
              </CardContent>
            </Card>

            {/* Gráfico de Formas de Pagamento */}
            <Card>
              <CardHeader>
                <CardTitle>Formas de Pagamento</CardTitle>
                <CardDescription>Recebimentos líquidos por forma de pagamento, incluindo estornos na data em que ocorreram.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dadosPorPagamento}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {dadosPorPagamento.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* DRE - Demonstrativo de Resultado */}
        <TabsContent value="dre" className="space-y-6">
          <Card>
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
                          <span className="tabular-nums text-destructive">-{formatCurrency(totalDespesas)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Resultado */}
                    <div className={cn(
                      'flex items-center justify-between py-3 px-4 rounded-xl border-2 font-bold text-lg',
                      resultado >= 0
                        ? 'bg-success/10 border-success/30 text-success'
                        : 'bg-destructive/10 border-destructive/30 text-destructive'
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
                    <div className="h-[300px]">
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
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="categoria" fontSize={11} />
                          <YAxis fontSize={11} tickFormatter={(v) => `R$${Math.abs(v)}`} />
                          <Tooltip formatter={(value: number) => formatCurrency(Math.abs(value))} />
                          <Legend />
                          <Bar dataKey="receita" fill="hsl(var(--success))" name="Receita" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="despesa" fill="hsl(var(--destructive))" name="Despesa" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {podeVerAgenda && <TabsContent value="atendimentos" className="space-y-6">
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleExportAtendimentosPDF} disabled={isFetching || !!exportando} className="gap-2">
              <FileText className="h-4 w-4" />
              Exportar PDF
            </Button>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Gráfico de Atendimentos */}
            <Card>
              <CardHeader>
                <CardTitle>Volume de Atendimentos</CardTitle>
                <CardDescription>Por dia</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dadosDiarios}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="data" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip />
                      <Bar dataKey="atendimentos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Atendimentos" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Por Tipo */}
            <Card>
              <CardHeader>
                <CardTitle>Por Tipo de Atendimento</CardTitle>
                <CardDescription>Distribuição por categoria</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
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
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>}

        {podeVerAgenda && <TabsContent value="medicos" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Desempenho por Médico</CardTitle>
              <CardDescription>Atendimentos realizados no período</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
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
                    {dadosPorMedico.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Nenhum atendimento no período
                        </TableCell>
                      </TableRow>
                    ) : (
                      dadosPorMedico.map((medico, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{medico.nome}</TableCell>
                          <TableCell>{medico.especialidade}</TableCell>
                          <TableCell className="text-right">{medico.atendimentos}</TableCell>
                          <TableCell className="text-right">{medico.finalizados}</TableCell>
                          <TableCell className="text-right">
                            <Badge className={cn(
                              medico.taxa >= 80 && 'bg-success/10 text-success',
                              medico.taxa >= 50 && medico.taxa < 80 && 'bg-warning/10 text-warning',
                              medico.taxa < 50 && 'bg-destructive/10 text-destructive'
                            )}>
                              {medico.taxa}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>}

        <TabsContent value="pacientes" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Total de Pacientes</p>
                <p className="text-2xl font-bold">{pacientes.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Com Convênio</p>
                <p className="text-2xl font-bold">{pacientes.filter(p => p.convenio_id).length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Com Alergias</p>
                <p className="text-2xl font-bold text-destructive">
                  {pacientes.filter(p => p.alergias && p.alergias.length > 0).length}
                </p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Distribuição por Sexo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
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
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="estoque" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Itens em Estoque</p>
                <p className="text-2xl font-bold">{estoque.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Estoque Crítico</p>
                <p className="text-2xl font-bold text-destructive">
                  {estoque.filter(e => e.quantidade <= (e.quantidade_minima || 0)).length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Valor Total</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(estoque.reduce((acc, e) => acc + (e.quantidade * (e.valor_unitario || 0)), 0))}
                </p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Itens com Estoque Crítico</CardTitle>
              <CardDescription>Abaixo da quantidade mínima</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
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
                            <Badge variant="destructive">{item.quantidade}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{item.quantidade_minima || 0}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.valor_unitario || 0)}</TableCell>
                        </TableRow>
                      ))}
                    {estoque.filter(e => e.quantidade <= (e.quantidade_minima || 0)).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Nenhum item com estoque crítico
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Distribuição por Categoria</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(() => {
                    const cats: Record<string, number> = {};
                    estoque.forEach(e => {
                      cats[e.categoria] = (cats[e.categoria] || 0) + 1;
                    });
                    return Object.entries(cats).map(([name, value]) => ({ name, quantidade: value }));
                  })()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="quantidade" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Itens" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {podeVerAgenda && <TabsContent value="status" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Distribuição por Status</CardTitle>
              <CardDescription>Status dos agendamentos no período</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
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
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="quantidade" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Quantidade" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>}
      </Tabs>
    </div>
  );
}
