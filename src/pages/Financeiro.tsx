import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import {
  DollarSign, TrendingUp, TrendingDown, CheckCircle2, Clock,
  AlertTriangle, HandCoins, CreditCard, Wallet, BarChart3,
  ArrowRight, Stethoscope, Receipt, FileText, ChevronLeft, ChevronRight,
  ArrowUpRight, ArrowDownRight, Building2, PieChart as PieChartIcon,
  Activity, Target, Percent, Users, Calendar,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
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
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { dateOnlyInTimeZone, inicioDoDiaEmFusoIso, parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { valorRealizado } from '@/lib/lancamentos';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtShort = formatarValorAbreviadoFinanceiro;

const CATEGORIAS_RECEITA: Record<string, string> = {
  consulta: 'Consultas', retorno: 'Retornos', procedimento: 'Procedimentos',
  exame: 'Exames', cirurgia: 'Cirurgias', internacao: 'Internações',
  taxa_administrativa: 'Taxas Admin.', taxa_material: 'Taxas Material',
  convenio_repasse: 'Repasse Convênio', honorario_medico: 'Honorários',
  fisioterapia: 'Fisioterapia', psicologia: 'Psicologia', pediatria: 'Pediatria',
  outros: 'Outros',
};

const CATEGORIAS_DESPESA: Record<string, string> = {
  fornecedores: 'Fornecedores', folha_pagamento: 'Folha Pagamento',
  impostos: 'Impostos', aluguel: 'Aluguel', servicos: 'Serviços',
  equipamentos: 'Equipamentos', marketing: 'Marketing', outros: 'Outros',
};

const PIE_COLORS = [
  '#1080CA', '#2ED5E7', 'hsl(var(--success))', 'hsl(var(--warning))',
  'hsl(var(--destructive))', '#0B4F7D', 'hsl(var(--muted-foreground))', '#5BA4D9',
];

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
  data: string;
  valor: number;
}

export default function Financeiro() {
  const navigate = useNavigate();
  const { profile } = useSupabaseAuth();
  const lancamentosQuery = useLancamentos();
  const { data: lancamentos = [] } = lancamentosQuery;
  const [currentDate, setCurrentDate] = useState(() =>
    parseDateOnly(dateOnlyInTimeZone(new Date(), 'America/Sao_Paulo'))!
  );
  const [activeTab, setActiveTab] = useState('resumo');

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
        .select('id,lancamento_id,valor,data_pagamento,estornado_em,lancamentos!inner(tipo,categoria,clinica_id)')
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
        categoria: conta.categoria || 'outros',
        data: dataPagamento,
        valor: Number(pagamento.valor),
      });
      if (pagamento.estornado_em) {
        const dataEstorno = dateOnlyInTimeZone(new Date(pagamento.estornado_em), 'America/Sao_Paulo');
        if (dataEstorno >= inicioHistorico && dataEstorno < fimHistoricoExclusivo) eventos.push({
          id: `${pagamento.id}:estorno`,
          lancamentoId: pagamento.lancamento_id,
          tipo: conta.tipo,
          categoria: conta.categoria || 'outros',
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
          ? [{ id: l.id, lancamentoId: l.id, tipo: l.tipo, categoria: l.categoria || 'outros', data, valor: valorRealizado(l) }]
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

    // Agrupa as mesmas transações individuais exibidas no caixa do período.
    const receitasPorCat: Record<string, number> = {};
    doMes.filter(evento => evento.tipo === 'receita').forEach(evento => {
      const cat = evento.categoria || 'outros';
      receitasPorCat[cat] = (receitasPorCat[cat] || 0) + evento.valor;
    });

    const despesasPorCat: Record<string, number> = {};
    doMes.filter(evento => evento.tipo === 'despesa').forEach(evento => {
      const cat = evento.categoria || 'outros';
      despesasPorCat[cat] = (despesasPorCat[cat] || 0) + evento.valor;
    });

    const totalReceitas = Object.values(receitasPorCat).reduce((a, b) => a + b, 0);
    const totalDespesas = Object.values(despesasPorCat).reduce((a, b) => a + b, 0);
    const lucroOperacional = totalReceitas - totalDespesas;
    const margemLucro = calcularMargemLucro(totalReceitas, lucroOperacional);

    return {
      receitasPorCat: Object.entries(receitasPorCat)
        .map(([k, v]) => ({ cat: k, label: CATEGORIAS_RECEITA[k] || k, valor: v }))
        .sort((a, b) => b.valor - a.valor),
      despesasPorCat: Object.entries(despesasPorCat)
        .map(([k, v]) => ({ cat: k, label: CATEGORIAS_DESPESA[k] || k, valor: v }))
        .sort((a, b) => b.valor - a.valor),
      totalReceitas, totalDespesas, lucroOperacional, margemLucro,
    };
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
  const receitasPie = useMemo(() => {
    return dre.receitasPorCat.map(r => ({ name: r.label, value: r.valor }));
  }, [dre]);

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
        title="Painel Financeiro"
        description="Análise completa de receitas, despesas e resultados"
        icon={<DollarSign />}
        className="rounded-[22px] border border-border/60 bg-card p-4 shadow-xs sm:p-5"
        actions={(
          <div className="flex items-center gap-1 rounded-full border border-border/60 bg-card p-1 shadow-xs">
            <Button aria-label="Mês anterior" variant="ghost" size="icon" className="h-8 w-8 rounded-full text-[#1080CA] hover:bg-[#1080CA]/10" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[120px] text-center text-sm font-bold capitalize text-foreground">
              {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <Button aria-label="Próximo mês" variant="ghost" size="icon" className="h-8 w-8 rounded-full text-[#1080CA] hover:bg-[#1080CA]/10" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 text-xs font-semibold" onClick={() => setCurrentDate(new Date())}>
              Hoje
            </Button>
          </div>
        )}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Receita Recebida', value: kpis.recebido, icon: CheckCircle2,
            color: 'text-success', bg: 'bg-success/10', border: 'border-success/20',
            var: kpis.varReceita,
            varNovaBase: kpis.receitaSemBaseAnterior,
            varGoodWhenUp: true,
          },
          {
            label: 'A Receber', value: kpis.aReceber, icon: Clock,
            color: 'text-[#1080CA]', bg: 'bg-[#1080CA]/10', border: 'border-[#1080CA]/20',
            varNovaBase: false,
            sub: kpis.countPendentesReceber > 0 ? `${kpis.countPendentesReceber} em aberto` : undefined,
            varGoodWhenUp: false,
          },
          {
            label: 'Despesas Pagas', value: kpis.totalDespesas, icon: TrendingDown,
            color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20',
            var: kpis.varDespesa,
            varNovaBase: kpis.despesaSemBaseAnterior,
            varGoodWhenUp: false,
          },
          {
            label: 'Resultado Líquido', value: kpis.saldo, icon: DollarSign,
            color: kpis.saldo >= 0 ? 'text-white' : 'text-red-300',
            bg: 'bg-white/10',
            border: 'border-transparent',
            escuro: true,
            varNovaBase: false,
            varGoodWhenUp: true,
          },
        ].map((s) => (
          <div key={s.label}>
            <Card className={cn('h-full rounded-2xl border border-border/60 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md', s.border, 'escuro' in s && s.escuro && 'bg-gradient-primary text-white')}>
              <CardContent className="py-4 px-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className={cn('text-[10px] font-semibold uppercase tracking-wider', 'escuro' in s && s.escuro ? 'text-white/70' : 'text-muted-foreground')}>{s.label}</p>
                    <p className={cn('text-2xl font-black mt-1 tabular-nums', s.color)}>{fmtShort(s.value)}</p>
                    {s.varNovaBase ? (
                      <p className="text-[10px] mt-0.5 text-muted-foreground">Sem base no mês anterior</p>
                    ) : s.var !== undefined && s.var !== 0 && (
                      <div className={cn('flex items-center gap-0.5 text-[10px] mt-0.5', (s.var > 0) === s.varGoodWhenUp ? 'text-success' : 'text-destructive')}>
                        {s.var > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {formatarPercentualFinanceiro(Math.abs(s.var))} vs mês anterior
                      </div>
                    )}
                    {s.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</p>}
                  </div>
                  <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center ring-1 ring-inset ring-black/[0.03]', s.bg)}>
                    <s.icon className={cn('h-5 w-5', s.color)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

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

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Atrasos acumulados', value: fmt(kpis.vencido), icon: AlertTriangle, color: 'text-destructive', sub: `${kpis.countContasVencidas} ${kpis.countContasVencidas === 1 ? 'conta vencida' : 'contas vencidas'} até hoje` },
          { label: 'A Pagar', value: fmt(kpis.aPagar), icon: CreditCard, color: 'text-warning', sub: kpis.countPendentesPagar > 0 ? `${kpis.countPendentesPagar} em aberto` : undefined },
          { label: 'Taxa Recebimento', value: `${kpis.taxaRecebimento.toFixed(0)}%`, icon: Target, color: 'text-[#1080CA]', sub: 'Contas com vencimento no mês' },
          { label: 'Margem de lucro', value: dre.margemLucro === null ? '—' : formatarPercentualFinanceiro(dre.margemLucro), icon: Percent, color: dre.margemLucro === null ? 'text-muted-foreground' : dre.margemLucro >= 0 ? 'text-success' : 'text-destructive', sub: dre.margemLucro === null ? 'Sem receita para calcular no período' : undefined },
        ].map((s, i) => (
          <Card key={s.label} className="rounded-2xl border-border/60 shadow-xs">
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <s.icon className={cn('h-4 w-4 shrink-0', s.color)} />
              <div>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{s.label}</p>
                <p className={cn('text-base font-black tabular-nums', s.color)}>{s.value}</p>
                {s.sub && <p className="text-[10px] text-muted-foreground">{s.sub}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="resumo" className="gap-1.5"><Activity className="h-3.5 w-3.5" /> Evolução</TabsTrigger>
          <TabsTrigger value="dre" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> DRE</TabsTrigger>
          <TabsTrigger value="categorias" className="gap-1.5"><PieChartIcon className="h-3.5 w-3.5" /> Categorias</TabsTrigger>
        </TabsList>

        {/* Evolução */}
        <TabsContent value="resumo">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Fluxo de Caixa — Últimos 6 meses</CardTitle>
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
                    <Bar dataKey="lucro" fill="#1080CA" radius={[4, 4, 0, 0]} name="Lucro" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DRE */}
        <TabsContent value="dre">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#1080CA]" />
                DRE — Demonstrativo de Resultado
              </CardTitle>
              <CardDescription>
                {format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })} — Receitas e despesas realizadas (pagas)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {/* Receitas */}
              <div className="rounded-lg bg-success/5 border border-success/10 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-success mb-2 flex items-center gap-1.5">
                  <ArrowUpRight className="h-3.5 w-3.5" /> Receitas Operacionais
                </p>
                {dre.receitasPorCat.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma receita no período.</p>
                ) : (
                  <div className="space-y-1">
                    {dre.receitasPorCat.map(r => (
                      <div key={r.cat} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{r.label}</span>
                        <span className="font-bold tabular-nums text-success">{fmt(r.valor)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Separator className="my-2" />
                <div className="flex items-center justify-between font-black text-sm">
                  <span className="text-success">TOTAL RECEITAS</span>
                  <span className="text-success tabular-nums">{fmt(dre.totalReceitas)}</span>
                </div>
              </div>

              {/* Despesas */}
              <div className="rounded-lg bg-destructive/5 border border-destructive/10 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-destructive mb-2 flex items-center gap-1.5">
                  <ArrowDownRight className="h-3.5 w-3.5" /> Despesas Operacionais
                </p>
                {dre.despesasPorCat.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma despesa no período.</p>
                ) : (
                  <div className="space-y-1">
                    {dre.despesasPorCat.map(r => (
                      <div key={r.cat} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{r.label}</span>
                        <span className="font-bold tabular-nums text-destructive">-{fmt(r.valor)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Separator className="my-2" />
                <div className="flex items-center justify-between font-black text-sm">
                  <span className="text-destructive">TOTAL DESPESAS</span>
                  <span className="text-destructive tabular-nums">-{fmt(dre.totalDespesas)}</span>
                </div>
              </div>

              {/* Resultado */}
              <div className={cn(
                'rounded-lg border p-4 flex items-center justify-between',
                dre.totalReceitas === 0 && dre.totalDespesas === 0
                  ? 'bg-muted/30 border-border'
                  : dre.lucroOperacional >= 0 ? 'bg-[#1080CA]/5 border-[#1080CA]/20' : 'bg-destructive/5 border-destructive/20'
              )}>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider">Resultado Operacional</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{dre.margemLucro === null ? 'Sem receita para calcular a margem no período.' : `Margem: ${formatarPercentualFinanceiro(dre.margemLucro)}`}</p>
                </div>
                <span className={cn(
                  'text-3xl font-black tabular-nums',
                  dre.totalReceitas === 0 && dre.totalDespesas === 0
                    ? 'text-muted-foreground'
                    : dre.lucroOperacional >= 0 ? 'text-success' : 'text-destructive'
                )}>
                  {dre.lucroOperacional >= 0 ? '' : '-'}{fmt(Math.abs(dre.lucroOperacional))}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categorias */}
        <TabsContent value="categorias">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-success">Receitas por Categoria</CardTitle>
              </CardHeader>
              <CardContent>
                {receitasPie.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">Sem dados</p>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="h-52 w-52 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={receitasPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={80} strokeWidth={2}>
                            {receitasPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '0.75rem', fontSize: '0.7rem' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-1.5 flex-1 min-w-0">
                      {receitasPie.map((item, i) => (
                        <div key={item.name} className="flex items-center justify-between text-xs gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="truncate text-muted-foreground">{item.name}</span>
                          </div>
                          <span className="font-bold tabular-nums shrink-0">{fmt(item.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-destructive">Despesas por Categoria</CardTitle>
              </CardHeader>
              <CardContent>
                {dre.despesasPorCat.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">Sem dados</p>
                ) : (
                  <div className="space-y-2">
                    {dre.despesasPorCat.map((item, i) => {
                      const pct = dre.totalDespesas > 0 ? (item.valor / dre.totalDespesas) * 100 : 0;
                      return (
                        <div key={item.cat} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{item.label}</span>
                            <span className="font-bold tabular-nums">{fmt(item.valor)} ({pct.toFixed(0)}%)</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-destructive/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Quick Access */}
      <div>
        <h2 className="text-lg font-bold mb-4">Acesso Rápido</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Caixa Diário', desc: 'Abrir/fechar caixa, receber pagamentos', icon: HandCoins, href: '/caixa', color: 'text-success', bg: 'bg-success/10' },
            { label: 'Contas a Receber', desc: 'Cobranças, recebimentos por categoria', icon: TrendingUp, href: '/contas-receber', color: 'text-[#1080CA]', bg: 'bg-[#1080CA]/10' },
            { label: 'Contas a Pagar', desc: 'Fornecedores, salários e despesas', icon: CreditCard, href: '/contas-pagar', color: 'text-destructive', bg: 'bg-destructive/10' },
            { label: 'Fluxo de Caixa', desc: 'Visão mensal de entradas e saídas', icon: Wallet, href: '/fluxo-caixa', color: 'text-info', bg: 'bg-info/10' },
            { label: 'Tabela de Preços', desc: 'Preços de exames por convênio', icon: Receipt, href: '/precos-exames', color: 'text-warning-foreground', bg: 'bg-warning/10' },
            { label: 'Tipos de Consulta', desc: 'Valores, durações e categorias', icon: Stethoscope, href: '/tipos-consulta', color: 'text-[#1080CA]', bg: 'bg-[#1080CA]/10' },
            { label: 'Relatórios', desc: 'Exportações e análises detalhadas', icon: BarChart3, href: '/relatorios', color: 'text-info', bg: 'bg-info/10' },
            { label: 'Pagamentos', desc: 'Histórico de pagamentos e recibos', icon: FileText, href: '/pagamentos', color: 'text-muted-foreground', bg: 'bg-muted' },
          ].map((item) => (
            <Card key={item.href} role="link" tabIndex={0} aria-label={`Abrir ${item.label}`}
              className="group cursor-pointer rounded-2xl border border-border/60 shadow-xs transition-all hover:-translate-y-1 hover:border-[#1080CA]/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]"
              onClick={() => navigate(item.href)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  navigate(item.href);
                }
              }}>
              <CardContent className="py-5 px-5">
                <div className="flex items-start gap-3">
                  <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', item.bg)}>
                    <item.icon className={cn('h-5 w-5', item.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-sm">{item.label}</p>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
