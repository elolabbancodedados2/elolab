import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
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
import { useLancamentos } from '@/hooks/useSupabaseData';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { parseDateOnly } from '@/lib/dateOnly';
import { valorRealizado } from '@/lib/lancamentos';

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtShort = (v: number) => {
  if (Math.abs(v) >= 1000000) return `R$ ${(v / 1000000).toFixed(1)}M`;
  if (Math.abs(v) >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`;
  return fmt(v);
};

const fadeUp = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

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
  'hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))',
  'hsl(var(--destructive))', 'hsl(var(--info))', 'hsl(var(--accent-foreground))',
  'hsl(var(--muted-foreground))', 'hsl(var(--primary))',
];

export default function Financeiro() {
  const navigate = useNavigate();
  const { data: lancamentos = [], isLoading } = useLancamentos();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState('resumo');

  const mesAtual = { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
  const mesAnterior = { start: startOfMonth(subMonths(currentDate, 1)), end: endOfMonth(subMonths(currentDate, 1)) };

  // ─── KPIs ─────────────────────────────────────
  const kpis = useMemo(() => {
    const doMes = lancamentos.filter(l => {
      const d = parseDateOnly(l.data)!;
      return d >= mesAtual.start && d <= mesAtual.end;
    });
    const doMesAnt = lancamentos.filter(l => {
      const d = parseDateOnly(l.data)!;
      return d >= mesAnterior.start && d <= mesAnterior.end;
    });
    const receitas = doMes.filter(l => l.tipo === 'receita');
    const despesas = doMes.filter(l => l.tipo === 'despesa');
    const recebido = receitas.filter(l => l.status === 'pago').reduce((a, l) => a + valorRealizado(l), 0);
    const aReceber = receitas.filter(l => l.status === 'pendente').reduce((a, l) => a + Number(l.valor), 0);
    const totalReceitas = receitas.filter(l => l.status !== 'cancelado' && l.status !== 'estornado').reduce((a, l) => a + Number(l.valor), 0);
    const vencido = receitas.filter(l => {
      if (l.status !== 'pendente' || !l.data_vencimento) return false;
      return l.data_vencimento < format(new Date(), 'yyyy-MM-dd');
    }).reduce((a, l) => a + Number(l.valor), 0);
    const totalDespesas = despesas.filter(l => l.status === 'pago').reduce((a, l) => a + valorRealizado(l), 0);
    const aPagar = despesas.filter(l => l.status === 'pendente').reduce((a, l) => a + Number(l.valor), 0);
    const saldo = recebido - totalDespesas;

    // Previous month for comparison
    const recAnt = doMesAnt.filter(l => l.tipo === 'receita' && l.status === 'pago').reduce((a, l) => a + valorRealizado(l), 0);
    const despAnt = doMesAnt.filter(l => l.tipo === 'despesa' && l.status === 'pago').reduce((a, l) => a + valorRealizado(l), 0);
    const varReceita = recAnt > 0 ? ((recebido - recAnt) / recAnt) * 100 : 0;
    const varDespesa = despAnt > 0 ? ((totalDespesas - despAnt) / despAnt) * 100 : 0;

    const countPendentesReceber = receitas.filter(l => l.status === 'pendente').length;
    const countPendentesPagar = despesas.filter(l => l.status === 'pendente').length;
    const totalLancamentos = doMes.length;
    const taxaRecebimento = totalReceitas > 0 ? (recebido / totalReceitas) * 100 : 0;

    return {
      recebido, aReceber, vencido, totalDespesas, aPagar, saldo, totalReceitas,
      countPendentesReceber, countPendentesPagar, varReceita, varDespesa,
      totalLancamentos, taxaRecebimento,
    };
  }, [lancamentos, mesAtual, mesAnterior]);

  // ─── DRE ──────────────────────────────────────
  const dre = useMemo(() => {
    const doMes = lancamentos.filter(l => {
      const d = parseDateOnly(l.data)!;
      return d >= mesAtual.start && d <= mesAtual.end;
    });

    // Receitas por categoria
    // Estes dois agrupamentos ficaram com `valor` enquanto os KPIs do topo já
    // usavam `valorRealizado`: a soma das categorias não fechava com o total.
    const receitasPorCat: Record<string, number> = {};
    doMes.filter(l => l.tipo === 'receita' && l.status === 'pago').forEach(l => {
      const cat = l.categoria || 'outros';
      receitasPorCat[cat] = (receitasPorCat[cat] || 0) + valorRealizado(l);
    });

    // Despesas por categoria
    const despesasPorCat: Record<string, number> = {};
    doMes.filter(l => l.tipo === 'despesa' && l.status === 'pago').forEach(l => {
      const cat = l.categoria || 'outros';
      despesasPorCat[cat] = (despesasPorCat[cat] || 0) + valorRealizado(l);
    });

    const totalReceitas = Object.values(receitasPorCat).reduce((a, b) => a + b, 0);
    const totalDespesas = Object.values(despesasPorCat).reduce((a, b) => a + b, 0);
    const lucroOperacional = totalReceitas - totalDespesas;
    const margemLucro = totalReceitas > 0 ? (lucroOperacional / totalReceitas) * 100 : 0;

    return {
      receitasPorCat: Object.entries(receitasPorCat)
        .map(([k, v]) => ({ cat: k, label: CATEGORIAS_RECEITA[k] || k, valor: v }))
        .sort((a, b) => b.valor - a.valor),
      despesasPorCat: Object.entries(despesasPorCat)
        .map(([k, v]) => ({ cat: k, label: CATEGORIAS_DESPESA[k] || k, valor: v }))
        .sort((a, b) => b.valor - a.valor),
      totalReceitas, totalDespesas, lucroOperacional, margemLucro,
    };
  }, [lancamentos, mesAtual]);

  // ─── Chart (6 months) ─────────────────────────
  const chartData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(currentDate, 5 - i);
      const m = d.getMonth(); const y = d.getFullYear();
      const rec = lancamentos.filter(l => l.tipo === 'receita' && l.status === 'pago' && parseDateOnly(l.data)!.getMonth() === m && parseDateOnly(l.data)!.getFullYear() === y).reduce((a, l) => a + valorRealizado(l), 0);
      const des = lancamentos.filter(l => l.tipo === 'despesa' && l.status === 'pago' && parseDateOnly(l.data)!.getMonth() === m && parseDateOnly(l.data)!.getFullYear() === y).reduce((a, l) => a + valorRealizado(l), 0);
      return { name: format(d, 'MMM/yy', { locale: ptBR }), receitas: rec, despesas: des, lucro: rec - des };
    });
  }, [lancamentos, currentDate]);

  // ─── Receitas pie ─────────────────────────────
  const receitasPie = useMemo(() => {
    return dre.receitasPorCat.map(r => ({ name: r.label, value: r.valor }));
  }, [dre]);

  if (isLoading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
    </div>
  );

  return (
    <div className="space-y-6 pb-8">
      {/* Header with month navigation */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" /> Painel Financeiro
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Análise completa de receitas, despesas e resultados
          </p>
        </div>
        <div className="flex items-center gap-2 bg-muted/50 rounded-xl p-1">
          <Button aria-label="Mês anterior" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-bold text-sm min-w-[120px] text-center capitalize">
            {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
          </span>
          <Button aria-label="Próximo mês" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Receita Recebida', value: kpis.recebido, icon: CheckCircle2,
            color: 'text-success', bg: 'bg-success/10', border: 'border-success/20',
            var: kpis.varReceita,
          },
          {
            label: 'A Receber', value: kpis.aReceber, icon: Clock,
            color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20',
            sub: kpis.countPendentesReceber > 0 ? `${kpis.countPendentesReceber} pendente(s)` : undefined,
          },
          {
            label: 'Despesas Pagas', value: kpis.totalDespesas, icon: TrendingDown,
            color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20',
            var: kpis.varDespesa,
          },
          {
            label: 'Resultado Líquido', value: kpis.saldo, icon: DollarSign,
            color: kpis.saldo >= 0 ? 'text-success' : 'text-destructive',
            bg: kpis.saldo >= 0 ? 'bg-success/10' : 'bg-destructive/10',
            border: kpis.saldo >= 0 ? 'border-success/20' : 'border-destructive/20',
          },
        ].map((s, i) => (
          <motion.div key={s.label} variants={fadeUp}>
            <Card className={cn('border hover:shadow-md hover:-translate-y-0.5 transition-all', s.border)}>
              <CardContent className="py-4 px-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                    <p className={cn('text-2xl font-black mt-1 tabular-nums', s.color)}>{fmtShort(s.value)}</p>
                    {s.var !== undefined && s.var !== 0 && (
                      <div className={cn('flex items-center gap-0.5 text-[10px] mt-0.5', s.var > 0 ? 'text-success' : 'text-destructive')}>
                        {s.var > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {Math.abs(s.var).toFixed(1)}% vs mês anterior
                      </div>
                    )}
                    {s.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</p>}
                  </div>
                  <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center', s.bg)}>
                    <s.icon className={cn('h-5 w-5', s.color)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Inadimplência', value: fmt(kpis.vencido), icon: AlertTriangle, color: 'text-destructive' },
          { label: 'A Pagar', value: fmt(kpis.aPagar), icon: CreditCard, color: 'text-warning', sub: kpis.countPendentesPagar > 0 ? `${kpis.countPendentesPagar} pendente(s)` : undefined },
          { label: 'Taxa Recebimento', value: `${kpis.taxaRecebimento.toFixed(0)}%`, icon: Target, color: 'text-primary' },
          { label: 'Margem Lucro', value: `${dre.margemLucro.toFixed(1)}%`, icon: Percent, color: dre.margemLucro >= 0 ? 'text-success' : 'text-destructive' },
        ].map((s, i) => (
          <Card key={s.label} className="border">
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
                    <Bar dataKey="lucro" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Lucro" />
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
                <FileText className="h-5 w-5 text-primary" />
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
                dre.lucroOperacional >= 0 ? 'bg-primary/5 border-primary/20' : 'bg-destructive/5 border-destructive/20'
              )}>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider">Resultado Operacional</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Margem: {dre.margemLucro.toFixed(1)}%</p>
                </div>
                <span className={cn(
                  'text-3xl font-black tabular-nums',
                  dre.lucroOperacional >= 0 ? 'text-success' : 'text-destructive'
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
            { label: 'Contas a Receber', desc: 'Cobranças, recebimentos por categoria', icon: TrendingUp, href: '/contas-receber', color: 'text-primary', bg: 'bg-primary/10' },
            { label: 'Contas a Pagar', desc: 'Fornecedores, salários e despesas', icon: CreditCard, href: '/contas-pagar', color: 'text-destructive', bg: 'bg-destructive/10' },
            { label: 'Fluxo de Caixa', desc: 'Visão mensal de entradas e saídas', icon: Wallet, href: '/fluxo-caixa', color: 'text-blue-500', bg: 'bg-blue-500/10' },
            { label: 'Tabela de Preços', desc: 'Preços de exames por convênio', icon: Receipt, href: '/precos-exames', color: 'text-orange-500', bg: 'bg-orange-500/10' },
            { label: 'Tipos de Consulta', desc: 'Valores, durações e categorias', icon: Stethoscope, href: '/tipos-consulta', color: 'text-violet-500', bg: 'bg-violet-500/10' },
            { label: 'Relatórios', desc: 'Exportações e análises detalhadas', icon: BarChart3, href: '/relatorios', color: 'text-teal-500', bg: 'bg-teal-500/10' },
            { label: 'Pagamentos', desc: 'Histórico de pagamentos e recibos', icon: FileText, href: '/pagamentos', color: 'text-muted-foreground', bg: 'bg-muted' },
          ].map((item) => (
            <Card key={item.href} className="group cursor-pointer hover:shadow-md hover:-translate-y-1 transition-all border"
              onClick={() => navigate(item.href)}>
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
