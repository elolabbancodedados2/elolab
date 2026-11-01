import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import {
  DollarSign, AlertTriangle, ArrowRight, FileText, ChevronLeft, ChevronRight,
  PieChart as PieChartIcon, Activity, Building2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  calcularMargemLucro,
  formatarPercentualFinanceiro,
  formatarValorAbreviadoFinanceiro,
} from '@/lib/financeiroCalculations';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { MAX_LINHAS_AUTO, useLancamentos } from '@/hooks/useSupabaseData';
import { addDays, format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from 'recharts';
import { dateOnlyInTimeZone, inicioDoDiaEmFusoIso, parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { valorRealizado } from '@/lib/lancamentos';
import { ErrorState } from '@/components/ErrorState';
import {
  currentFinanceMonth,
  formatFinanceMonth,
  normalizeFinanceRouteParams,
  parseFinanceMonth,
  parseFinanceOverviewTab,
} from '@/lib/financeRouteState';
import { PageHeader } from '@/components/PageHeader';
import { normalizarCategoria, rotuloCentroCusto, somarPorCategoria } from '@/lib/financeiroRotulos';

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtShort = formatarValorAbreviadoFinanceiro;

const statusLiquidadoParcialOuTotal = (status: string | null) => status === 'pago' || status === 'parcial';
const statusEmAberto = (status: string | null) => ['pendente', 'atrasado', 'parcial'].includes(status || '');
const valorEmAberto = (lancamento: {
  valor: number;
  valor_pago: number | null;
  desconto?: number | null;
  acrescimo?: number | null;
}) => Math.max(0,
  Number(lancamento.valor) - Number(lancamento.desconto || 0)
  + Number(lancamento.acrescimo || 0) - Number(lancamento.valor_pago || 0)
);
const dataRealizacao = (lancamento: { data: string; data_pagamento: string | null }) => {
  const value = lancamento.data_pagamento || lancamento.data;
  return value.includes('T') || value.includes(' ')
    ? dateOnlyInTimeZone(new Date(value), 'America/Sao_Paulo')
    : value;
};
const dentroDoPeriodo = (dateValue: string | null | undefined, period: { start: Date; end: Date }) => {
  const date = parseDateOnly(dateValue);
  return !!date && date >= period.start && date <= period.end;
};

interface EventoFinanceiro {
  id: string;
  lancamentoId: string;
  tipo: string;
  categoria: string;
  centroCusto: string | null;
  data: string;
  valor: number;
}

export default function Financeiro() {
  const { profile } = useSupabaseAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchString = searchParams.toString();
  const currentDate = parseFinanceMonth(searchParams.get('mes')) ?? currentFinanceMonth();
  // Seis meses do gráfico até o fim do mês exibido, mais os em aberto (vencidos e a pagar).
  const lancamentosQuery = useLancamentos({
    inicio: format(startOfMonth(subMonths(currentDate, 5)), 'yyyy-MM-dd'),
    fim: format(endOfMonth(currentDate), 'yyyy-MM-dd'),
  });
  const { data: lancamentos = [] } = lancamentosQuery;
  const activeTab = parseFinanceOverviewTab(searchParams.get('tab'));

  useEffect(() => {
    const normalized = normalizeFinanceRouteParams(searchParams, new Date(), true);
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

  const updateTab = (tab: string) => {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      next.set('tab', parseFinanceOverviewTab(tab));
      return next;
    });
  };

  const mesAtual = { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
  const mesAnterior = { start: startOfMonth(subMonths(currentDate, 1)), end: endOfMonth(subMonths(currentDate, 1)) };
  const inicioHistorico = format(startOfMonth(subMonths(currentDate, 5)), 'yyyy-MM-dd');
  const fimHistoricoExclusivo = format(addDays(endOfMonth(currentDate), 1), 'yyyy-MM-dd');
  const inicioHistoricoIso = inicioDoDiaEmFusoIso(inicioHistorico, 'America/Sao_Paulo');
  const fimHistoricoIso = inicioDoDiaEmFusoIso(fimHistoricoExclusivo, 'America/Sao_Paulo');

  const pagamentosQuery = useQuery({
    queryKey: ['financeiro-pagamentos', profile?.clinica_id ?? null, inicioHistorico, fimHistoricoExclusivo],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const selecionar = () => supabase.from('pagamentos')
        .select('id,lancamento_id,valor,data_pagamento,estornado_em,lancamentos!inner(tipo,categoria,centro_custo,clinica_id)')
        .eq('clinica_id', profile!.clinica_id!)
        .eq('lancamentos.clinica_id', profile!.clinica_id!)
        .order('id');
      const [pagamentosNoPeriodo, estornosNoPeriodo] = await Promise.all([
        buscarEmBlocos<any>(() => selecionar()
          .gte('data_pagamento', inicioHistoricoIso)
          .lt('data_pagamento', fimHistoricoIso)),
        buscarEmBlocos<any>(() => selecionar()
          .not('estornado_em', 'is', null)
          .gte('estornado_em', inicioHistoricoIso)
          .lt('estornado_em', fimHistoricoIso)),
      ]);
      return [...new Map([...pagamentosNoPeriodo, ...estornosNoPeriodo]
        .map(pagamento => [pagamento.id, pagamento] as const)).values()];
    },
  });
  const pagamentos = pagamentosQuery.data ?? [];
  const eventosFinanceiros = useMemo<EventoFinanceiro[]>(() => {
    const idsComPagamentoNoPeriodo = new Set(pagamentos.map(pagamento => pagamento.lancamento_id));
    const eventosIndividuais = pagamentos.flatMap((pagamento: any) => {
      const conta = Array.isArray(pagamento.lancamentos) ? pagamento.lancamentos[0] : pagamento.lancamentos;
      if (!conta || !['receita', 'despesa'].includes(conta.tipo)) return [];
      const eventos: EventoFinanceiro[] = [];
      const dataPagamento = dateOnlyInTimeZone(new Date(pagamento.data_pagamento), 'America/Sao_Paulo');
      if (dataPagamento >= inicioHistorico && dataPagamento < fimHistoricoExclusivo) eventos.push({
        id: pagamento.id,
        lancamentoId: pagamento.lancamento_id,
        tipo: conta.tipo,
        categoria: normalizarCategoria(conta.categoria),
        centroCusto: conta.centro_custo ?? null,
        data: dataPagamento,
        valor: Number(pagamento.valor),
      });
      if (pagamento.estornado_em) {
        const dataEstorno = dateOnlyInTimeZone(new Date(pagamento.estornado_em), 'America/Sao_Paulo');
        if (dataEstorno >= inicioHistorico && dataEstorno < fimHistoricoExclusivo) eventos.push({
          id: `${pagamento.id}:estorno`,
          lancamentoId: pagamento.lancamento_id,
          tipo: conta.tipo,
          categoria: normalizarCategoria(conta.categoria),
          centroCusto: conta.centro_custo ?? null,
          data: dataEstorno,
          valor: -Number(pagamento.valor),
        });
      }
      return eventos;
    });
    const eventosLegados = lancamentos
      .filter(l => statusLiquidadoParcialOuTotal(l.status) && !idsComPagamentoNoPeriodo.has(l.id))
      .flatMap(l => {
        const data = dataRealizacao(l);
        return data >= inicioHistorico && data < fimHistoricoExclusivo
          ? [{ id: l.id, lancamentoId: l.id, tipo: l.tipo, categoria: normalizarCategoria(l.categoria), centroCusto: l.centro_custo ?? null, data, valor: valorRealizado(l) }]
          : [];
      });
    return [...eventosLegados, ...eventosIndividuais];
  }, [pagamentos, lancamentos, inicioHistorico, fimHistoricoExclusivo]);

  // ─── KPIs ─────────────────────────────────────
  const kpis = useMemo(() => {
    const contasComVencimentoNoMes = lancamentos.filter(l => dentroDoPeriodo(l.data_vencimento || l.data, mesAtual));
    const eventosDoMes = eventosFinanceiros.filter(evento => dentroDoPeriodo(evento.data, mesAtual));
    const eventosDoMesAnterior = eventosFinanceiros.filter(evento => dentroDoPeriodo(evento.data, mesAnterior));
    const receitas = contasComVencimentoNoMes.filter(l => l.tipo === 'receita');
    const despesas = contasComVencimentoNoMes.filter(l => l.tipo === 'despesa');
    const recebido = eventosDoMes.filter(evento => evento.tipo === 'receita').reduce((a, evento) => a + evento.valor, 0);
    const aReceber = receitas.filter(l => statusEmAberto(l.status)).reduce((a, l) => a + valorEmAberto(l), 0);
    // A taxa compara valores da mesma coorte de contas: vencidas no mês
    // selecionado, quitadas ou ainda em aberto. Misturar recebimentos por data
    // de pagamento com pendências por data de vencimento distorcia o percentual.
    const recebidoDasContasDoMes = receitas
      .filter(l => statusLiquidadoParcialOuTotal(l.status))
      .reduce((a, l) => a + valorRealizado(l), 0);
    const baseTaxaRecebimento = recebidoDasContasDoMes + aReceber;
    const hoje = todaySaoPauloDateOnly();
    const contasVencidas = lancamentos.filter(l => l.tipo === 'receita' && statusEmAberto(l.status) && !!l.data_vencimento && l.data_vencimento < hoje);
    const vencido = contasVencidas
      .reduce((a, l) => a + valorEmAberto(l), 0);
    const totalDespesas = eventosDoMes.filter(evento => evento.tipo === 'despesa').reduce((a, evento) => a + evento.valor, 0);
    const aPagar = despesas.filter(l => statusEmAberto(l.status)).reduce((a, l) => a + valorEmAberto(l), 0);
    const saldo = recebido - totalDespesas;

    // Previous month for comparison
    const recAnt = eventosDoMesAnterior.filter(evento => evento.tipo === 'receita').reduce((a, evento) => a + evento.valor, 0);
    const despAnt = eventosDoMesAnterior.filter(evento => evento.tipo === 'despesa').reduce((a, evento) => a + evento.valor, 0);
    const varReceita = recAnt > 0 ? ((recebido - recAnt) / recAnt) * 100 : 0;
    const varDespesa = despAnt > 0 ? ((totalDespesas - despAnt) / despAnt) * 100 : 0;
    const receitaSemBaseAnterior = recAnt === 0 && recebido > 0;
    const despesaSemBaseAnterior = despAnt === 0 && totalDespesas > 0;

    const countPendentesReceber = receitas.filter(l => statusEmAberto(l.status)).length;
    const countPendentesPagar = despesas.filter(l => statusEmAberto(l.status)).length;
    const taxaRecebimento = baseTaxaRecebimento > 0
      ? (recebidoDasContasDoMes / baseTaxaRecebimento) * 100
      : 0;

    return {
      recebido, aReceber, vencido, totalDespesas, aPagar, saldo,
      countPendentesReceber, countPendentesPagar, countContasVencidas: contasVencidas.length, varReceita, varDespesa,
      receitaSemBaseAnterior, despesaSemBaseAnterior,
      taxaRecebimento,
    };
  }, [lancamentos, eventosFinanceiros, mesAtual, mesAnterior]);

  // ─── DRE ──────────────────────────────────────
  const dre = useMemo(() => {
    const doMes = eventosFinanceiros.filter(evento => dentroDoPeriodo(evento.data, mesAtual));

    // Agrupa as mesmas transações individuais exibidas no caixa do período,
    // com a categoria normalizada ("Outros" e "outros" são a mesma linha).
    const receitasPorCat = somarPorCategoria(doMes.filter(evento => evento.tipo === 'receita'));
    const despesasPorCat = somarPorCategoria(doMes.filter(evento => evento.tipo === 'despesa'));

    const totalReceitas = receitasPorCat.reduce((a, item) => a + item.valor, 0);
    const totalDespesas = despesasPorCat.reduce((a, item) => a + item.valor, 0);
    const lucroOperacional = totalReceitas - totalDespesas;
    const margemLucro = calcularMargemLucro(totalReceitas, lucroOperacional);

    return { receitasPorCat, despesasPorCat, totalReceitas, totalDespesas, lucroOperacional, margemLucro };
  }, [eventosFinanceiros, mesAtual]);

  // ─── Centros de custo ─────────────────────────
  const centrosCusto = useMemo(() => {
    const mapa = new Map<string, { chave: string; label: string; receitas: number; despesas: number }>();
    for (const evento of eventosFinanceiros) {
      if (!dentroDoPeriodo(evento.data, mesAtual)) continue;
      const chave = evento.centroCusto?.trim() || '';
      const atual = mapa.get(chave) ?? { chave, label: rotuloCentroCusto(chave), receitas: 0, despesas: 0 };
      if (evento.tipo === 'receita') atual.receitas += evento.valor;
      else if (evento.tipo === 'despesa') atual.despesas += evento.valor;
      mapa.set(chave, atual);
    }
    return [...mapa.values()]
      .map(item => ({ ...item, resultado: item.receitas - item.despesas }))
      .sort((a, b) => (b.receitas + b.despesas) - (a.receitas + a.despesas));
  }, [eventosFinanceiros, mesAtual]);

  // ─── Chart (6 months) ─────────────────────────
  const chartData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(currentDate, 5 - i);
      const m = d.getMonth(); const y = d.getFullYear();
      const eventosDoMes = eventosFinanceiros.filter(evento => {
        const data = parseDateOnly(evento.data);
        return !!data && data.getMonth() === m && data.getFullYear() === y;
      });
      const rec = eventosDoMes.filter(evento => evento.tipo === 'receita').reduce((a, evento) => a + evento.valor, 0);
      const des = eventosDoMes.filter(evento => evento.tipo === 'despesa').reduce((a, evento) => a + evento.valor, 0);
      return { name: format(d, 'MMM/yy', { locale: ptBR }), receitas: rec, despesas: des, lucro: rec - des };
    });
  }, [eventosFinanceiros, currentDate]);

  // ─── Receitas pie ─────────────────────────────
  if (lancamentosQuery.isLoading || pagamentosQuery.isLoading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
    </div>
  );
  if (lancamentosQuery.isError || pagamentosQuery.isError) return (
    <ErrorState
      title="Não foi possível carregar o painel financeiro"
      description="Os indicadores foram pausados para evitar valores incompletos. Tente carregar novamente."
      error={lancamentosQuery.error || pagamentosQuery.error}
      onRetry={() => { void lancamentosQuery.refetch(); void pagamentosQuery.refetch(); }}
    />
  );

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Painel financeiro"
        description="Análise completa de receitas, despesas e resultados"
        icon={<DollarSign />}
        className="rounded-[22px] border border-border/60 bg-card p-4 shadow-xs sm:p-5"
        actions={(
          <div className="flex items-center gap-1 rounded-full border border-border/60 bg-card p-1 shadow-xs">
            <Button aria-label="Mês anterior" variant="ghost" size="icon" className="h-8 w-8 rounded-full text-primary hover:bg-primary/10" onClick={() => updateMonth(subMonths(currentDate, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[120px] text-center text-sm font-bold capitalize text-foreground">
              {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <Button aria-label="Próximo mês" variant="ghost" size="icon" className="h-8 w-8 rounded-full text-primary hover:bg-primary/10" onClick={() => updateMonth(addMonths(currentDate, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 text-xs font-semibold" onClick={() => updateMonth(currentFinanceMonth())}>
              Hoje
            </Button>
          </div>
        )}
      />

      <section aria-labelledby="finance-summary-title" className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border/70 px-4 py-3 sm:px-5">
          <div>
            <h2 id="finance-summary-title" className="text-sm font-semibold text-foreground">Resumo financeiro</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Valores realizados seguem a data do pagamento; pendências usam o vencimento.</p>
          </div>
          <span className="text-xs font-medium capitalize text-muted-foreground">{format(currentDate, 'MMMM yyyy', { locale: ptBR })}</span>
        </header>

        <div className="grid min-w-0 xl:grid-cols-12">
          <div className="min-w-0 px-4 py-3 sm:px-5 xl:col-span-7">
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Movimentação realizada</h3>
            <dl className="divide-y divide-border/60">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <dt className="text-sm font-medium text-foreground">Entradas recebidas</dt>
                <dd className="text-right text-base font-semibold tabular-nums text-success">{fmt(kpis.recebido)}</dd>
                <dd className="col-span-2 text-xs text-muted-foreground sm:col-span-1 sm:text-right">
                  {kpis.receitaSemBaseAnterior ? 'Sem base no mês anterior' : kpis.varReceita !== 0 ? `${formatarPercentualFinanceiro(Math.abs(kpis.varReceita))} ${kpis.varReceita > 0 ? 'acima' : 'abaixo'} do mês anterior` : 'Sem variação ante o mês anterior'}
                </dd>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <dt className="text-sm font-medium text-foreground">Despesas pagas</dt>
                <dd className="text-right text-base font-semibold tabular-nums text-destructive">{fmt(kpis.totalDespesas)}</dd>
                <dd className="col-span-2 text-xs text-muted-foreground sm:col-span-1 sm:text-right">
                  {kpis.despesaSemBaseAnterior ? 'Sem base no mês anterior' : kpis.varDespesa !== 0 ? `${formatarPercentualFinanceiro(Math.abs(kpis.varDespesa))} ${kpis.varDespesa > 0 ? 'acima' : 'abaixo'} do mês anterior` : 'Sem variação ante o mês anterior'}
                </dd>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-t-2 border-border py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <dt className="text-sm font-semibold text-foreground">Resultado líquido</dt>
                <dd className={cn('text-right text-lg font-bold tabular-nums', kpis.saldo >= 0 ? 'text-primary' : 'text-destructive')}>{kpis.saldo < 0 ? `−${fmt(Math.abs(kpis.saldo))}` : fmt(kpis.saldo)}</dd>
                <dd className="col-span-2 text-xs text-muted-foreground sm:col-span-1 sm:text-right">Entradas recebidas menos despesas pagas</dd>
              </div>
            </dl>

            <dl className="mt-2 grid grid-cols-1 gap-2 border-t border-border/70 pt-3 sm:grid-cols-2 sm:gap-4">
              <div className="flex items-baseline justify-between gap-2">
                <div><dt className="text-xs font-medium text-foreground">Taxa de recebimento</dt><dd className="text-[11px] text-muted-foreground">Contas com vencimento neste mês</dd></div>
                <dd className="text-sm font-semibold tabular-nums text-foreground">{kpis.taxaRecebimento.toFixed(0)}%</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <div><dt className="text-xs font-medium text-foreground">Margem operacional</dt><dd className="text-[11px] text-muted-foreground">Resultado sobre receitas pagas</dd></div>
                <dd className={cn('text-sm font-semibold tabular-nums', dre.margemLucro === null ? 'text-muted-foreground' : dre.margemLucro >= 0 ? 'text-success' : 'text-destructive')}>{dre.margemLucro === null ? '—' : formatarPercentualFinanceiro(dre.margemLucro)}</dd>
              </div>
            </dl>
          </div>

          <aside aria-labelledby="finance-pending-title" className="min-w-0 border-t border-border/70 bg-muted/20 px-4 py-3 sm:px-5 xl:col-span-5 xl:border-l xl:border-t-0">
            <h3 id="finance-pending-title" className="text-sm font-semibold text-foreground">Pendências e próximos passos</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Acompanhe os valores em aberto do período e os atrasos acumulados.</p>
            <ul className="mt-2 divide-y divide-border/60">
              <li>
                <Link to={`/contas?tab=receber&status=aberto&mes=${formatFinanceMonth(currentDate)}`} className="group flex min-h-12 items-center justify-between gap-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
                  <span className="min-w-0"><span className="block text-sm font-medium text-foreground">A receber neste mês</span><span className="block text-xs text-muted-foreground">{kpis.countPendentesReceber} {kpis.countPendentesReceber === 1 ? 'conta em aberto' : 'contas em aberto'}</span></span>
                  <span className="flex shrink-0 items-center gap-2 text-sm font-semibold tabular-nums text-foreground">{fmt(kpis.aReceber)}<ArrowRight aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></span>
                </Link>
              </li>
              <li>
                <Link to="/contas?tab=receber&status=atrasado&periodo=todos" className="group flex min-h-12 items-center justify-between gap-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
                  <span className="min-w-0"><span className="block text-sm font-medium text-foreground">Em atraso até hoje</span><span className="block text-xs text-muted-foreground">{kpis.countContasVencidas} {kpis.countContasVencidas === 1 ? 'conta vencida' : 'contas vencidas'}</span></span>
                  <span className="flex shrink-0 items-center gap-2 text-sm font-semibold tabular-nums text-destructive">{fmt(kpis.vencido)}<ArrowRight aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></span>
                </Link>
              </li>
              <li>
                <Link to={`/contas?tab=pagar&status=aberto&mes=${formatFinanceMonth(currentDate)}`} className="group flex min-h-12 items-center justify-between gap-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
                  <span className="min-w-0"><span className="block text-sm font-medium text-foreground">A pagar neste mês</span><span className="block text-xs text-muted-foreground">{kpis.countPendentesPagar} {kpis.countPendentesPagar === 1 ? 'conta em aberto' : 'contas em aberto'}</span></span>
                  <span className="flex shrink-0 items-center gap-2 text-sm font-semibold tabular-nums text-foreground">{fmt(kpis.aPagar)}<ArrowRight aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></span>
                </Link>
              </li>
            </ul>
          </aside>
        </div>
      </section>

      {lancamentos.length >= MAX_LINHAS_AUTO && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            O painel carregou o limite de {MAX_LINHAS_AUTO.toLocaleString('pt-BR')} lançamentos. Como a lista é ordenada dos mais recentes para os mais antigos,
            registros antigos podem não estar incluídos nos totais. Confira os relatórios antes de usar estes valores para fechamento.
          </p>
        </div>
      )}
      {pagamentos.length >= LIMITE_BUSCA_EM_BLOCOS && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            O painel carregou o limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} pagamentos no histórico de seis meses. Os totais podem estar incompletos; confira os relatórios antes do fechamento.
          </p>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={updateTab}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="resumo" className="gap-1.5"><Activity className="h-3.5 w-3.5" /> Evolução</TabsTrigger>
          <TabsTrigger value="dre" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> DRE</TabsTrigger>
          <TabsTrigger value="categorias" className="gap-1.5"><PieChartIcon className="h-3.5 w-3.5" /> Categorias</TabsTrigger>
          <TabsTrigger value="centros" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> Centros de custo</TabsTrigger>
        </TabsList>

        {/* Evolução */}
        <TabsContent value="resumo">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Fluxo de caixa dos últimos 6 meses</CardTitle>
              <CardDescription>Receitas, despesas e lucro realizados</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                    <XAxis dataKey="name" className="text-[10px]" axisLine={false} tickLine={false} />
                    <YAxis className="text-[10px]" axisLine={false} tickLine={false} tickFormatter={fmtShort} />
                    <Tooltip
                      formatter={(v: number, n: string) => [fmt(v), n === 'receitas' ? 'Receitas' : n === 'despesas' ? 'Despesas' : 'Lucro']}
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '0.75rem', fontSize: '0.7rem' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '0.7rem' }} />
                    <Bar dataKey="receitas" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} name="Receitas" />
                    <Bar dataKey="despesas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="Despesas" />
                    <Bar dataKey="lucro" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Lucro" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DRE: resumo; a demonstração completa fica em /financeiro/dre */}
        <TabsContent value="dre">
          <section aria-labelledby="finance-dre-summary-title" className="rounded-xl border border-border bg-card">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h3 id="finance-dre-summary-title" className="text-sm font-semibold text-foreground">Resultado do mês</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Resumo pelos valores pagos em {format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })}. A DRE completa organiza o resultado pelo plano de contas.
                </p>
              </div>
              <Button asChild size="sm" variant="outline" className="min-h-11 shrink-0 gap-1.5 sm:min-h-9">
                <Link to={`/financeiro/dre?mes=${formatFinanceMonth(currentDate)}`}>
                  <FileText aria-hidden="true" className="h-4 w-4" /> Abrir DRE completa
                </Link>
              </Button>
            </header>
            <dl className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="px-4 py-3 sm:px-5">
                <dt className="text-xs font-medium text-muted-foreground">Receitas recebidas</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{fmt(dre.totalReceitas)}</dd>
              </div>
              <div className="px-4 py-3 sm:px-5">
                <dt className="text-xs font-medium text-muted-foreground">Despesas pagas</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{fmt(dre.totalDespesas)}</dd>
              </div>
              <div className="px-4 py-3 sm:px-5">
                <dt className="text-xs font-medium text-muted-foreground">Resultado operacional</dt>
                <dd className={cn('mt-1 text-lg font-semibold tabular-nums', dre.lucroOperacional < 0 ? 'text-destructive' : 'text-foreground')}>
                  {dre.lucroOperacional < 0 ? `−${fmt(Math.abs(dre.lucroOperacional))}` : fmt(dre.lucroOperacional)}
                </dd>
                <dd className="mt-0.5 text-xs text-muted-foreground">
                  {dre.margemLucro === null ? 'Sem receita para calcular a margem.' : `Margem ${formatarPercentualFinanceiro(dre.margemLucro)}`}
                </dd>
              </div>
            </dl>
          </section>
        </TabsContent>

        {/* Categorias */}
        <TabsContent value="categorias">
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            <section aria-labelledby="revenue-categories-title" className="p-4 sm:p-5">
              <header className="mb-4">
                <h3 id="revenue-categories-title" className="text-sm font-semibold text-foreground">Receitas por categoria</h3>
                <p className="mt-1 text-xs text-muted-foreground">Valores recebidos no período selecionado · Total {fmt(dre.totalReceitas)}</p>
              </header>
              {dre.receitasPorCat.length === 0 ? (
                <p role="status" className="py-5 text-sm text-muted-foreground">Nenhuma receita recebida neste período.</p>
              ) : (
                <ul className="space-y-3">
                  {dre.receitasPorCat.map(item => {
                    const pct = dre.totalReceitas > 0 ? (item.valor / dre.totalReceitas) * 100 : 0;
                    return (
                      <li key={item.cat} className="space-y-1.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm lg:pr-14">
                          <span className="font-medium text-foreground">{item.label}</span>
                          <span className="text-right tabular-nums text-foreground">{fmt(item.valor)} <span className="text-xs text-muted-foreground">({pct.toFixed(0)}%)</span></span>
                        </div>
                        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-success" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section aria-labelledby="expense-categories-title" className="p-4 sm:p-5">
              <header className="mb-4">
                <h3 id="expense-categories-title" className="text-sm font-semibold text-foreground">Despesas por categoria</h3>
                <p className="mt-1 text-xs text-muted-foreground">Valores pagos no período selecionado · Total {fmt(dre.totalDespesas)}</p>
              </header>
              {dre.despesasPorCat.length === 0 ? (
                <p role="status" className="py-5 text-sm text-muted-foreground">Nenhuma despesa paga neste período.</p>
              ) : (
                <ul className="space-y-3">
                  {dre.despesasPorCat.map(item => {
                    const pct = dre.totalDespesas > 0 ? (item.valor / dre.totalDespesas) * 100 : 0;
                    return (
                      <li key={item.cat} className="space-y-1.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm lg:pr-14">
                          <span className="font-medium text-foreground">{item.label}</span>
                          <span className="text-right tabular-nums text-foreground">{fmt(item.valor)} <span className="text-xs text-muted-foreground">({pct.toFixed(0)}%)</span></span>
                        </div>
                        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-destructive" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </TabsContent>

        {/* Centros de custo */}
        <TabsContent value="centros">
          <section aria-labelledby="cost-centers-title" className="overflow-hidden rounded-xl border border-border bg-card">
            <header className="border-b border-border px-4 py-3 sm:px-5">
              <h3 id="cost-centers-title" className="text-sm font-semibold text-foreground">Resultado por centro de custo</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Valores recebidos e pagos no mês, agrupados pelo centro de custo de cada conta.</p>
            </header>
            {centrosCusto.length === 0 ? (
              <p role="status" className="px-4 py-5 text-sm text-muted-foreground sm:px-5">Nenhuma movimentação realizada neste mês.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th scope="col" className="px-4 py-2 text-left font-medium sm:px-5">Centro de custo</th>
                    <th scope="col" className="hidden px-4 py-2 text-right font-medium sm:table-cell">Receitas</th>
                    <th scope="col" className="hidden px-4 py-2 text-right font-medium sm:table-cell">Despesas</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium sm:px-5">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {centrosCusto.map(item => (
                    <tr key={item.chave || 'sem-centro'} className="border-b border-border/70 last:border-0">
                      <th scope="row" className="px-4 py-2.5 text-left font-medium text-foreground sm:px-5">
                        {item.label}
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground sm:hidden">
                          Receitas {fmt(item.receitas)} · Despesas {fmt(item.despesas)}
                        </span>
                      </th>
                      <td className="hidden px-4 py-2.5 text-right tabular-nums sm:table-cell">{fmt(item.receitas)}</td>
                      <td className="hidden px-4 py-2.5 text-right tabular-nums sm:table-cell">{fmt(item.despesas)}</td>
                      <td className={cn('px-4 py-2.5 text-right font-semibold tabular-nums sm:px-5', item.resultado < 0 ? 'text-destructive' : 'text-foreground')}>
                        {item.resultado < 0 ? `−${fmt(Math.abs(item.resultado))}` : fmt(item.resultado)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </TabsContent>
      </Tabs>

      {/* Quick Access */}
      <section aria-labelledby="finance-operations-title" className="space-y-3">
        <div>
          <h2 id="finance-operations-title" className="text-base font-semibold text-foreground">Operações financeiras</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Acesse o trabalho relacionado por tipo de tarefa.</p>
        </div>
        <div className="grid overflow-hidden rounded-xl border border-border/70 bg-card md:grid-cols-3 md:divide-x md:divide-border/70">
          {[
            {
              title: 'Recebimentos',
              links: [
                { label: 'Caixa diário', desc: 'Receber e conferir pagamentos', href: '/caixa-diario' },
                { label: 'Contas a receber', desc: 'Cobranças e valores em aberto', href: '/contas?tab=receber' },
                { label: 'Cobrança de inadimplentes', desc: 'Títulos vencidos e contato com pacientes', href: '/cobranca-inadimplentes' },
              ],
            },
            {
              title: 'Movimentação',
              links: [
                { label: 'Contas a pagar', desc: 'Fornecedores e despesas', href: '/contas?tab=pagar' },
                { label: 'Fluxo de caixa', desc: 'Entradas e saídas por mês', href: `/fluxo-caixa?mes=${formatFinanceMonth(currentDate)}` },
                { label: 'Importar extrato', desc: 'Conferir o extrato bancário', href: `/fluxo-caixa/extrato?mes=${formatFinanceMonth(currentDate)}` },
              ],
            },
            {
              title: 'Resultado e cadastros',
              links: [
                { label: 'DRE e plano de contas', desc: 'Resultado pelo plano de contas', href: `/financeiro/dre?mes=${formatFinanceMonth(currentDate)}` },
                { label: 'Contas recorrentes', desc: 'Despesas que se repetem', href: '/financeiro/recorrencias' },
                { label: 'Relatórios', desc: 'Exportações e análises', href: '/relatorios' },
              ],
            },
          ].map(group => (
            <section key={group.title} aria-label={group.title} className="min-w-0 px-4 py-3 sm:px-5">
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
              <ul className="divide-y divide-border/60">
                {group.links.map(item => (
                  <li key={item.href}>
                    <Link to={item.href} className="group flex min-h-12 items-center justify-between gap-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
                      <span className="min-w-0"><span className="block text-sm font-medium text-foreground group-hover:text-primary">{item.label}</span><span className="block text-xs text-muted-foreground">{item.desc}</span></span>
                      <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
