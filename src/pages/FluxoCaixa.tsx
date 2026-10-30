import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { MAX_LINHAS_AUTO, useLancamentos } from '@/hooks/useSupabaseData';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { addDays, format, startOfMonth, endOfMonth, eachDayOfInterval, subMonths, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowUpCircle,
  ArrowDownCircle,
  AlertTriangle,
  Wallet,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileUp,
} from 'lucide-react';
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
  Legend,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { valorRealizado } from '@/lib/lancamentos';
import { grupoMovimentoCaixa, totaisMovimentoCaixa } from '@/lib/fluxoCaixa';
import { ErrorState } from '@/components/ErrorState';
import {
  currentFinanceMonth,
  formatFinanceMonth,
  normalizeFinanceRouteParams,
  parseFinanceMonth,
} from '@/lib/financeRouteState';
import { ProjecaoFluxoCaixa } from '@/components/financeiro/ProjecaoFluxoCaixa';
import type { LancamentoProjecao } from '@/lib/projecaoFluxoCaixa';
import { dateOnlyInTimeZone, inicioDoDiaEmFusoIso, parseDateOnly } from '@/lib/dateOnly';

const statusRealizado = (status: string | null) => status === 'pago' || status === 'parcial';
const statusAberto = (status: string | null) => ['pendente', 'atrasado', 'parcial'].includes(status || '');
const dataRealizacao = (lancamento: { data: string; data_pagamento: string | null }) => {
  const value = lancamento.data_pagamento || lancamento.data;
  return value.includes('T') || value.includes(' ')
    ? dateOnlyInTimeZone(new Date(value), 'America/Sao_Paulo')
    : value;
};
const valorAberto = (lancamento: { valor: number; valor_pago: number | null; desconto?: number | null; acrescimo?: number | null }) =>
  Math.max(0, Number(lancamento.valor) - Number(lancamento.desconto || 0)
    + Number(lancamento.acrescimo || 0) - Number(lancamento.valor_pago || 0));
const noMes = (dateValue: string | null, month: number, year: number) => {
  const date = parseDateOnly(dateValue);
  return !!date && date.getMonth() === month && date.getFullYear() === year;
};
const dateOnlyFromTimestamp = (value: string) =>
  dateOnlyInTimeZone(new Date(value), 'America/Sao_Paulo');
const rotulosCategoria: Record<string, string> = {
  consulta: 'Consultas', retorno: 'Retornos', procedimento: 'Procedimentos', exame: 'Exames',
  cirurgia: 'Cirurgias', internacao: 'Internações', taxa_administrativa: 'Taxas administrativas',
  taxa_material: 'Materiais', convenio_repasse: 'Repasses de convênio', honorario_medico: 'Honorários médicos',
  fisioterapia: 'Fisioterapia', psicologia: 'Psicologia', pediatria: 'Pediatria', outros: 'Outros',
  fornecedores: 'Fornecedores', folha_pagamento: 'Folha de pagamento', impostos: 'Impostos',
  aluguel: 'Aluguel', servicos: 'Serviços', equipamentos: 'Equipamentos', marketing: 'Marketing',
  receita_caixa: 'Receitas avulsas', sangria: 'Sangrias', suprimento: 'Suprimentos',
  ajuste_convenio: 'Ajustes de convênio',
};
const rotuloCategoria = (categoria: string) => rotulosCategoria[categoria]
  || categoria.replace(/_/g, ' ').replace(/\b\w/g, letra => letra.toLocaleUpperCase('pt-BR'));

const GRID_COLOR = 'hsl(var(--border))';

export default function FluxoCaixa() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchString = searchParams.toString();
  const currentDate = parseFinanceMonth(searchParams.get('mes')) ?? currentFinanceMonth();
  const { profile } = useSupabaseAuth();

  useEffect(() => {
    const normalized = normalizeFinanceRouteParams(searchParams);
    if (normalized.toString() !== searchString) {
      setSearchParams(normalized, { replace: true });
    }
  }, [searchParams, searchString, setSearchParams]);

  const updateMonth = (date: Date) => {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      next.set('mes', formatFinanceMonth(date));
      return next;
    });
  };

  const lancamentosQuery = useLancamentos();
  const { data: lancamentos = [], isLoading } = lancamentosQuery;
  const inicioPeriodoPagamentos = format(startOfMonth(subMonths(currentDate, 1)), 'yyyy-MM-dd');
  const fimPeriodoPagamentosExclusivo = format(addDays(endOfMonth(currentDate), 1), 'yyyy-MM-dd');
  const inicioPeriodoPagamentosIso = inicioDoDiaEmFusoIso(inicioPeriodoPagamentos, 'America/Sao_Paulo');
  const fimPeriodoPagamentosIso = inicioDoDiaEmFusoIso(fimPeriodoPagamentosExclusivo, 'America/Sao_Paulo');
  const pagamentosQuery = useQuery({
    queryKey: ['pagamentos-fluxo-caixa', profile?.clinica_id ?? null, inicioPeriodoPagamentos, fimPeriodoPagamentosExclusivo],
    queryFn: async () => {
      const selecionar = () => supabase.from('pagamentos')
        .select('id, lancamento_id, valor, data_pagamento, estornado_em, lancamentos!inner(tipo, categoria, clinica_id)')
        .eq('clinica_id', profile!.clinica_id!)
        .eq('lancamentos.clinica_id', profile!.clinica_id!)
        .order('id', { ascending: true });
      const [pagamentosNoPeriodo, estornosNoPeriodo] = await Promise.all([
        buscarEmBlocos<any>(() => selecionar()
          .gte('data_pagamento', inicioPeriodoPagamentosIso)
          .lt('data_pagamento', fimPeriodoPagamentosIso)),
        buscarEmBlocos<any>(() => selecionar()
          .not('estornado_em', 'is', null)
          .gte('estornado_em', inicioPeriodoPagamentosIso)
          .lt('estornado_em', fimPeriodoPagamentosIso)),
      ]);
      return [...new Map([...pagamentosNoPeriodo, ...estornosNoPeriodo]
        .map(pagamento => [pagamento.id, pagamento] as const)).values()];
    },
    enabled: !!profile?.clinica_id,
  });
  const pagamentos = pagamentosQuery.data ?? [];
  const consultaAtingiuLimite = lancamentos.length >= MAX_LINHAS_AUTO
    || pagamentos.length >= LIMITE_BUSCA_EM_BLOCOS;

  const mesAtual = currentDate.getMonth();
  // Os pagamentos carregados cobrem o mês exibido; o realizado da projeção só é completo no mês corrente.
  const visualizandoMesAtual = format(currentDate, 'yyyy-MM') === dateOnlyInTimeZone(new Date(), 'America/Sao_Paulo').slice(0, 7);
  const anoAtual = currentDate.getFullYear();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Cada linha filha é um evento financeiro próprio. Isso mantém pagamentos
  // parciais e estornos na data em que realmente ocorreram; lançamentos antigos
  // continuam usando o valor consolidado na conta.
  const eventosRealizados = useMemo(() => {
    const lancamentosComPagamentos = new Set<string>(pagamentos.map(p => p.lancamento_id));
    const antigos = lancamentos
      .filter(l => statusRealizado(l.status) && !lancamentosComPagamentos.has(l.id))
      .map(l => ({
        id: l.id,
        tipo: l.tipo,
        categoria: l.categoria,
        data: dataRealizacao(l),
        valor: valorRealizado(l),
      }));
    const individuais = pagamentos.flatMap(p => {
      const conta = Array.isArray(p.lancamentos) ? p.lancamentos[0] : p.lancamentos;
      if (!conta || !grupoMovimentoCaixa(conta.tipo)) return [];
      const pagamento = {
        id: p.id,
        tipo: conta.tipo,
        categoria: conta.categoria || 'outros',
        data: dateOnlyFromTimestamp(p.data_pagamento),
        valor: Number(p.valor),
      };
      if (!p.estornado_em) return [pagamento];
      return [
        pagamento,
        {
          ...pagamento,
          id: p.id + ':estorno',
          data: dateOnlyFromTimestamp(p.estornado_em),
          valor: -Number(p.valor),
        },
      ];
    });
    return [...antigos, ...individuais];
  }, [lancamentos, pagamentos]);

  // Calcular totais do mês
  const totaisMes = useMemo(() => {
    const realizadosNoMes = eventosRealizados.filter(evento => noMes(evento.data, mesAtual, anoAtual));
    const emAbertoNoMes = lancamentos.filter(l => statusAberto(l.status) && noMes(l.data_vencimento || l.data, mesAtual, anoAtual));

    const realizados = totaisMovimentoCaixa(realizadosNoMes);

    const receitasPendentes = emAbertoNoMes
      .filter(l => l.tipo === 'receita')
      .reduce((acc, l) => acc + valorAberto(l), 0);

    const despesasPendentes = emAbertoNoMes
      .filter(l => l.tipo === 'despesa')
      .reduce((acc, l) => acc + valorAberto(l), 0);

    return {
      ...realizados,
      receitasPendentes,
      despesasPendentes,
    };
  }, [eventosRealizados, lancamentos, mesAtual, anoAtual]);

  // Dados para gráfico diário
  const dadosDiarios = useMemo(() => {
    const inicio = startOfMonth(currentDate);
    const fim = endOfMonth(currentDate);
    const dias = eachDayOfInterval({ start: inicio, end: fim });

    let saldoAcumulado = 0;

    return dias.map(dia => {
      const dataStr = format(dia, 'yyyy-MM-dd');
      const lancamentosDia = eventosRealizados.filter(evento => evento.data === dataStr);

      // O evento já tem o valor efetivamente recebido ou estornado nesta data.
      const totais = totaisMovimentoCaixa(lancamentosDia);
      saldoAcumulado += totais.saldo;

      return {
        dia: format(dia, 'dd'),
        ...totais,
        saldoAcumulado,
      };
    });
  }, [eventosRealizados, currentDate]);

  // Dados por categoria
  const dadosPorCategoria = useMemo(() => {
    const categorias: Record<string, { receitas: number; despesas: number; suprimentos: number; sangrias: number }> = {};

    eventosRealizados
      .filter(evento => noMes(evento.data, mesAtual, anoAtual))
      .forEach(l => {
        const grupo = grupoMovimentoCaixa(l.tipo);
        if (!grupo) return;
        if (!categorias[l.categoria]) {
          categorias[l.categoria] = { receitas: 0, despesas: 0, suprimentos: 0, sangrias: 0 };
        }
        categorias[l.categoria][grupo] += l.valor;
      });

    return Object.entries(categorias).map(([categoria, valores]) => ({
      categoria: rotuloCategoria(categoria),
      ...valores,
    }));
  }, [eventosRealizados, mesAtual, anoAtual]);

  const temMovimentosNoMes = useMemo(
    () => eventosRealizados.some(evento => noMes(evento.data, mesAtual, anoAtual)),
    [eventosRealizados, mesAtual, anoAtual],
  );

  // Comparação com mês anterior
  const comparacaoMesAnterior = useMemo(() => {
    const mesAnterior = subMonths(currentDate, 1);
    const mesAnt = mesAnterior.getMonth();
    const anoAnt = mesAnterior.getFullYear();

    const lancamentosMesAnterior = eventosRealizados.filter(l => noMes(l.data, mesAnt, anoAnt));

    const totaisAnteriores = totaisMovimentoCaixa(lancamentosMesAnterior);

    const variacaoReceita = totaisAnteriores.entradas > 0
      ? ((totaisMes.entradas - totaisAnteriores.entradas) / totaisAnteriores.entradas) * 100
      : 0;

    const variacaoDespesa = totaisAnteriores.saidas > 0
      ? ((totaisMes.saidas - totaisAnteriores.saidas) / totaisAnteriores.saidas) * 100
      : 0;

    return {
      variacaoReceita,
      variacaoDespesa,
      receitaSemBaseAnterior: totaisAnteriores.entradas === 0 && totaisMes.entradas > 0,
      despesaSemBaseAnterior: totaisAnteriores.saidas === 0 && totaisMes.saidas > 0,
    };
  }, [eventosRealizados, currentDate, totaisMes]);

  const handlePrevMonth = () => updateMonth(subMonths(currentDate, 1));
  const handleNextMonth = () => updateMonth(addMonths(currentDate, 1));

  if (isLoading || pagamentosQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (lancamentosQuery.isError) return <ErrorState title="Não foi possível carregar o fluxo de caixa" error={lancamentosQuery.error} onRetry={() => void lancamentosQuery.refetch()} />;
  if (pagamentosQuery.isError) return <ErrorState title="Não foi possível carregar os pagamentos do fluxo de caixa" error={pagamentosQuery.error} onRetry={() => void pagamentosQuery.refetch()} />;

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Fluxo de Caixa"
        icon={<Wallet />}
        description={`${format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })} · Saldo ${formatCurrency(totaisMes.saldo)} · Entradas ${formatCurrency(totaisMes.entradas)} · Saídas ${formatCurrency(totaisMes.saidas)}`}
        actions={(
          <>
            <Button
              aria-label="Atualizar fluxo de caixa"
              variant="outline"
              size="icon"
              className="shrink-0 rounded-full"
              onClick={() => { void lancamentosQuery.refetch(); void pagamentosQuery.refetch(); }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" asChild className="shrink-0 rounded-full">
              <Link to={`/financeiro?mes=${formatFinanceMonth(currentDate)}&tab=resumo`}>Visão financeira</Link>
            </Button>
            {profile?.clinica_id && <Button variant="outline" asChild className="shrink-0 rounded-full"><Link to={`/fluxo-caixa/extrato?mes=${formatFinanceMonth(currentDate)}`}><FileUp className="mr-2 h-4 w-4" />Importar extrato</Link></Button>}
            <div className="flex items-center gap-1 rounded-full border border-border/60 bg-card p-1 shadow-xs">
              <Button aria-label="Mês anterior" variant="ghost" size="icon" className="rounded-full text-primary hover:bg-primary/10" onClick={handlePrevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[140px] text-center text-sm font-semibold capitalize text-foreground">
                {format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })}
              </span>
              <Button aria-label="Próximo mês" variant="ghost" size="icon" className="rounded-full text-primary hover:bg-primary/10" onClick={handleNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      />

      {consultaAtingiuLimite && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            A consulta atingiu o limite de {Math.min(MAX_LINHAS_AUTO, LIMITE_BUSCA_EM_BLOCOS).toLocaleString('pt-BR')} registros.
            Se houver mais movimentos, os totais e gráficos podem estar incompletos.
          </p>
        </div>
      )}

      {/* Faixa de indicadores */}
      <section aria-label="Resumo do fluxo de caixa do mês" className="grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-card lg:grid-cols-4">
        {[
          { label: 'Entradas no mês', value: totaisMes.entradas, icon: ArrowUpCircle, color: 'text-success', surface: 'bg-success/10',
            trend: comparacaoMesAnterior.variacaoReceita, trendPositive: comparacaoMesAnterior.variacaoReceita > 0,
            trendNovaBase: comparacaoMesAnterior.receitaSemBaseAnterior,
            sub: totaisMes.receitasPendentes > 0 ? `Em aberto com vencimento no mês: ${formatCurrency(totaisMes.receitasPendentes)}` : undefined },
          { label: 'Saídas no mês', value: totaisMes.saidas, icon: ArrowDownCircle, color: 'text-destructive', surface: 'bg-destructive/10',
            trend: comparacaoMesAnterior.variacaoDespesa, trendPositive: comparacaoMesAnterior.variacaoDespesa < 0,
            trendNovaBase: comparacaoMesAnterior.despesaSemBaseAnterior,
            sub: totaisMes.despesasPendentes > 0 ? `Em aberto com vencimento no mês: ${formatCurrency(totaisMes.despesasPendentes)}` : undefined },
          { label: totaisMes.saldo < 0 ? 'Saldo negativo no mês' : 'Saldo do mês', value: totaisMes.saldo, icon: Wallet, color: totaisMes.saldo < 0 ? 'text-destructive' : 'text-primary', surface: totaisMes.saldo < 0 ? 'bg-destructive/10' : 'bg-primary/10', trendNovaBase: false },
          { label: 'Margem operacional', value: -1, icon: DollarSign, color: 'text-primary', surface: 'bg-primary/10',
            pct: totaisMes.receitas > 0 ? `${(((totaisMes.receitas - totaisMes.despesas) / totaisMes.receitas) * 100).toFixed(1)}%` : '—', trendNovaBase: false },
        ].map((s, index) => (
          <div
            key={s.label}
            className={cn(
              'min-w-0 p-3 sm:p-4',
              index % 2 === 0 && 'border-r border-border',
              index >= 2 && 'border-t border-border lg:border-t-0',
              (index === 1 || index === 2) && 'lg:border-r lg:border-border',
              index === 3 && 'lg:border-r-0',
              index === 2 && (totaisMes.saldo < 0 ? 'bg-destructive/5' : 'bg-primary/5'),
            )}
          >
            <div className="flex items-start justify-between gap-2 sm:gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground">{s.label}</p>
                {s.pct !== undefined ? (
                  <p className={cn('text-xl font-bold sm:text-2xl', s.color)}>{s.pct}</p>
                ) : (
                  <p className={cn('text-lg font-bold tabular-nums sm:text-2xl', s.color)}>{formatCurrency(s.value)}</p>
                )}
                {s.trendNovaBase ? (
                  <p className="mt-1 text-xs text-muted-foreground">Sem base no mês anterior</p>
                ) : s.trend !== undefined && s.trend !== 0 && (
                  <div className={cn('flex items-center gap-1 mt-1 text-xs font-medium', s.trendPositive ? 'text-success' : 'text-destructive')}>
                    {s.trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(s.trend).toFixed(1)}%
                  </div>
                )}
                {s.sub && <p className="mt-1 text-xs text-muted-foreground">{s.sub}</p>}
              </div>
              <div aria-hidden="true" className={cn('hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex', s.surface)}>
                <s.icon className={cn('h-5 w-5', s.color)} />
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Gráficos */}
      {temMovimentosNoMes ? (
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Evolução Diária */}
        <Card className="rounded-2xl border-border/60 shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <TrendingUp className="h-4 w-4" />
              </span>
              <div>
                <CardTitle className="text-base font-semibold">Evolução Diária</CardTitle>
                <CardDescription>Entradas e saídas registradas por dia</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dadosDiarios}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                  <XAxis dataKey="dia" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(v) => `R$${v}`} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="receitas" name="Receitas" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesas" name="Despesas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="suprimentos" name="Suprimentos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sangrias" name="Sangrias" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
          </CardContent>
        </Card>

        {/* Saldo Acumulado */}
        <Card className="rounded-2xl border-border/60 shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Wallet className="h-4 w-4" />
              </span>
              <div>
                <CardTitle className="text-base font-semibold">Saldo Acumulado</CardTitle>
                <CardDescription>Variação acumulada no mês; não inclui saldo inicial de caixa</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dadosDiarios}>
                  <defs>
                    <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                  <XAxis dataKey="dia" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(v) => `R$${v}`} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="saldoAcumulado"
                    name="Saldo"
                    stroke="hsl(var(--primary))"
                    fillOpacity={1}
                    fill="url(#colorSaldo)"
                  />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
          </CardContent>
        </Card>
      </div>
      ) : (
        <div role="status" aria-label="Sem movimentações para exibir" className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-4">
          <TrendingUp aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">Nenhuma movimentação registrada neste mês</p>
            <p className="mt-1 text-xs text-muted-foreground">A evolução diária, o saldo acumulado e as categorias aparecerão quando houver entradas, saídas, suprimentos ou sangrias.</p>
          </div>
        </div>
      )}

      <ProjecaoFluxoCaixa lancamentos={lancamentos as LancamentoProjecao[]} realizados={visualizandoMesAtual ? eventosRealizados : []} realizadoIndisponivel={!visualizandoMesAtual} />

      {/* Por Categoria */}
      {temMovimentosNoMes && <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <DollarSign className="h-4 w-4" />
            </span>
            <div>
              <CardTitle className="text-base font-semibold">Por Categoria</CardTitle>
              <CardDescription>Valores efetivamente recebidos e pagos no mês, por categoria</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {dadosPorCategoria.length === 0 ? (
            <div role="status" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
              <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <DollarSign className="h-6 w-6" />
              </span>
              <p className="text-sm font-medium text-foreground">Nenhuma movimentação neste mês</p>
            </div>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosPorCategoria} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                  <XAxis type="number" className="text-xs" tickFormatter={(v) => `R$${v}`} />
                  <YAxis dataKey="categoria" type="category" className="text-xs" width={100} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="receitas" name="Receitas" fill="hsl(var(--success))" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="despesas" name="Despesas" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="suprimentos" name="Suprimentos" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="sangrias" name="Sangrias" fill="hsl(var(--warning))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>}
    </div>
  );
}
