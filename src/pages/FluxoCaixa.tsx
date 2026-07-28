import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLancamentos } from '@/hooks/useSupabaseData';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, subMonths, addMonths, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowUpCircle,
  ArrowDownCircle,
  Wallet,
  ChevronLeft,
  ChevronRight,
ArrowUpRight, ArrowDownRight} from 'lucide-react';
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

export default function FluxoCaixa() {
  const [currentDate, setCurrentDate] = useState(new Date());

  const { data: lancamentos = [], isLoading } = useLancamentos();

  const mesAtual = currentDate.getMonth();
  const anoAtual = currentDate.getFullYear();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Calcular totais do mês
  const totaisMes = useMemo(() => {
    const lancamentosMes = lancamentos.filter(l => {
      const data = parseISO(l.data);
      return data.getMonth() === mesAtual && data.getFullYear() === anoAtual;
    });

    const receitas = lancamentosMes
      .filter(l => l.tipo === 'receita' && l.status === 'pago')
      .reduce((acc, l) => acc + valorRealizado(l), 0);

    const despesas = lancamentosMes
      .filter(l => l.tipo === 'despesa' && l.status === 'pago')
      .reduce((acc, l) => acc + valorRealizado(l), 0);

    const receitasPendentes = lancamentosMes
      .filter(l => l.tipo === 'receita' && l.status === 'pendente')
      .reduce((acc, l) => acc + Number(l.valor), 0);

    const despesasPendentes = lancamentosMes
      .filter(l => l.tipo === 'despesa' && l.status === 'pendente')
      .reduce((acc, l) => acc + Number(l.valor), 0);

    return {
      receitas,
      despesas,
      saldo: receitas - despesas,
      receitasPendentes,
      despesasPendentes,
    };
  }, [lancamentos, mesAtual, anoAtual]);

  // Dados para gráfico diário
  const dadosDiarios = useMemo(() => {
    const inicio = startOfMonth(currentDate);
    const fim = endOfMonth(currentDate);
    const dias = eachDayOfInterval({ start: inicio, end: fim });

    let saldoAcumulado = 0;

    return dias.map(dia => {
      const dataStr = format(dia, 'yyyy-MM-dd');
      const lancamentosDia = lancamentos.filter(l => l.data === dataStr && l.status === 'pago');

      // lancamentosDia já está filtrado por status 'pago', então soma o
      // realizado — o que de fato entrou/saiu, com desconto e acréscimo.
      const receitas = lancamentosDia
        .filter(l => l.tipo === 'receita')
        .reduce((acc, l) => acc + valorRealizado(l), 0);

      const despesas = lancamentosDia
        .filter(l => l.tipo === 'despesa')
        .reduce((acc, l) => acc + valorRealizado(l), 0);

      saldoAcumulado += receitas - despesas;

      return {
        dia: format(dia, 'dd'),
        receitas,
        despesas,
        saldo: receitas - despesas,
        saldoAcumulado,
      };
    });
  }, [lancamentos, currentDate]);

  // Dados por categoria
  const dadosPorCategoria = useMemo(() => {
    const categorias: Record<string, { receitas: number; despesas: number }> = {};

    lancamentos
      .filter(l => {
        const data = parseISO(l.data);
        return data.getMonth() === mesAtual && data.getFullYear() === anoAtual && l.status === 'pago';
      })
      .forEach(l => {
        if (!categorias[l.categoria]) {
          categorias[l.categoria] = { receitas: 0, despesas: 0 };
        }
        if (l.tipo === 'receita') {
          categorias[l.categoria].receitas += valorRealizado(l);
        } else {
          categorias[l.categoria].despesas += valorRealizado(l);
        }
      });

    return Object.entries(categorias).map(([categoria, valores]) => ({
      categoria,
      ...valores,
    }));
  }, [lancamentos, mesAtual, anoAtual]);

  // Comparação com mês anterior
  const comparacaoMesAnterior = useMemo(() => {
    const mesAnterior = subMonths(currentDate, 1);
    const mesAnt = mesAnterior.getMonth();
    const anoAnt = mesAnterior.getFullYear();

    const lancamentosMesAnterior = lancamentos.filter(l => {
      const data = parseISO(l.data);
      return data.getMonth() === mesAnt && data.getFullYear() === anoAnt && l.status === 'pago';
    });

    const receitasAnt = lancamentosMesAnterior
      .filter(l => l.tipo === 'receita')
      .reduce((acc, l) => acc + valorRealizado(l), 0);

    const despesasAnt = lancamentosMesAnterior
      .filter(l => l.tipo === 'despesa')
      .reduce((acc, l) => acc + valorRealizado(l), 0);

    const variacaoReceita = receitasAnt > 0 
      ? ((totaisMes.receitas - receitasAnt) / receitasAnt) * 100 
      : 0;

    const variacaoDespesa = despesasAnt > 0 
      ? ((totaisMes.despesas - despesasAnt) / despesasAnt) * 100 
      : 0;

    return { variacaoReceita, variacaoDespesa };
  }, [lancamentos, currentDate, totaisMes]);

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  if (isLoading) {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Fluxo de Caixa</h1>
          <p className="text-muted-foreground">Acompanhe as movimentações financeiras</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium min-w-[140px] text-center">
            {format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })}
          </span>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Receitas', value: totaisMes.receitas, icon: ArrowUpCircle, color: 'text-success', bg: 'bg-success/10', border: 'border-success/20',
            trend: comparacaoMesAnterior.variacaoReceita, trendPositive: comparacaoMesAnterior.variacaoReceita > 0,
            sub: totaisMes.receitasPendentes > 0 ? `Pendente: ${formatCurrency(totaisMes.receitasPendentes)}` : undefined },
          { label: 'Despesas', value: totaisMes.despesas, icon: ArrowDownCircle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20',
            trend: comparacaoMesAnterior.variacaoDespesa, trendPositive: comparacaoMesAnterior.variacaoDespesa < 0,
            sub: totaisMes.despesasPendentes > 0 ? `Pendente: ${formatCurrency(totaisMes.despesasPendentes)}` : undefined },
          { label: 'Saldo do Mês', value: totaisMes.saldo, icon: Wallet,
            color: totaisMes.saldo >= 0 ? 'text-success' : 'text-destructive',
            bg: totaisMes.saldo >= 0 ? 'bg-success/10' : 'bg-destructive/10',
            border: totaisMes.saldo >= 0 ? 'border-success/20' : 'border-destructive/20' },
          { label: 'Margem', value: -1, icon: DollarSign, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20',
            pct: totaisMes.receitas > 0 ? ((totaisMes.saldo / totaisMes.receitas) * 100).toFixed(1) : '0' },
        ].map((s) => (
          <Card key={s.label} className={cn('border', s.border)}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                  {s.pct !== undefined ? (
                    <p className={cn('text-2xl font-bold', s.color)}>{s.pct}%</p>
                  ) : (
                    <p className={cn('text-2xl font-bold tabular-nums', s.color)}>{formatCurrency(s.value)}</p>
                  )}
                  {s.trend !== undefined && s.trend !== 0 && (
                    <div className={cn('flex items-center gap-1 mt-1 text-xs font-medium', s.trendPositive ? 'text-success' : 'text-destructive')}>
                      {s.trendPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {Math.abs(s.trend).toFixed(1)}%
                    </div>
                  )}
                  {s.sub && <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>}
                </div>
                <div className={cn('rounded-xl p-3', s.bg)}>
                  <s.icon className={cn('h-5 w-5', s.color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Evolução Diária */}
        <Card>
          <CardHeader>
            <CardTitle>Evolução Diária</CardTitle>
            <CardDescription>Receitas e despesas por dia</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosDiarios}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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
                  <Bar dataKey="receitas" name="Receitas" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesas" name="Despesas" fill="hsl(var(--chart-5))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Saldo Acumulado */}
        <Card>
          <CardHeader>
            <CardTitle>Saldo Acumulado</CardTitle>
            <CardDescription>Evolução do saldo ao longo do mês</CardDescription>
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
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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

      {/* Por Categoria */}
      <Card>
        <CardHeader>
          <CardTitle>Por Categoria</CardTitle>
          <CardDescription>Distribuição de receitas e despesas por categoria</CardDescription>
        </CardHeader>
        <CardContent>
          {dadosPorCategoria.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma movimentação neste mês
            </div>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosPorCategoria} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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
                  <Bar dataKey="receitas" name="Receitas" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="despesas" name="Despesas" fill="hsl(var(--chart-5))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
