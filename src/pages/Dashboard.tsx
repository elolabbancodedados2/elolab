import { nomeMedico } from '@/lib/formatters';
import { useState, useMemo, useEffect } from 'react';
import { DoctorDashboard } from '@/components/dashboard/DoctorDashboard';
import { AdminDashboardOverview } from '@/components/dashboard/AdminDashboardOverview';
import { formatAppointmentStatus } from '@/components/dashboard/appointmentStatus';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { OnboardingWizard } from '@/components/OnboardingWizard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { MAX_LINHAS_AUTO, useAgendamentosPeriodo, useSupabaseQuery, useEstoque, useMedicos, useFilaAtendimento } from '@/hooks/useSupabaseData';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import {
  Users, Calendar, Clock, UserPlus, CalendarPlus, ArrowRight, ArrowUpRight,
  Activity, Stethoscope, Package, FileText, TrendingUp, TrendingDown,
  Sparkles, CheckCircle2, AlertTriangle, Wallet, Plus, BarChart3,
  ClipboardList, HeartPulse, Bell,
  ShieldCheck, Target, Timer, Megaphone, Pill, Eye,
} from 'lucide-react';
import { DashboardSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ErrorState';
import { Link } from 'react-router-dom';
import dashboardBanner from '@/assets/dashboard-banner-elolab.png';
import logoHorizontal from '@/assets/elolab-logo-identidade.png';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { dateOnlyInTimeZone, inicioDoDiaEmFusoIso, parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { valorRealizado } from '@/lib/lancamentos';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatCurrencyShort = (value: number) => {
  if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(1)}k`;
  return formatCurrency(value);
};

// ─── Animations ────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.04, duration: 0.45, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } };

// ─── Live Clock ────────────────────────────────────────────
function useClinicClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return time;
}

function LiveClock() {
  const time = useClinicClock();
  return (
    <span className="tabular-nums font-semibold text-xs tracking-tight">
      {new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(time)}
    </span>
  );
}

// ─── SVG Progress Ring ─────────────────────────────────────
function ProgressRing({ value, size = 80, strokeWidth = 6, color = 'hsl(var(--primary))' }: {
  value: number; size?: number; strokeWidth?: number; color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(value, 100) / 100) * circumference;
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke="hsl(var(--muted))" strokeWidth={strokeWidth} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />
    </svg>
  );
}

// ─── Sparkline ─────────────────────────────────────────────
function Sparkline({ data, color = 'hsl(var(--primary))' }: { data: number[]; color?: string }) {
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={36}>
      <LineChart data={chartData}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── KPI Card ──────────────────────────────────────────────
function KPICard({ title, value, subtitle, icon: Icon, color, href, delay = 0, sparkData, trend }: {
  title: string; value: string | number; subtitle?: string; icon: React.ElementType;
  color: 'primary' | 'success' | 'warning' | 'info' | 'destructive';
  href?: string; delay?: number; sparkData?: number[]; trend?: number;
}) {
  const colorMap = {
    primary: { bg: 'bg-primary/8', text: 'text-primary', ring: 'ring-primary/15', spark: 'hsl(var(--primary))' },
    success: { bg: 'bg-success/8', text: 'text-success', ring: 'ring-success/15', spark: 'hsl(var(--success))' },
    warning: { bg: 'bg-warning/8', text: 'text-warning', ring: 'ring-warning/15', spark: 'hsl(var(--warning))' },
    info: { bg: 'bg-info/8', text: 'text-info', ring: 'ring-info/15', spark: 'hsl(var(--info))' },
    destructive: { bg: 'bg-destructive/8', text: 'text-destructive', ring: 'ring-destructive/15', spark: 'hsl(var(--destructive))' },
  };
  const c = colorMap[color];

  const content = (
    <motion.div variants={fadeUp} custom={delay}>
      <Card className="group relative overflow-hidden border-border/60 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start justify-between mb-2">
            <div className="space-y-1 flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">{title}</p>
              <div className="flex items-baseline gap-2">
                <p className="text-[28px] font-bold font-display tracking-tight tabular-nums truncate">{value}</p>
                {trend !== undefined && trend !== 0 && (
                  <span className={cn('text-[11px] font-semibold flex items-center gap-0.5',
                    trend > 0 ? 'text-success' : 'text-destructive'
                  )}>
                    {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {trend > 0 ? '+' : ''}{trend}%
                  </span>
                )}
              </div>
              {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
            </div>
            <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center ring-1 shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-md', c.bg, c.ring)}>
              <Icon className={cn('h-5 w-5', c.text)} />
            </div>
          </div>
          {sparkData && sparkData.length > 1 && (
            <div className="opacity-30 group-hover:opacity-100 transition-opacity duration-300 -mx-1 mt-1">
              <Sparkline data={sparkData} color={c.spark} />
            </div>
          )}
        </CardContent>
        {href && (
          <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0">
            <ArrowUpRight className={cn('h-4 w-4', c.text)} />
          </div>
        )}
      </Card>
    </motion.div>
  );
  return href ? <Link to={href} className="block">{content}</Link> : content;
}

// ─── Finance Stat Row ──────────────────────────────────────
function FinanceStat({ label, value, icon: Icon, variant }: {
  label: string; value: string; icon: React.ElementType;
  variant: 'positive' | 'neutral' | 'negative';
}) {
  const styles = {
    positive: 'text-success',
    neutral: 'text-warning',
    negative: 'text-destructive',
  };
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0">
      <div className="flex items-center gap-2.5">
        <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center', 
          variant === 'positive' ? 'bg-success/8' : variant === 'neutral' ? 'bg-warning/8' : 'bg-destructive/8'
        )}>
          <Icon className={cn('h-3.5 w-3.5', styles[variant])} />
        </div>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className={cn('text-sm font-bold tabular-nums', styles[variant])}>{value}</span>
    </div>
  );
}

// ─── Quick Action Button ───────────────────────────────────
function QuickActionBtn({ icon: Icon, label, href, color }: {
  icon: React.ElementType; label: string; href: string; color: string;
}) {
  return (
    <Link to={href} className="group flex min-h-14 items-center gap-3 rounded-xl border border-border/60 bg-card p-3 transition-colors hover:border-primary/25 hover:bg-accent/40">
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105', color)}>
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-xs font-medium text-foreground transition-colors">{label}</span>
    </Link>
  );
}

const roleWorkspaces = {
  admin: { title: 'Visão da administração', description: 'Acompanhe operação, equipe e resultados da clínica.', actions: [
    { label: 'Analytics', href: '/analytics', icon: BarChart3 }, { label: 'Equipe', href: '/equipe', icon: Users }, { label: 'Configurações', href: '/configuracoes', icon: ShieldCheck },
  ] },
  recepcao: { title: 'Seu turno na recepção', description: 'Priorize chegada, agenda e comunicação com pacientes.', actions: [
    { label: 'Abrir recepção', href: '/recepcao', icon: ClipboardList }, { label: 'Agenda de hoje', href: '/agenda', icon: Calendar }, { label: 'Fila de atendimento', href: '/fila', icon: Timer },
  ] },
  enfermagem: { title: 'Cuidados e laboratório', description: 'Acesse triagem, coletas e resultados pendentes.', actions: [
    { label: 'Triagem', href: '/triagem', icon: HeartPulse }, { label: 'Mapa de coleta', href: '/mapa-coleta', icon: ClipboardList }, { label: 'Laboratório', href: '/laboratorio', icon: Activity },
  ] },
  financeiro: { title: 'Rotina financeira', description: 'Concilie recebimentos, vencimentos e caixa.', actions: [
    { label: 'Financeiro', href: '/financeiro', icon: Wallet }, { label: 'Contas', href: '/contas', icon: FileText }, { label: 'Inadimplentes', href: '/cobranca-inadimplentes', icon: AlertTriangle },
  ] },
} as const;

const dashboardRolePriority = ['admin', 'recepcao', 'enfermagem', 'financeiro'] as const;

export function getDashboardLinksForRoles(roles: string[]): string[] {
  const role = dashboardRolePriority.find(item => roles.includes(item));
  return role ? roleWorkspaces[role].actions.map(action => action.href) : [];
}

function RoleWorkspace({ roles }: { roles: string[] }) {
  const role = dashboardRolePriority.find(item => roles.includes(item));
  if (!role) return null;
  const workspace = roleWorkspaces[role];
  return <section aria-labelledby="role-workspace-title" className="rounded-2xl border border-primary/15 bg-primary/[0.03] p-4 md:p-5">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div><h2 id="role-workspace-title" className="font-semibold">{workspace.title}</h2><p className="text-sm text-muted-foreground">{workspace.description}</p></div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{workspace.actions.map(({ label, href, icon: Icon }) => <Button key={href} asChild variant="outline" className="min-h-11 justify-start bg-background"><Link to={href}><Icon className="mr-2 h-4 w-4" />{label}</Link></Button>)}</div>
    </div>
  </section>;
}

function OperationalDashboard({ roles, nome }: { roles: string[]; nome?: string | null }) {
  const agora = useClinicClock();
  const hora = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23',
  }).format(agora));
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const dataLocal = parseDateOnly(todaySaoPauloDateOnly(agora))!;
  return <div className="space-y-6">
    <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/[0.06] via-card to-card">
      <CardContent className="p-6 md:p-8">
        <p className="text-sm font-medium text-primary">{saudacao}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{nome?.split(' ')[0] || 'Olá'}</h1>
        <p className="mt-2 text-sm capitalize text-muted-foreground">{format(dataLocal, "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
      </CardContent>
    </Card>
    <RoleWorkspace roles={roles} />
    <Card>
      <CardHeader><CardTitle className="text-base">Seu espaço de trabalho</CardTitle><CardDescription>Os atalhos exibidos respeitam as permissões atribuídas ao seu perfil.</CardDescription></CardHeader>
      <CardContent className="flex items-start gap-3 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />Você verá apenas os módulos necessários para sua função. Se precisar de outro acesso, solicite ao administrador da clínica.</CardContent>
    </Card>
  </div>;
}

// ─── Main Dashboard ────────────────────────────────────────
export default function Dashboard() {
  const { profile: user, isAdmin } = useSupabaseAuth();
  const { isMedicoOnly } = useCurrentMedico();

  // Decide o painel ANTES de carregar dados. Antes, médico e recepção baixavam
  // pacientes, agenda, lançamentos e estoque da clínica inteira só para depois
  // verem um painel que não usa nada disso.
  if (isMedicoOnly) {
    return <DoctorDashboard userName={user?.nome || 'Doutor(a)'} />;
  }
  if (!isAdmin()) {
    return <OperationalDashboard roles={user?.roles || []} nome={user?.nome} />;
  }
  return <AdminDashboard />;
}

/** Primeiro dia do mês, `n` meses atrás, como yyyy-MM-dd. */
function inicioDoMes(mesesAtras: number) {
  const [year, month] = todaySaoPauloDateOnly().split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 - mesesAtras, 1)).toISOString().slice(0, 10);
}

function inicioDiaEmSaoPaulo(data: string) {
  return inicioDoDiaEmFusoIso(data, 'America/Sao_Paulo');
}

const dataLocalDoEvento = (value: string) => value.includes('T') || value.includes(' ')
  ? dateOnlyInTimeZone(new Date(value), 'America/Sao_Paulo')
  : value.slice(0, 10);

const valorEmAberto = (lancamento: { valor: number; valor_pago: number | null; desconto?: number | null; acrescimo?: number | null }) =>
  Math.max(0, Number(lancamento.valor || 0) - Number(lancamento.desconto || 0)
    + Number(lancamento.acrescimo || 0) - Number(lancamento.valor_pago || 0));

function AdminDashboard() {
  const { profile: user } = useSupabaseAuth();
  const agora = useClinicClock();
  const hoje = todaySaoPauloDateOnly(agora);
  // Gráficos e indicadores cobrem os últimos 6 meses; "próximos" olha 60 dias à frente.
  const seisMeses = inicioDoMes(5);
  const [anoHoje, mesHoje] = hoje.split('-').map(Number);
  const primeiroDiaMesAtual = `${hoje.slice(0, 7)}-01`;
  const ultimoDiaMesAtual = new Date(Date.UTC(anoHoje, mesHoje, 0)).toISOString().slice(0, 10);
  const daquiA60Date = new Date(`${hoje}T00:00:00Z`);
  daquiA60Date.setUTCDate(daquiA60Date.getUTCDate() + 60);
  const daquiA60 = daquiA60Date.toISOString().slice(0, 10);

  const agendamentosQuery = useAgendamentosPeriodo(seisMeses, daquiA60);
  const { data: agendamentos = [], isLoading: loadingAgendamentos } = agendamentosQuery;
  const lancamentosQuery = useSupabaseQuery<any>('lancamentos', {
    orderBy: { column: 'data', ascending: false },
    filters: [{ column: 'data', operator: 'gte', value: seisMeses }],
  });
  const lancamentosPorPagamentoQuery = useSupabaseQuery<any>('lancamentos', {
    orderBy: { column: 'data_pagamento', ascending: false },
    filters: [{ column: 'data_pagamento', operator: 'gte', value: seisMeses }],
  });
  const lancamentosPorVencimentoQuery = useSupabaseQuery<any>('lancamentos', {
    orderBy: { column: 'data_vencimento', ascending: false },
    filters: [
      { column: 'data_vencimento', operator: 'gte', value: primeiroDiaMesAtual },
      { column: 'data_vencimento', operator: 'lte', value: ultimoDiaMesAtual },
    ],
  });
  const lancamentos = useMemo(() => {
    const porId = new Map<string, any>();
    for (const lancamento of [
      ...(lancamentosQuery.data ?? []),
      ...(lancamentosPorPagamentoQuery.data ?? []),
      ...(lancamentosPorVencimentoQuery.data ?? []),
    ]) porId.set(lancamento.id, lancamento);
    return [...porId.values()];
  }, [lancamentosQuery.data, lancamentosPorPagamentoQuery.data, lancamentosPorVencimentoQuery.data]);
  const loadingLancamentos = lancamentosQuery.isLoading || lancamentosPorPagamentoQuery.isLoading || lancamentosPorVencimentoQuery.isLoading;
  const idsLancamentosRealizados = useMemo(() => lancamentos
    .filter(lancamento => ['pago', 'parcial'].includes(lancamento.status || ''))
    .map(lancamento => lancamento.id), [lancamentos]);
  const pagamentosQuery = useQuery({
    queryKey: ['dashboard-admin-pagamentos', user?.clinica_id ?? null, seisMeses, hoje, idsLancamentosRealizados],
    enabled: !!user?.clinica_id && !loadingLancamentos,
    staleTime: 60_000,
    queryFn: async () => {
      const amanhaDate = new Date(`${hoje}T00:00:00Z`);
      amanhaDate.setUTCDate(amanhaDate.getUTCDate() + 1);
      const inicioLocal = inicioDoDiaEmFusoIso(seisMeses, 'America/Sao_Paulo');
      const fimLocalExclusivo = inicioDoDiaEmFusoIso(amanhaDate.toISOString().slice(0, 10), 'America/Sao_Paulo');
      const selecionar = () => supabase.from('pagamentos')
        .select('id, lancamento_id, valor, data_pagamento, estornado_em, lancamentos!inner(agendamento_id, tipo, clinica_id)')
        .eq('clinica_id', user!.clinica_id!)
        .eq('lancamentos.clinica_id', user!.clinica_id!)
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

      const idsComHistorico = new Set<string>();
      const lotesIds = Array.from({ length: Math.ceil(idsLancamentosRealizados.length / 250) }, (_, index) =>
        idsLancamentosRealizados.slice(index * 250, (index + 1) * 250));
      let historicoAtingiuLimite = false;
      for (let inicio = 0; inicio < lotesIds.length; inicio += 4) {
        const resultados = await Promise.all(lotesIds.slice(inicio, inicio + 4).map(ids =>
          buscarEmBlocos<any>(() => supabase.from('pagamentos')
            .select('id, lancamento_id')
            .eq('clinica_id', user!.clinica_id!)
            .in('lancamento_id', ids)
            .order('id', { ascending: true }))));
        for (const pagamentosDaConta of resultados) {
          if (pagamentosDaConta.length >= LIMITE_BUSCA_EM_BLOCOS) historicoAtingiuLimite = true;
          for (const pagamento of pagamentosDaConta) idsComHistorico.add(pagamento.lancamento_id);
        }
      }
      return {
        pagamentos: [...new Map([...pagamentosNoPeriodo, ...estornosNoPeriodo]
          .map(pagamento => [pagamento.id, pagamento] as const)).values()],
        idsComHistorico: [...idsComHistorico],
        historicoAtingiuLimite,
      };
    },
  });
  const medicosQuery = useMedicos();
  const { data: medicos = [], isLoading: loadingMedicos } = medicosQuery;
  const estoqueQuery = useEstoque();
  const { data: estoque = [], isLoading: loadingEstoque } = estoqueQuery;
  const filaQuery = useFilaAtendimento();
  const { data: fila = [], isLoading: loadingFila } = filaQuery;

  const resumoQuery = useQuery({
    queryKey: ['dashboard-admin-resumo', user?.clinica_id, seisMeses],
    enabled: !!user?.clinica_id,
    staleTime: 60_000,
    queryFn: async () => {
      const db = supabase as any;
      const clinicaId = user!.clinica_id!;
      const mesesPacientes = Array.from({ length: 6 }, (_, index) => inicioDoMes(5 - index));
      const limitesMeses = [...mesesPacientes, inicioDoMes(-1)];
      const [totalPac, totalAg, totalLanc, vencidos, pacientesPorMes] = await Promise.all([
        db.from('pacientes').select('id', { count: 'exact', head: true }).eq('clinica_id', clinicaId),
        db.from('agendamentos').select('id', { count: 'exact', head: true }).eq('clinica_id', clinicaId),
        db.from('lancamentos').select('id', { count: 'exact', head: true }).eq('clinica_id', clinicaId),
        // Mesma regra de Contas a Receber: "atrasado", ou pendente com vencimento
        // passado. ("vencido" não existe no enum status_pagamento — a consulta
        // anterior falhava e o indicador ficava sempre zerado.)
        buscarEmBlocos<any>(() => db.from('lancamentos').select('valor, valor_pago, desconto, acrescimo').eq('tipo', 'receita')
          .eq('clinica_id', clinicaId).or(`status.eq.atrasado,and(status.in.(pendente,parcial),data_vencimento.lt.${hoje})`).order('id', { ascending: true })),
        Promise.all(mesesPacientes.map((_, index) => db.from('pacientes').select('id', { count: 'exact', head: true })
          .eq('clinica_id', clinicaId)
          .gte('created_at', inicioDiaEmSaoPaulo(limitesMeses[index]))
          .lt('created_at', inicioDiaEmSaoPaulo(limitesMeses[index + 1])))),
      ]);
      for (const r of [totalPac, totalAg, totalLanc]) if (r.error) throw r.error;
      const erroMesPacientes = pacientesPorMes.find((result: { error: unknown }) => result.error);
      if (erroMesPacientes?.error) throw erroMesPacientes.error;
      return {
        totalPacientes: totalPac.count ?? 0,
        pacientesPorMes: pacientesPorMes.map((result: { count: number | null }, index: number) => ({ mes: mesesPacientes[index], total: result.count ?? 0 })),
        totalAgendamentos: totalAg.count ?? 0,
        totalLancamentos: totalLanc.count ?? 0,
        inadimplente: vencidos.reduce((acc: number, l: any) => acc + valorEmAberto(l), 0),
        inadimplenciaAtingiuLimite: vencidos.length >= LIMITE_BUSCA_EM_BLOCOS,
      };
    },
  });
  const { data: resumo, isLoading: loadingResumo } = resumoQuery;
  const totalPacientes = resumo?.totalPacientes ?? 0;

  const isLoading = loadingResumo || loadingAgendamentos || loadingLancamentos || pagamentosQuery.isLoading || loadingMedicos || loadingEstoque || loadingFila;

  const hojeFormatado = format(parseDateOnly(hoje)!, "EEEE, d 'de' MMMM", { locale: ptBR });
  const horaAtual = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(agora));
  const saudacao = horaAtual < 12 ? 'Bom dia' : horaAtual < 18 ? 'Boa tarde' : 'Boa noite';

  const mesReferencia = parseDateOnly(hoje)!;
  const mesAtual = mesReferencia.getMonth();
  const anoAtual = mesReferencia.getFullYear();

  const baseAgendamentos = agendamentos;

  // Consultas de hoje
  const consultasStats = useMemo(() => {
    const consultasHoje = baseAgendamentos.filter(a => a.data === hoje);
    const consultasNaoCanceladas = consultasHoje.filter(a => a.status !== 'cancelado');
    const consultasCanceladas = consultasHoje.length - consultasNaoCanceladas.length;
    const gruposStatus = [
      { name: 'Agendadas', statuses: ['agendado'], color: 'hsl(var(--info))' },
      { name: 'Confirmadas', statuses: ['confirmado'], color: 'hsl(var(--success))' },
      { name: 'Aguardando', statuses: ['aguardando', 'aguardando_triagem'], color: 'hsl(var(--warning))' },
      { name: 'Em atendimento', statuses: ['em_triagem', 'em_atendimento'], color: 'hsl(var(--primary))' },
      { name: 'Aguardando pagamento', statuses: ['aguardando_pagamento', 'aguardando_pagamento_adicional'], color: 'hsl(var(--warning))' },
      { name: 'Finalizadas', statuses: ['finalizado', 'atendimento_finalizado'], color: 'hsl(var(--success))' },
      { name: 'Pagas', statuses: ['pago'], color: 'hsl(var(--info))' },
      { name: 'Faltou', statuses: ['faltou'], color: 'hsl(var(--destructive))' },
      { name: 'Canceladas', statuses: ['cancelado'], color: 'hsl(var(--muted-foreground))' },
    ];
    const statusConhecidos = new Set(gruposStatus.flatMap(grupo => grupo.statuses));
    const statusDistribution = gruposStatus.map(grupo => ({
      name: grupo.name,
      value: consultasHoje.filter(a => grupo.statuses.includes(a.status)).length,
      color: grupo.color,
    })).filter(grupo => grupo.value > 0);
    const outros = consultasHoje.filter(a => !statusConhecidos.has(a.status)).length;
    if (outros > 0) statusDistribution.push({ name: 'Outros', value: outros, color: 'hsl(var(--muted-foreground))' });
    const consultasFinalizadas = consultasNaoCanceladas.filter(a => ['finalizado', 'atendimento_finalizado'].includes(a.status)).length;
    const totalHoje = consultasNaoCanceladas.length;
    const taxaFinalizacao = totalHoje > 0 ? Math.round(consultasFinalizadas / totalHoje * 100) : 0;
    return { consultasFinalizadas, consultasCanceladas, totalHoje, taxaFinalizacao, statusDistribution };
  }, [baseAgendamentos, hoje]);

  // Financeiro
  const financeiroStats = useMemo(() => {
    const filterAReceberByMonth = (tipo: string, month = mesAtual, year = anoAtual) =>
      lancamentos.filter(l => {
        const dataBase = l.data_vencimento || l.data;
        const d = parseDateOnly(dataBase);
        const statusValido = ['pendente', 'parcial'].includes(l.status || '') && dataBase >= hoje;
        return Boolean(d && l.tipo === tipo && statusValido && d.getMonth() === month && d.getFullYear() === year);
      }).reduce((acc, l) => acc + valorEmAberto(l), 0);

    const dadosPagamentos = pagamentosQuery.data;
    const lancamentosComHistorico = new Set<string>([
      ...(dadosPagamentos?.idsComHistorico ?? []),
      ...(dadosPagamentos?.pagamentos ?? []).map((pagamento: any) => pagamento.lancamento_id),
    ]);
    const eventosAntigos = lancamentos
      .filter(l => ['pago', 'parcial'].includes(l.status || '') && !lancamentosComHistorico.has(l.id))
      .map(l => ({
        lancamentoId: l.id,
        agendamentoId: l.agendamento_id || null,
        tipo: l.tipo,
        data: dataLocalDoEvento(l.data_pagamento || l.data),
        valor: valorRealizado(l),
      }));
    const eventosIndividuais = (dadosPagamentos?.pagamentos ?? []).flatMap((pagamento: any) => {
      const conta = Array.isArray(pagamento.lancamentos) ? pagamento.lancamentos[0] : pagamento.lancamentos;
      if (!conta || !['receita', 'despesa'].includes(conta.tipo) || !pagamento.data_pagamento) return [];
      const eventos: Array<{ lancamentoId: string; agendamentoId: string | null; tipo: string; data: string; valor: number }> = [];
      eventos.push({
        lancamentoId: pagamento.lancamento_id,
        agendamentoId: conta.agendamento_id || null,
        tipo: conta.tipo,
        data: dataLocalDoEvento(pagamento.data_pagamento),
        valor: Number(pagamento.valor),
      });
      if (pagamento.estornado_em) eventos.push({
        lancamentoId: pagamento.lancamento_id,
        agendamentoId: conta.agendamento_id || null,
        tipo: conta.tipo,
        data: dataLocalDoEvento(pagamento.estornado_em),
        valor: -Number(pagamento.valor),
      });
      return eventos;
    });
    const eventosRealizados = [...eventosAntigos, ...eventosIndividuais];
    const recebidoNoMes = (tipo: string, month = mesAtual, year = anoAtual) => eventosRealizados
      .filter(evento => {
        const d = parseDateOnly(evento.data);
        return Boolean(d && evento.tipo === tipo && d.getMonth() === month && d.getFullYear() === year);
      })
      .reduce((acc, evento) => acc + evento.valor, 0);

    const receitasMes = recebidoNoMes('receita');
    const aReceber = filterAReceberByMonth('receita');
    const inadimplente = resumo?.inadimplente ?? 0;
    const despesas = recebidoNoMes('despesa');
    const saldoLiquido = receitasMes - despesas;

    const prevMonth = mesAtual === 0 ? 11 : mesAtual - 1;
    const prevYear = mesAtual === 0 ? anoAtual - 1 : anoAtual;
    const receitasMesAnterior = recebidoNoMes('receita', prevMonth, prevYear);
    const trendReceita = receitasMesAnterior > 0 ? Math.round(((receitasMes - receitasMesAnterior) / receitasMesAnterior) * 100) : 0;

    const receitaDia = eventosRealizados
      .filter(evento => evento.data === hoje && evento.tipo === 'receita')
      .reduce((acc, evento) => acc + evento.valor, 0);

    const monthlyChartData = Array.from({ length: 6 }, (_, i) => {
      const date = new Date(anoAtual, mesAtual - 5 + i, 1);
      const receitas = recebidoNoMes('receita', date.getMonth(), date.getFullYear());
      const desp = recebidoNoMes('despesa', date.getMonth(), date.getFullYear());
      return { name: format(date, 'MMM', { locale: ptBR }), receitas, despesas: desp, lucro: receitas - desp };
    });

    const sparkReceitas = monthlyChartData.map(d => d.receitas);

    const recebimentosPorAtendimento = new Map<string, number>();
    for (const evento of eventosRealizados) {
      const d = parseDateOnly(evento.data);
      if (evento.tipo !== 'receita' || !evento.agendamentoId || !d || d.getMonth() !== mesAtual || d.getFullYear() !== anoAtual) continue;
      recebimentosPorAtendimento.set(evento.agendamentoId, (recebimentosPorAtendimento.get(evento.agendamentoId) || 0) + evento.valor);
    }
    const atendimentosComRecebimento = [...recebimentosPorAtendimento.values()].filter(valor => valor > 0);
    const ticketMedio = atendimentosComRecebimento.length > 0
      ? atendimentosComRecebimento.reduce((total, valor) => total + valor, 0) / atendimentosComRecebimento.length
      : 0;

    return { receitasMes, aReceber, inadimplente, despesas, saldoLiquido, trendReceita, receitaDia, monthlyChartData, sparkReceitas, ticketMedio, atendimentosComRecebimento: atendimentosComRecebimento.length };
  }, [lancamentos, pagamentosQuery.data, baseAgendamentos, resumo, hoje, mesAtual, anoAtual]);

  // Operacional e sparklines
  const operacionalStats = useMemo(() => {
    const estoqueBaixo = estoque.filter(e => e.quantidade <= (e.quantidade_minima || 0)).length;
    const filaAguardando = fila.filter(f => f.status === 'aguardando').length;
    const pacientesPorMes = resumo?.pacientesPorMes ?? [];
    const novosPacientesMes = pacientesPorMes[pacientesPorMes.length - 1]?.total ?? 0;
    const sparkPacientes = pacientesPorMes.map((item: { mes: string; total: number }) => item.total);

    const sparkConsultas = Array.from({ length: 6 }, (_, i) => {
      const date = new Date(anoAtual, mesAtual - 5 + i, 1);
      return agendamentos.filter(a => {
        const d = parseDateOnly(a.data);
        return Boolean(d && d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear());
      }).length;
    });

    const medicosAtivos = medicos.filter(m => m.ativo).length;

    const proximosAgendamentos = baseAgendamentos
      .filter(a => a.data >= hoje && (a.status === 'agendado' || a.status === 'confirmado'))
      .sort((a, b) => `${a.data}${a.hora_inicio}`.localeCompare(`${b.data}${b.hora_inicio}`))
      .slice(0, 6);

    return { estoqueBaixo, filaAguardando, novosPacientesMes, sparkPacientes, sparkConsultas, medicosAtivos, proximosAgendamentos };
  }, [resumo, agendamentos, baseAgendamentos, estoque, fila, medicos, hoje]);

  // Combine all stats into single object for backward compatibility
  const stats = useMemo(() => ({
    ...consultasStats,
    ...financeiroStats,
    ...operacionalStats,
  }), [consultasStats, financeiroStats, operacionalStats]);

  const setupSteps = useMemo(() => [
    { label: 'Cadastrar médicos', done: medicos.length > 0, icon: Stethoscope, href: '/medicos', color: 'text-info' },
    { label: 'Cadastrar pacientes', done: totalPacientes > 0, icon: Users, href: '/pacientes', color: 'text-primary' },
    { label: 'Agendar consulta', done: (resumo?.totalAgendamentos ?? 0) > 0, icon: Calendar, href: '/agenda', color: 'text-success' },
    { label: 'Registrar financeiro', done: (resumo?.totalLancamentos ?? 0) > 0, icon: Wallet, href: '/financeiro', color: 'text-warning' },
  ], [medicos, totalPacientes, resumo]);

  const setupProgress = Math.round((setupSteps.filter(s => s.done).length / setupSteps.length) * 100);

  if (isLoading) return <DashboardSkeleton />;
  const dashboardQueries = [resumoQuery, agendamentosQuery, lancamentosQuery, lancamentosPorPagamentoQuery, lancamentosPorVencimentoQuery, pagamentosQuery, medicosQuery, estoqueQuery, filaQuery];
  const failedQuery = dashboardQueries.find(query => query.isError);
  if (failedQuery) {
    return <ErrorState title="Não foi possível carregar o dashboard" description="Os indicadores foram pausados porque uma ou mais áreas retornaram dados incompletos." error={failedQuery.error} onRetry={() => { for (const query of dashboardQueries) void query.refetch(); }} />;
  }

  const fontesNoLimite = [
    { nome: 'agendamentos', total: agendamentos.length },
    { nome: 'lançamentos por emissão', total: lancamentosQuery.data?.length ?? 0 },
    { nome: 'lançamentos por pagamento', total: lancamentosPorPagamentoQuery.data?.length ?? 0 },
    { nome: 'vencimentos do mês', total: lancamentosPorVencimentoQuery.data?.length ?? 0 },
    { nome: 'médicos', total: medicos.length },
    { nome: 'estoque', total: estoque.length },
    { nome: 'fila', total: fila.length },
  ].filter(fonte => fonte.total >= MAX_LINHAS_AUTO).map(fonte => fonte.nome);

  const hasData = totalPacientes > 0 || (resumo?.totalAgendamentos ?? 0) > 0 || (resumo?.totalLancamentos ?? 0) > 0;
  const firstName = user?.nome?.replace(/^(dr|dra|dr\(a\))\.?\s+/i, '').split(' ')[0] || 'equipe';

  return (
    <div className="space-y-6 pb-10">
      <OnboardingWizard />
      <RoleWorkspace roles={user?.roles || []} />
      {fontesNoLimite.length > 0 && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>O limite de {MAX_LINHAS_AUTO.toLocaleString('pt-BR')} registros foi atingido em: {fontesNoLimite.join(', ')}. Os indicadores dessas áreas podem estar incompletos.</p>
        </div>
      )}
      

      <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">
        {/* ─── Welcome Hero ─── */}
        {!hasData && (
        <motion.div variants={fadeUp}>
          <section className="relative isolate min-h-[250px] overflow-hidden rounded-2xl border border-[#0F7BFD]/10 bg-white text-[#0C1F54] shadow-sm sm:min-h-[250px]">
            <img
              src={dashboardBanner}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 -z-10 h-full w-full object-cover object-[center_44%]"
            />
            <div className="absolute inset-y-0 left-0 w-[78%] bg-gradient-to-r from-white via-white/95 to-transparent" />
            <img src={logoHorizontal} alt="EloLab" className="absolute right-5 top-5 z-10 hidden w-28 object-contain sm:block" />

            <div className="relative flex min-h-[250px] items-center p-6 sm:p-8 lg:p-10">
              <div className="max-w-xl pb-1">
                <p className="mb-2 text-xs font-semibold capitalize tracking-[0.08em] text-[#0F5CBD]">{hojeFormatado}<span className="mx-2 text-[#0C1F54]/35">·</span><LiveClock /></p>
                <h1 className="text-2xl font-bold tracking-tight text-[#0C1F54] sm:text-3xl lg:text-[34px]">
                  {saudacao}, {firstName} <span aria-hidden="true">👋</span>
                  <br />
                  <span className="text-[#0F7BFD]">Sua clínica, mais organizada.</span>
                </h1>
                <p className="mt-2 max-w-md text-sm leading-6 text-[#0C1F54]/70">
                  Agenda, equipe e informações importantes em um só lugar.
                </p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <Button asChild className="h-10 bg-[#005ECC] text-white shadow-sm hover:bg-[#004FAE]">
                    <Link to="/agenda"><CalendarPlus className="h-4 w-4" />Novo atendimento<ArrowRight className="h-4 w-4" /></Link>
                  </Button>
                  <Button asChild variant="outline" className="h-10 border-[#0C1F54]/15 bg-white/80 text-[#0C1F54] hover:bg-white">
                    <Link to="/pacientes"><UserPlus className="h-4 w-4" />Cadastrar paciente</Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </motion.div>
        )}
        {hasData && setupProgress < 100 && (
          <motion.div variants={fadeUp}>
            <Card className="border-primary/20 bg-primary/[0.02]">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">Continue a configuração da clínica</p>
                    <Badge variant="secondary">{setupProgress}%</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Há etapas iniciais pendentes. Você pode continuar usando o sistema e concluir a configuração quando quiser.
                  </p>
                  <Progress value={setupProgress} className="mt-3 h-1.5" />
                </div>
                <Button asChild variant="outline" className="shrink-0">
                  <Link to="/onboarding">Ver primeiros passos <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {!hasData ? (
          <>
            {/* ─── Setup Progress Card ─── */}
            <motion.div variants={fadeUp}>
              <Card className="overflow-hidden border-border/40">
                <div className="bg-gradient-to-r from-primary/5 via-primary/3 to-transparent p-6 md:p-8">
                  <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="secondary" className="text-xs font-semibold gap-1 bg-primary/10 text-primary border-0">
                          <Sparkles className="h-3 w-3" /> Configuração Inicial
                        </Badge>
                        <span className="text-xs text-muted-foreground tabular-nums">{setupProgress}% completo</span>
                      </div>
                      <h2 className="text-xl font-bold font-display mb-1">Configure seu EloLab</h2>
                      <p className="text-sm text-muted-foreground">Complete os passos abaixo para desbloquear todo o potencial do sistema.</p>
                      <div className="mt-4">
                        <Progress value={setupProgress} className="h-2" />
                      </div>
                    </div>
                    <div className="relative shrink-0 hidden md:block">
                      <div className="h-28 w-28 rounded-3xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                        <ProgressRing value={setupProgress} size={90} strokeWidth={6} color="hsl(var(--primary))" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-lg font-bold tabular-nums">{setupProgress}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <CardContent className="p-6 pt-0 md:p-8 md:pt-0 mt-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {setupSteps.map((step, i) => (
                      <Link key={i} to={step.href}>
                        <motion.div
                          variants={fadeUp} custom={i}
                          className={cn(
                            'group flex items-center gap-3.5 p-4 rounded-xl border transition-all duration-200',
                            step.done
                              ? 'bg-success/5 border-success/20'
                              : 'hover:bg-accent/30 hover:border-border hover:-translate-y-0.5 hover:shadow-md',
                          )}
                        >
                          <div className={cn(
                            'h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110',
                            step.done ? 'bg-success/15' : 'bg-muted',
                          )}>
                            {step.done ? (
                              <CheckCircle2 className="h-5 w-5 text-success" />
                            ) : (
                              <step.icon className={cn('h-5 w-5', step.color)} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn('font-medium text-sm', step.done && 'line-through text-muted-foreground')}>
                              {step.label}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {step.done ? 'Concluído ✓' : 'Clique para começar'}
                            </p>
                          </div>
                          {!step.done && (
                            <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-1 transition-all shrink-0" />
                          )}
                        </motion.div>
                      </Link>
                    ))}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button asChild variant="outline">
                      <Link to="/onboarding">Abrir checklist completo <ArrowRight className="ml-2 h-4 w-4" /></Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

          </>
                ) : (
          <AdminDashboardOverview
            nome={firstName}
            saudacao={saudacao}
            dataLabel={hojeFormatado}
            horarioLabel={new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(agora)}
            metricas={{ consultas: stats.totalHoje, fila: stats.filaAguardando, finalizadas: stats.consultasFinalizadas, receita: formatCurrency(stats.receitaDia) }}
            agenda={baseAgendamentos.filter((ag) => ag.data === hoje && ag.status !== 'cancelado').sort((a, b) => (a.hora_inicio || '').localeCompare(b.hora_inicio || '')).map((ag) => ({ id: ag.id, horario: ag.hora_inicio?.slice(0, 5) || '-', paciente: ag.pacientes?.nome || ag.observacoes || ag.tipo || 'Paciente', tipo: ag.tipo || 'Consulta', status: formatAppointmentStatus(ag.status) }))}
            alertas={[
              ...(stats.filaAguardando > 0 ? [{ id: 'fila', titulo: 'Pacientes na fila', detalhe: `${stats.filaAguardando} aguardando atendimento`, href: '/fila', tom: 'attention' as const }] : []),
              ...(stats.inadimplente > 0 ? [{ id: 'financeiro', titulo: 'Valores em atraso', detalhe: `${formatCurrency(stats.inadimplente)} em aberto`, href: '/cobranca-inadimplentes', tom: 'attention' as const }] : []),
              ...(stats.estoqueBaixo > 0 ? [{ id: 'estoque', titulo: 'Estoque baixo', detalhe: `${stats.estoqueBaixo} item(ns) precisam de reposição`, href: '/estoque', tom: 'info' as const }] : []),
            ]}
            desempenho={{ percentual: stats.taxaFinalizacao, descricao: `${stats.consultasFinalizadas} de ${stats.totalHoje} consultas finalizadas hoje` }}
            fluxoFinanceiro={stats.monthlyChartData.some((item) => (Number.isFinite(item.receitas) && item.receitas !== 0) || (Number.isFinite(item.despesas) && item.despesas !== 0)) ? stats.monthlyChartData : []}
            acoes={[{ label: 'Agendar consulta', href: '/agenda', icon: 'calendar' }, { label: 'Novo paciente', href: '/pacientes', icon: 'patient' }, { label: 'Abrir fila', href: '/fila', icon: 'queue' }, { label: 'Prontuários', href: '/prontuarios', icon: 'document' }]}
          />
        )}
      </motion.div>
    </div>
  );
}
