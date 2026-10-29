import { nomeMedico } from '@/lib/formatters';
import { useState, useMemo, useEffect } from 'react';
import { DoctorDashboard } from '@/components/dashboard/DoctorDashboard';
import { AdminDashboardOverview } from '@/components/dashboard/AdminDashboardOverview';
import { formatAppointmentStatus, isAppointmentClosed, isAppointmentCompleted } from '@/components/dashboard/appointmentStatus';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { OnboardingWizard } from '@/components/OnboardingWizard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { MAX_LINHAS_AUTO, useAgendamentosPeriodo, useSupabaseQuery, useEstoque, useMedicos, useFilaAtendimento, useMinhasTarefasPendentes } from '@/hooks/useSupabaseData';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { useUserPlan } from '@/hooks/useSubscriptionPlan';
import {
  Users, Calendar, Clock, UserPlus, CalendarPlus, ArrowRight, ArrowUpRight,
  Activity, Stethoscope, Package, FileText, TrendingUp, TrendingDown,
  Sparkles, CheckCircle2, AlertTriangle, Wallet, Plus, BarChart3,
  ClipboardList, HeartPulse, Bell,
  ShieldCheck, Target, Timer, Megaphone, Pill, Eye, ListChecks,
} from 'lucide-react';
import { DashboardSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ErrorState';
import { Link, Navigate } from 'react-router-dom';
import dashboardBanner from '@/assets/dashboard-banner-elolab.png';
import logoHorizontal from '@/assets/elolab-logo-identidade.png';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatWithDatePreference } from '@/lib/datePreference';
import { cn } from '@/lib/utils';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { dateOnlyInTimeZone, inicioDoDiaEmFusoIso, parseDateOnly, toDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { valorRealizado } from '@/lib/lancamentos';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { linkWhatsApp } from '@/lib/whatsapp';

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

export function getDashboardLinksForRoles(roles: string[], hasExamFeature = true): string[] {
  const role = dashboardRolePriority.find(item => roles.includes(item));
  if (!role) return [];
  return roleWorkspaces[role].actions
    .filter(action => hasExamFeature || role !== 'enfermagem' || !['/mapa-coleta', '/laboratorio'].includes(action.href))
    .map(action => action.href);
}

const roleTips = {
  admin: ['Revise as pendências em "Precisa de atenção".', 'Acompanhe a ocupação da agenda da semana.'],
  recepcao: ['Confirme as consultas de amanhã pelo WhatsApp.', 'Ofereça horários livres para a lista de espera.', 'Registre a chegada para o paciente entrar na fila.'],
  enfermagem: ['Priorize a triagem de quem chegou primeiro.', 'Confira coletas pendentes no mapa de coleta.', 'Registre sinais vitais antes da consulta.'],
  financeiro: ['Concilie os recebimentos do dia no caixa.', 'Veja contas que vencem esta semana.', 'Acompanhe inadimplentes e envie lembretes.'],
} as const;

const workspaceTones = [
  'bg-primary text-primary-foreground shadow-glow',
  'border border-border/60 bg-card text-foreground hover:bg-accent',
  'border border-border/60 bg-accent/50 text-foreground hover:bg-accent',
];

function RoleWorkspace({ roles }: { roles: string[] }) {
  const role = dashboardRolePriority.find(item => roles.includes(item));
  if (!role) return null;
  const workspace = roleWorkspaces[role];
  return <section aria-labelledby="role-workspace-title" className="rounded-[22px] border border-border/60 bg-card p-4 shadow-xs md:p-5">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div><h2 id="role-workspace-title" className="text-base font-bold">{workspace.title}</h2><p className="text-sm text-muted-foreground">{workspace.description}</p></div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{workspace.actions.map(({ label, href, icon: Icon }, index) => <Link key={href} to={href} className={cn('flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold transition hover:-translate-y-0.5 hover:brightness-105', workspaceTones[index % workspaceTones.length])}><Icon className="h-4 w-4" />{label}</Link>)}</div>
    </div>
  </section>;
}

function minutosDesde(valor?: string | null, agora = new Date()) {
  if (!valor) return null;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return null;
  return Math.max(0, Math.round((agora.getTime() - data.getTime()) / 60000));
}

function iniciaisDe(nome: string) {
  return nome.split(' ').filter(Boolean).map(parte => parte[0]).slice(0, 2).join('').toUpperCase();
}

function OperationalDashboard({ roles, nome, hasExamFeature }: { roles: string[]; nome?: string | null; hasExamFeature: boolean }) {
  const agora = useClinicClock();
  const hora = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23',
  }).format(agora));
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const hoje = todaySaoPauloDateOnly(agora);
  const dataLocal = parseDateOnly(hoje)!;
  const horaAgora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(agora);
  const role = dashboardRolePriority.find(item => roles.includes(item));
  const workspace = role ? roleWorkspaces[role] : null;
  const visibleLinks = new Set(getDashboardLinksForRoles(roles, hasExamFeature));
  const tips = role ? roleTips[role] : [];

  const agendaQuery = useAgendamentosPeriodo(hoje, hoje);
  const filaQuery = useFilaAtendimento();
  const tarefasQuery = useMinhasTarefasPendentes();
  const minhasTarefas = tarefasQuery.data ?? [];
  const tarefasAtrasadas = minhasTarefas.filter(t => t.data_vencimento && t.data_vencimento < hoje).length;
  const agenda = useMemo(() => (agendaQuery.data ?? [])
    .filter(item => item.status !== 'cancelado')
    .sort((a, b) => (a.hora_inicio || '').localeCompare(b.hora_inicio || '')), [agendaQuery.data]);
  const fila = useMemo(() => ((filaQuery.data ?? []) as any[])
    .filter(item => !['finalizado', 'atendido', 'cancelado'].includes(item.status || ''))
    .sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0)), [filaQuery.data]);

  const confirmadas = agenda.filter(item => item.status === 'confirmado').length;
  const finalizadas = agenda.filter(item => isAppointmentCompleted(item.status)).length;
  const esperas = fila.map(item => minutosDesde(item.horario_chegada || item.created_at, agora)).filter((m): m is number => m !== null);
  const esperaMedia = esperas.length ? Math.round(esperas.reduce((total, m) => total + m, 0) / esperas.length) : null;
  const pendentes = agenda.filter(item => !isAppointmentClosed(item.status));
  const proxima = pendentes.find(item => (item.hora_inicio || '') >= horaAgora) ?? pendentes[0];

  const kpis = [
    { label: 'Consultas hoje', value: agenda.length, note: `${confirmadas} confirmadas`, tone: 'bg-card border border-border/60', href: '/agenda' },
    { label: 'Na fila agora', value: fila.length, note: esperaMedia !== null ? `espera média de ${esperaMedia} min` : 'ninguém aguardando', tone: 'bg-highlight text-highlight-foreground', href: '/fila' },
    { label: 'Finalizadas', value: finalizadas, note: agenda.length ? `${Math.round(finalizadas / agenda.length * 100)}% do dia` : 'sem atendimentos', tone: 'bg-foreground text-background', href: '/fila' },
  ];

  return <div className="space-y-5 pb-8">
    <header className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-muted-foreground first-letter:uppercase">{format(dataLocal, "EEEE, d 'de' MMMM", { locale: ptBR })} <span className="mx-1 opacity-40">·</span> <LiveClock /></p>
      <h1 className="text-[28px] font-light leading-tight tracking-[-0.03em] sm:text-[34px]">{saudacao}, <span className="font-extrabold">{nome?.split(' ')[0] || 'equipe'}</span></h1>
    </header>

    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
      <section aria-labelledby="turno-title" className="relative overflow-hidden rounded-[24px] bg-brand-dark p-6 text-white shadow-glow">
        <div className="relative">
          <h2 id="turno-title" className="text-xs font-bold uppercase tracking-[0.12em] text-white/80">{workspace?.title ?? 'Seu espaço de trabalho'}</h2>
          {proxima ? <>
            <p className="mt-3 text-[44px] font-light leading-none tracking-[-0.04em] tabular-nums">{proxima.hora_inicio?.slice(0, 5)}</p>
            <p className="mt-2 truncate text-base font-bold">{proxima.pacientes?.nome || 'Paciente'}</p>
            <p className="truncate text-xs text-white/75">{proxima.tipo || 'Consulta'}{proxima.medicos?.nome ? ` · ${nomeMedico(proxima.medicos.nome)}` : ''}</p>
          </> : <p className="mt-3 max-w-xs text-sm text-white/80">{workspace?.description ?? 'Os atalhos exibidos respeitam as permissões do seu perfil. Se precisar de outro acesso, fale com o administrador.'}</p>}
          {workspace && <div className="mt-5 flex flex-wrap gap-2">{workspace.actions.filter(action => visibleLinks.has(action.href)).map(({ label, href, icon: Icon }, index) => <Link key={href} to={href} className={cn('inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition hover:brightness-105', index === 0 ? 'bg-white text-primary' : 'border border-white/30 text-white hover:bg-white/10')}><Icon className="h-4 w-4" />{label}</Link>)}</div>}
        </div>
      </section>
      {kpis.map(kpi => <Link key={kpi.label} to={kpi.href} className={cn('group relative flex min-w-0 flex-col rounded-[22px] p-5 shadow-xs transition hover:-translate-y-0.5 hover:shadow-md', kpi.tone)}>
        <p className="text-xs font-semibold opacity-75">{kpi.label}</p>
        <p className="mt-3 text-[38px] font-light leading-none tracking-[-0.03em] tabular-nums">{kpi.value}</p>
        <p className="mt-auto pt-3 text-xs opacity-75">{kpi.note}</p>
        <ArrowUpRight className="absolute right-4 top-4 h-4 w-4 opacity-0 transition group-hover:opacity-70" />
      </Link>)}
    </div>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Card className="rounded-[22px]">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div><CardTitle className="text-lg">Agenda de hoje</CardTitle><CardDescription>Horários do dia em ordem</CardDescription></div>
          <Link to="/agenda" className="text-xs font-bold text-primary hover:underline">Abrir agenda</Link>
        </CardHeader>
        <CardContent className="space-y-1">
          {agendaQuery.isError ? <p className="rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">Seu perfil não tem acesso à agenda. Peça ao administrador se precisar.</p>
            : agendaQuery.isLoading ? <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-12 animate-pulse rounded-2xl bg-muted" />)}</div>
            : agenda.length === 0 ? <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-center"><Calendar className="h-6 w-6 text-primary" /><p className="text-sm font-bold">Nenhuma consulta para hoje</p><Link to="/agenda" className="text-sm font-bold text-primary">Agendar consulta</Link></div>
            : agenda.slice(0, 7).map(item => <div key={item.id} className={cn('grid grid-cols-[52px_4px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-3 py-2.5', item.id === proxima?.id ? 'bg-accent' : 'hover:bg-muted/60')}>
              <span className="text-sm font-extrabold tabular-nums">{item.hora_inicio?.slice(0, 5) || '--:--'}</span>
              <span className={cn('h-8 w-1 rounded-full', item.id === proxima?.id ? 'bg-primary' : 'bg-border')} aria-hidden="true" />
              <span className="min-w-0"><span className="block truncate text-sm font-bold">{item.pacientes?.nome || 'Paciente'}</span><span className="block truncate text-xs text-muted-foreground">{item.tipo || 'Consulta'}{item.medicos?.nome ? ` · ${nomeMedico(item.medicos.nome)}` : ''}</span></span>
              <Badge variant="secondary" className="rounded-full bg-accent text-primary">{formatAppointmentStatus(item.status)}</Badge>
            </div>)}
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card className="rounded-[22px]">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Fila agora</CardTitle>
            <span className="rounded-full bg-highlight px-2.5 py-0.5 text-xs font-extrabold text-highlight-foreground">{fila.length}</span>
          </CardHeader>
          <CardContent>
            {fila.length === 0 ? <p className="flex items-center gap-2 rounded-2xl bg-success/10 p-4 text-sm font-semibold text-success"><CheckCircle2 className="h-4 w-4" />Ninguém aguardando no momento.</p>
              : <ul className="divide-y divide-dashed divide-border">{fila.slice(0, 5).map(item => {
                const minutos = minutosDesde(item.horario_chegada || item.created_at, agora);
                const nomePaciente: string = item.agendamentos?.pacientes?.nome || 'Paciente';
                return <li key={item.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-extrabold text-primary">{iniciaisDe(nomePaciente)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{nomePaciente}</span><span className="block truncate text-xs text-muted-foreground">{formatAppointmentStatus(item.status || 'aguardando')}</span></span>
                  {minutos !== null && <span className={cn('text-xs font-extrabold tabular-nums', minutos >= 30 ? 'text-destructive' : 'text-foreground')}>{minutos} min</span>}
                </li>;
              })}</ul>}
          </CardContent>
        </Card>
        {minhasTarefas.length > 0 && <Card className="rounded-[22px]">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Minhas tarefas</CardTitle>
            <Link to="/tarefas" className="text-xs font-bold text-primary hover:underline">Ver todas</Link>
          </CardHeader>
          <CardContent>
            {tarefasAtrasadas > 0 && <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-destructive"><AlertTriangle className="h-3.5 w-3.5" />{tarefasAtrasadas} atrasada{tarefasAtrasadas > 1 ? 's' : ''}</p>}
            <ul className="divide-y divide-dashed divide-border">{minhasTarefas.slice(0, 4).map(t => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <ListChecks className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.titulo}</span>
                {t.data_vencimento && <span className={cn('shrink-0 text-xs font-bold tabular-nums', t.data_vencimento < hoje ? 'text-destructive' : 'text-muted-foreground')}>{formatWithDatePreference(parseDateOnly(t.data_vencimento)!, 'dd/MM', { locale: ptBR })}</span>}
              </li>
            ))}</ul>
          </CardContent>
        </Card>}
        {tips.length > 0 && <Card className="rounded-[22px] border-dashed">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" />Dicas para o seu turno</CardTitle></CardHeader>
          <CardContent><ul className="space-y-2">{tips.map(tip => <li key={tip} className="flex items-start gap-2 text-sm text-muted-foreground"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{tip}</li>)}</ul></CardContent>
        </Card>}
      </div>
    </div>
  </div>;
}

// ─── Main Dashboard ────────────────────────────────────────
export default function Dashboard() {
  const { profile: user, isAdmin, isPlatformAdmin } = useSupabaseAuth();
  const { isMedicoOnly } = useCurrentMedico();
  const { hasFeature, isLoading: isPlanLoading, isError: isPlanError } = useUserPlan();

  if (isPlatformAdmin && !user?.clinica_id) {
    return <Navigate to="/painel-admin" replace />;
  }

  const hasExamFeature = !isPlanLoading && !isPlanError && hasFeature('exames');

  // Decide o painel ANTES de carregar dados. Antes, médico e recepção baixavam
  // pacientes, agenda, lançamentos e estoque da clínica inteira só para depois
  // verem um painel que não usa nada disso.
  if (isMedicoOnly) {
    return <DoctorDashboard userName={user?.nome || 'Doutor(a)'} />;
  }
  if (!isAdmin()) {
    return <OperationalDashboard roles={user?.roles || []} nome={user?.nome} hasExamFeature={hasExamFeature} />;
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

  const agendamentosQuery = useAgendamentosPeriodo(seisMeses, daquiA60, { suppressGlobalErrorToast: true });
  const { data: agendamentos = [], isLoading: loadingAgendamentos } = agendamentosQuery;
  const lancamentosQuery = useSupabaseQuery<any>('lancamentos', {
    orderBy: { column: 'data', ascending: false },
    filters: [{ column: 'data', operator: 'gte', value: seisMeses }],
    suppressGlobalErrorToast: true,
  });
  const lancamentosPorPagamentoQuery = useSupabaseQuery<any>('lancamentos', {
    orderBy: { column: 'data_pagamento', ascending: false },
    filters: [{ column: 'data_pagamento', operator: 'gte', value: seisMeses }],
    suppressGlobalErrorToast: true,
  });
  const lancamentosPorVencimentoQuery = useSupabaseQuery<any>('lancamentos', {
    orderBy: { column: 'data_vencimento', ascending: false },
    filters: [
      { column: 'data_vencimento', operator: 'gte', value: primeiroDiaMesAtual },
      { column: 'data_vencimento', operator: 'lte', value: ultimoDiaMesAtual },
    ],
    suppressGlobalErrorToast: true,
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
    meta: { suppressGlobalErrorToast: true },
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
  const medicosQuery = useMedicos({ suppressGlobalErrorToast: true });
  const { data: medicos = [], isLoading: loadingMedicos } = medicosQuery;
  const estoqueQuery = useEstoque({ suppressGlobalErrorToast: true });
  const { data: estoque = [], isLoading: loadingEstoque } = estoqueQuery;
  const filaQuery = useFilaAtendimento({ suppressGlobalErrorToast: true });
  const { data: fila = [], isLoading: loadingFila } = filaQuery;
  const tarefasQuery = useMinhasTarefasPendentes({ suppressGlobalErrorToast: true });
  const { data: minhasTarefas = [] } = tarefasQuery;
  const tarefasAtrasadas = useMemo(() => minhasTarefas.filter(t => t.data_vencimento && t.data_vencimento < hoje).length, [minhasTarefas, hoje]);
  const aniversariantesQuery = useQuery({
    queryKey: ['dashboard-aniversariantes', user?.clinica_id ?? null, hoje],
    meta: { suppressGlobalErrorToast: true },
    enabled: !!user?.clinica_id,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      // A coluna é `date`, então filtramos pela lista de datas possíveis
      // (mesmo dia/mês em cada ano) em vez de um LIKE sobre texto.
      const mesDia = hoje.slice(5);
      const datas = Array.from({ length: 111 }, (_, i) => `${anoHoje - i}-${mesDia}`);
      const { data, error } = await supabase
        .from('pacientes')
        .select('id, nome, telefone')
        .eq('clinica_id', user!.clinica_id!)
        .in('data_nascimento', datas)
        .order('nome')
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; nome: string; telefone: string | null }>;
    },
  });

  const resumoQuery = useQuery({
    queryKey: ['dashboard-admin-resumo', user?.clinica_id, seisMeses],
    meta: { suppressGlobalErrorToast: true },
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

  const isLoading = loadingResumo || loadingAgendamentos || loadingLancamentos || pagamentosQuery.isLoading || loadingMedicos || loadingEstoque || loadingFila || tarefasQuery.isLoading;

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
  }, [lancamentos, pagamentosQuery.data, resumo, hoje, mesAtual, anoAtual]);

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
  }, [resumo, agendamentos, baseAgendamentos, estoque, fila, medicos, hoje, anoAtual, mesAtual]);

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

  const amanhaDate = parseDateOnly(hoje)!;
  amanhaDate.setDate(amanhaDate.getDate() + 1);
  const amanha = toDateOnly(amanhaDate);
  const confirmacoesAmanha = baseAgendamentos
    .filter((ag) => ag.data === amanha && ag.status === 'agendado')
    .sort((a, b) => (a.hora_inicio || '').localeCompare(b.hora_inicio || ''))
    .map((ag) => ({
      id: ag.id,
      horario: ag.hora_inicio?.slice(0, 5) || '-',
      paciente: ag.pacientes?.nome || 'Paciente',
      whatsapp: linkWhatsApp(ag.pacientes?.telefone, `Olá, ${(ag.pacientes?.nome || '').split(' ')[0]}! Podemos confirmar sua consulta amanhã às ${ag.hora_inicio?.slice(0, 5)}?`),
    }));

  const inicioSemana = parseDateOnly(hoje)!;
  inicioSemana.setDate(inicioSemana.getDate() - ((inicioSemana.getDay() + 6) % 7));
  const ocupacaoSemana = Array.from({ length: 6 }, (_, i) => {
    const dia = new Date(inicioSemana);
    dia.setDate(inicioSemana.getDate() + i);
    const iso = toDateOnly(dia);
    return {
      dia: format(dia, 'EEE', { locale: ptBR }).replace('.', ''),
      total: baseAgendamentos.filter((ag) => ag.data === iso && ag.status !== 'cancelado').length,
      hoje: iso === hoje,
    };
  });

  const faltasMes = baseAgendamentos.filter((ag) => ag.status === 'faltou' && ag.data.startsWith(hoje.slice(0, 7))).length;
  const resumoMes = {
    ticketMedio: formatCurrency(stats.ticketMedio),
    variacaoReceita: stats.trendReceita,
    novosPacientes: stats.novosPacientesMes,
    faltas: faltasMes,
  };

  const tarefasResumo = minhasTarefas.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    vencimento: t.data_vencimento ? formatWithDatePreference(parseDateOnly(t.data_vencimento)!, 'dd/MM', { locale: ptBR }) : null,
    atrasada: !!t.data_vencimento && t.data_vencimento < hoje,
  }));

  const aniversariantes = (aniversariantesQuery.data ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    whatsapp: linkWhatsApp(p.telefone, `Parabéns, ${p.nome.split(' ')[0]}! A equipe da clínica deseja um feliz aniversário.`),
  }));

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
          <section className="relative isolate min-h-[250px] overflow-hidden rounded-2xl border border-primary/10 bg-card text-card-foreground shadow-sm sm:min-h-[250px]">
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
                <p className="mb-2 text-xs font-semibold capitalize tracking-[0.08em] text-primary">{hojeFormatado}<span className="mx-2 text-card-foreground/35">·</span><LiveClock /></p>
                <h1 className="text-2xl font-bold tracking-tight text-card-foreground sm:text-3xl lg:text-[34px]">
                  {saudacao}, {firstName} <span aria-hidden="true">👋</span>
                  <br />
                  <span className="text-primary">Sua clínica, mais organizada.</span>
                </h1>
                <p className="mt-2 max-w-md text-sm leading-6 text-card-foreground/70">
                  Agenda, equipe e informações importantes em um só lugar.
                </p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <Button asChild className="h-10 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90">
                    <Link to="/agenda"><CalendarPlus className="h-4 w-4" />Novo atendimento<ArrowRight className="h-4 w-4" /></Link>
                  </Button>
                  <Button asChild variant="outline" className="h-10 border-border bg-card/80 text-foreground hover:bg-card">
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
              ...(tarefasAtrasadas > 0 ? [{ id: 'tarefas', titulo: 'Tarefas atrasadas', detalhe: `${tarefasAtrasadas} tarefa(s) sua(s) venceram`, href: '/tarefas', tom: 'attention' as const }]
                : minhasTarefas.length > 0 ? [{ id: 'tarefas', titulo: 'Minhas tarefas', detalhe: `${minhasTarefas.length} pendente(s)`, href: '/tarefas', tom: 'info' as const }] : []),
            ]}
            desempenho={{ percentual: stats.taxaFinalizacao, descricao: `${stats.consultasFinalizadas} de ${stats.totalHoje} consultas finalizadas hoje` }}
            fluxoFinanceiro={stats.monthlyChartData.some((item) => (Number.isFinite(item.receitas) && item.receitas !== 0) || (Number.isFinite(item.despesas) && item.despesas !== 0)) ? stats.monthlyChartData : []}
            acoes={[{ label: 'Agendar consulta', href: '/agenda', icon: 'calendar' }, { label: 'Novo paciente', href: '/pacientes', icon: 'patient' }, { label: 'Abrir fila', href: '/fila', icon: 'queue' }, { label: 'Prontuários', href: '/prontuarios', icon: 'document' }]}
            confirmacoesAmanha={confirmacoesAmanha}
            ocupacaoSemana={ocupacaoSemana}
            resumoMes={resumoMes}
            tarefas={tarefasResumo}
            aniversariantes={aniversariantes}
          />
        )}
      </motion.div>
    </div>
  );
}
