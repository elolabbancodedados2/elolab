import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { ErrorState } from '@/components/ErrorState';
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

export default function FluxoCaixa() {
  const [currentDate, setCurrentDate] = useState(() =>
    parseDateOnly(dateOnlyInTimeZone(new Date(), 'America/Sao_Paulo'))!
  );
  const { profile } = useSupabaseAuth();

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
      if (!conta || !['receita', 'despesa'].includes(conta.tipo)) return [];
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

    const receitas = realizadosNoMes
      .filter(l => l.tipo === 'receita')
      .reduce((acc, l) => acc + l.valor, 0);

    const despesas = realizadosNoMes
      .filter(l => l.tipo === 'despesa')
      .reduce((acc, l) => acc + l.valor, 0);

    const receitasPendentes = emAbertoNoMes
      .filter(l => l.tipo === 'receita')
      .reduce((acc, l) => acc + valorAberto(l), 0);

    const despesasPendentes = emAbertoNoMes
      .filter(l => l.tipo === 'despesa')
      .reduce((acc, l) => acc + valorAberto(l), 0);

    return {
      receitas,
      despesas,
      saldo: receitas - despesas,
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
      const receitas = lancamentosDia
        .filter(l => l.tipo === 'receita')
        .reduce((acc, l) => acc + l.valor, 0);

      const despesas = lancamentosDia
        .filter(l => l.tipo === 'despesa')
        .reduce((acc, l) => acc + l.valor, 0);

      saldoAcumulado += receitas - despesas;

      return {
        dia: format(dia, 'dd'),
        receitas,
        despesas,
        saldo: receitas - despesas,
        saldoAcumulado,
      };
    });
  }, [eventosRealizados, currentDate]);

  // Dados por categoria
  const dadosPorCategoria = useMemo(() => {
    const categorias: Record<string, { receitas: number; despesas: number }> = {};

    eventosRealizados
      .filter(evento => noMes(evento.data, mesAtual, anoAtual))
      .forEach(l => {
        if (!categorias[l.categoria]) {
          categorias[l.categoria] = { receitas: 0, despesas: 0 };
        }
        if (l.tipo === 'receita') {
          categorias[l.categoria].receitas += l.valor;
        } else if (l.tipo === 'despesa') {
          categorias[l.categoria].despesas += l.valor;
        }
      });

    return Object.entries(categorias).map(([categoria, valores]) => ({
      categoria: rotuloCategoria(categoria),
      ...valores,
    }));
  }, [eventosRealizados, mesAtual, anoAtual]);

  // Comparação com mês anterior
  const comparacaoMesAnterior = useMemo(() => {
    const mesAnterior = subMonths(currentDate, 1);
    const mesAnt = mesAnterior.getMonth();
    const anoAnt = mesAnterior.getFullYear();

    const lancamentosMesAnterior = eventosRealizados.filter(l => noMes(l.data, mesAnt, anoAnt));

    const receitasAnt = lancamentosMesAnterior
      .filter(l => l.tipo === 'receita')
      .reduce((acc, l) => acc + l.valor, 0);

    const despesasAnt = lancamentosMesAnterior
      .filter(l => l.tipo === 'despesa')
      .reduce((acc, l) => acc + l.valor, 0);

    const variacaoReceita = receitasAnt > 0 
      ? ((totaisMes.receitas - receitasAnt) / receitasAnt) * 100 
      : 0;

    const variacaoDespesa = despesasAnt > 0 
      ? ((totaisMes.despesas - despesasAnt) / despesasAnt) * 100 
      : 0;

    return {
      variacaoReceita,
      variacaoDespesa,
      receitaSemBaseAnterior: receitasAnt === 0 && totaisMes.receitas > 0,
      despesaSemBaseAnterior: despesasAnt === 0 && totaisMes.despesas > 0,
    };
  }, [eventosRealizados, currentDate, totaisMes]);

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Fluxo de Caixa</h1>
          <p className="text-muted-foreground">Acompanhe as movimentações financeiras</p>
        </div>
        <div className="flex items-center gap-2">
          <Button aria-label="Mês anterior" variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium min-w-[140px] text-center">
            {format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })}
          </span>
          <Button aria-label="Próximo mês" variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {consultaAtingiuLimite && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            A consulta atingiu o limite de {Math.min(MAX_LINHAS_AUTO, LIMITE_BUSCA_EM_BLOCOS).toLocaleString('pt-BR')} registros.
            Se houver mais movimentos, os totais e gráficos podem estar incompletos.
          </p>
        </div>
      )}

      {/* Cards de Resumo */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Recebido no mês', value: totaisMes.receitas, icon: ArrowUpCircle, color: 'text-success', bg: 'bg-success/10', border: 'border-success/20',
            trend: comparacaoMesAnterior.variacaoReceita, trendPositive: comparacaoMesAnterior.variacaoReceita > 0,
            trendNovaBase: comparacaoMesAnterior.receitaSemBaseAnterior,
            sub: totaisMes.receitasPendentes > 0 ? `Em aberto com vencimento no mês: ${formatCurrency(totaisMes.receitasPendentes)}` : undefined },
          { label: 'Pago no mês', value: totaisMes.despesas, icon: ArrowDownCircle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20',
            trend: comparacaoMesAnterior.variacaoDespesa, trendPositive: comparacaoMesAnterior.variacaoDespesa < 0,
            trendNovaBase: comparacaoMesAnterior.despesaSemBaseAnterior,
            sub: totaisMes.despesasPendentes > 0 ? `Em aberto com vencimento no mês: ${formatCurrency(totaisMes.despesasPendentes)}` : undefined },
          { label: 'Saldo do Mês', value: totaisMes.saldo, icon: Wallet,
            color: totaisMes.saldo >= 0 ? 'text-success' : 'text-destructive',
            bg: totaisMes.saldo >= 0 ? 'bg-success/10' : 'bg-destructive/10',
            border: totaisMes.saldo >= 0 ? 'border-success/20' : 'border-destructive/20', trendNovaBase: false },
          { label: 'Margem', value: -1, icon: DollarSign, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20',
            pct: totaisMes.receitas > 0 ? `${((totaisMes.saldo / totaisMes.receitas) * 100).toFixed(1)}%` : '—', trendNovaBase: false },
        ].map((s) => (
          <Card key={s.label} className={cn('border', s.border)}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                  {s.pct !== undefined ? (
                    <p className={cn('text-2xl font-bold', s.color)}>{s.pct}</p>
                  ) : (
                    <p className={cn('text-2xl font-bold tabular-nums', s.color)}>{formatCurrency(s.value)}</p>
                  )}
                  {s.trendNovaBase ? (
                    <p className="mt-1 text-xs text-muted-foreground">Sem base no mês anterior</p>
                  ) : s.trend !== undefined && s.trend !== 0 && (
                    <div className={cn('flex items-center gap-1 mt-1 text-xs font-medium', s.trendPositive ? 'text-success' : 'text-destructive')}>
                      {s.trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
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
            <CardDescription>Entradas e saídas registradas por dia</CardDescription>
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
            <CardDescription>Variação acumulada no mês; não inclui saldo inicial de caixa</CardDescription>
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
          <CardDescription>Valores efetivamente recebidos e pagos no mês, por categoria</CardDescription>
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
