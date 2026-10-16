import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, Cake, Check, CheckCircle2, ClipboardList,
  FileText, FlaskConical, ListChecks, MessageCircle, Plus, Sparkles, UserRoundPlus, Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';

export interface AdminDashboardAppointment {
  id: string;
  horario: string;
  paciente: string;
  tipo: string;
  status: string;
}

export interface AdminDashboardAlert {
  id: string;
  titulo: string;
  detalhe: string;
  href: string;
  tom: 'attention' | 'info';
}

export interface AdminDashboardConfirmacao {
  id: string;
  horario: string;
  paciente: string;
  whatsapp?: string | null;
}

export interface AdminDashboardTarefa {
  id: string;
  titulo: string;
  vencimento?: string | null;
  atrasada: boolean;
}

export interface AdminDashboardOverviewProps {
  nome: string;
  saudacao?: string;
  dataLabel: string;
  horarioLabel: string;
  metricas: {
    consultas: number;
    fila: number;
    finalizadas: number;
    receita: string;
  };
  agenda: AdminDashboardAppointment[];
  alertas: AdminDashboardAlert[];
  desempenho: { percentual: number; descricao: string };
  fluxoFinanceiro: Array<{ name: string; receitas: number; despesas: number }>;
  acoes: Array<{ label: string; href: string; icon: 'calendar' | 'patient' | 'document' | 'queue' }>;
  confirmacoesAmanha?: AdminDashboardConfirmacao[];
  ocupacaoSemana?: Array<{ dia: string; total: number; hoje: boolean }>;
  resumoMes?: { ticketMedio: string; variacaoReceita: number; novosPacientes: number; faltas: number };
  tarefas?: AdminDashboardTarefa[];
  aniversariantes?: Array<{ id: string; nome: string; whatsapp?: string | null }>;
}

const actionIcons = {
  calendar: CalendarDays,
  patient: UserRoundPlus,
  document: FileText,
  queue: ClipboardList,
};

const actionTones = [
  'bg-gradient-primary text-white shadow-[0_6px_18px_rgba(16,128,202,0.35)]',
  'bg-[#111111] text-white',
  'border border-border/60 bg-card text-foreground hover:border-[#1080CA]/40',
  'border border-border/60 bg-card text-foreground hover:border-[#1080CA]/40',
];

const cardBase = 'rounded-[22px] border border-border/60 bg-card text-card-foreground shadow-xs';
const sectionTitle = 'text-base font-bold text-foreground';
const linkAzul = 'inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[#1080CA] hover:underline';

export function AdminDashboardOverview({
  nome,
  saudacao = 'Bom dia',
  dataLabel,
  horarioLabel,
  metricas,
  agenda,
  alertas,
  desempenho,
  fluxoFinanceiro,
  acoes,
  confirmacoesAmanha = [],
  ocupacaoSemana = [],
  resumoMes,
  tarefas = [],
  aniversariantes = [],
}: AdminDashboardOverviewProps) {
  const desempenhoSeguro = Math.max(0, Math.min(100, desempenho.percentual));
  const proxima = agenda[0];
  const seguintes = agenda.slice(1, 4);
  const picoSemana = Math.max(1, ...ocupacaoSemana.map(d => d.total));
  const tarefasAtrasadas = tarefas.filter(t => t.atrasada).length;

  const kpis = [
    { label: 'Consultas hoje', value: metricas.consultas, note: 'agendadas para o dia', icon: CalendarDays, tone: 'bg-gradient-primary text-white shadow-[0_8px_24px_rgba(16,128,202,0.35)]', iconTone: 'bg-white/20 text-white', href: '/agenda' },
    { label: 'Na fila', value: metricas.fila, note: 'aguardando atendimento', icon: Users, tone: 'bg-card border border-border/60', iconTone: 'bg-[#1080CA]/10 text-[#1080CA]', href: '/fila' },
    { label: 'Concluídas', value: metricas.finalizadas, note: 'atendimentos de hoje', icon: Check, tone: 'bg-card border border-border/60', iconTone: 'bg-success/10 text-success', href: '/fila' },
    { label: 'Receita do dia', value: metricas.receita, note: 'valores recebidos hoje', icon: Activity, tone: 'bg-[#111111] text-white', iconTone: 'bg-white/10 text-[#2ED5E7]', href: '/fluxo-caixa' },
  ];

  return (
    <div className="space-y-5 pb-8" data-testid="admin-dashboard-overview">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-muted-foreground first-letter:uppercase">
            {dataLabel} <span className="mx-1 opacity-40">·</span> {horarioLabel}
          </p>
          <h1 className="mt-1 text-[28px] font-light leading-tight tracking-[-0.03em] text-foreground sm:text-[34px]">
            {saudacao}, <span className="font-extrabold">{nome}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Visão da clínica e agenda do dia.</p>
        </div>
        <Link
          to="/agenda"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#111111] px-5 text-sm font-bold text-white shadow-md transition hover:bg-[#2b2b33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA] focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" /> Novo atendimento
        </Link>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[auto_auto]">
        <section
          aria-labelledby="dashboard-timeline-title"
          className="relative overflow-hidden rounded-[24px] bg-[#111111] p-6 text-white shadow-lg lg:row-span-2"
        >
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-20 h-72 w-72 rounded-full bg-gradient-primary opacity-40 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex h-full flex-col">
            <div className="flex items-center justify-between gap-3">
              <h2 id="dashboard-timeline-title" className="text-xs font-bold uppercase tracking-[0.12em] text-white/70">Sua agenda de hoje</h2>
              <span className="rounded-full bg-gradient-primary px-3 py-1 text-[11px] font-bold">{agenda.length} no dia</span>
            </div>
            {proxima ? (
              <>
                <p className="mt-4 bg-gradient-primary bg-clip-text text-[52px] font-semibold leading-none tracking-[-0.04em] text-transparent tabular-nums">{proxima.horario}</p>
                <p className="mt-2 text-xs text-white/60">próximo atendimento</p>
                <div className="mt-4 flex items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-primary text-sm font-extrabold text-white">
                    {iniciais(proxima.paciente)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-bold">{proxima.paciente}</span>
                    <span className="block truncate text-xs text-white/65">{proxima.tipo} · {proxima.status}</span>
                  </span>
                </div>
                {seguintes.length > 0 && (
                  <ul className="mt-5 flex flex-wrap gap-2" aria-label="Próximos horários">
                    {seguintes.map((item) => (
                      <li key={item.id} className="rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-[11px] font-semibold">
                        <span className="tabular-nums text-[#2ED5E7]">{item.horario}</span> · {primeiroNome(item.paciente)}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className="mt-6">
                <Sparkles className="h-8 w-8 text-[#2ED5E7]" />
                <p className="mt-3 text-xl font-bold">Agenda livre hoje</p>
                <p className="mt-1 max-w-xs text-sm text-white/65">Aproveite para confirmar as consultas de amanhã ou encaixar a lista de espera.</p>
              </div>
            )}
            <div className="mt-auto flex flex-wrap gap-2 pt-6">
              <Link to="/agenda" className="inline-flex min-h-10 items-center gap-2 rounded-full bg-gradient-primary px-4 text-sm font-bold text-white transition hover:brightness-110">
                Ver agenda <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/fila" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/25 px-4 text-sm font-semibold text-white transition hover:bg-white/10">
                Abrir fila
              </Link>
            </div>
          </div>
        </section>

        {kpis.map(({ label, value, note, icon: Icon, tone, iconTone, href }) => (
          <Link
            key={label}
            to={href}
            className={cn('group relative min-w-0 overflow-hidden rounded-[22px] p-5 shadow-xs transition hover:-translate-y-0.5 hover:shadow-md', tone)}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold opacity-75">{label}</p>
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', iconTone)}>
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 truncate text-[34px] font-light leading-none tracking-[-0.03em] tabular-nums">{value}</p>
            <p className="mt-2 truncate text-xs opacity-70">{note}</p>
            <ArrowUpRight className="absolute bottom-4 right-4 h-4 w-4 opacity-0 transition group-hover:opacity-70" />
          </Link>
        ))}
      </div>

      {resumoMes && (
        <section aria-labelledby="dashboard-mes-title" className={`${cardBase} p-5`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="dashboard-mes-title" className={sectionTitle}>Resumo do mês</h2>
            <Link to="/analytics" className={linkAzul}>Indicadores <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatMes label="Ticket médio" valor={resumoMes.ticketMedio} />
            <StatMes
              label="Receita vs. mês anterior"
              valor={`${resumoMes.variacaoReceita > 0 ? '+' : ''}${resumoMes.variacaoReceita}%`}
              tom={resumoMes.variacaoReceita > 0 ? 'alta' : resumoMes.variacaoReceita < 0 ? 'queda' : undefined}
            />
            <StatMes label="Novos pacientes" valor={String(resumoMes.novosPacientes)} />
            <StatMes label="Faltas no mês" valor={String(resumoMes.faltas)} tom={resumoMes.faltas > 0 ? 'queda' : undefined} />
          </dl>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <section aria-labelledby="dashboard-agenda-title" className={`${cardBase} min-w-0 p-5`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 id="dashboard-agenda-title" className="text-lg font-bold text-foreground">Agenda de hoje</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Consultas e atendimentos programados</p>
            </div>
            <Link to="/agenda" className={linkAzul}>Ver agenda completa <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          {agenda.length > 0 ? (
            <div className="space-y-1">
              {agenda.slice(0, 6).map((item, index) => (
                <div
                  key={item.id}
                  className={cn(
                    'grid grid-cols-[52px_4px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-3 py-2.5 sm:grid-cols-[60px_4px_minmax(0,1fr)_minmax(90px,0.6fr)_auto]',
                    index === 0 ? 'bg-[#1080CA]/[0.07]' : 'hover:bg-muted/60',
                  )}
                >
                  <span className="text-sm font-extrabold tabular-nums text-foreground">{item.horario}</span>
                  <span className={cn('h-8 w-1 rounded-full', index === 0 ? 'bg-gradient-primary' : 'bg-border')} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">{item.paciente}</p>
                    <p className="truncate text-xs text-muted-foreground sm:hidden">{item.tipo}</p>
                  </div>
                  <span className="hidden truncate text-xs text-muted-foreground sm:block">{item.tipo}</span>
                  <span className="max-w-28 truncate rounded-full bg-[#111111] px-2.5 py-1 text-[11px] font-bold text-white">{item.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/40 px-4 text-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
                <CalendarDays className="h-5 w-5" />
              </span>
              <p className="text-sm font-bold text-foreground">Nenhuma consulta agendada para hoje</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">Agende um atendimento ou ofereça os horários livres para a lista de espera.</p>
              <Link to="/agenda" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[#1080CA]">Agendar consulta <ArrowRight className="h-4 w-4" /></Link>
            </div>
          )}
        </section>

        <section aria-labelledby="dashboard-alerts-title" className={`${cardBase} p-5`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 id="dashboard-alerts-title" className="text-lg font-bold text-foreground">Precisa de atenção</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Pendências da clínica</p>
            </div>
            <span className={cn('rounded-full px-2.5 py-1 text-xs font-extrabold', alertas.length > 0 ? 'bg-[#111111] text-white' : 'bg-success/10 text-success')}>{alertas.length}</span>
          </div>
          {alertas.length > 0 ? (
            <div className="space-y-2">
              {alertas.slice(0, 4).map((alerta) => (
                <Link key={alerta.id} to={alerta.href} className="group flex min-h-[64px] items-center gap-3 rounded-2xl border border-border/60 px-3 py-2.5 transition hover:border-[#1080CA]/40 hover:bg-[#1080CA]/[0.04]">
                  <span className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    alerta.tom === 'attention' ? 'bg-[#111111] text-white' : 'bg-[#1080CA]/10 text-[#1080CA]',
                  )}>
                    {alerta.id === 'fila' ? <Users className="h-4 w-4" /> : alerta.id === 'estoque' ? <FlaskConical className="h-4 w-4" /> : alerta.id === 'tarefas' ? <ListChecks className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-foreground">{alerta.titulo}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{alerta.detalhe}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[#1080CA] transition group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl bg-success/10 px-4 py-4 text-sm font-semibold text-success">
              <Check className="h-5 w-5" /> Tudo em dia por aqui.
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section aria-labelledby="dashboard-confirmacoes-title" className={`${cardBase} p-5`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 id="dashboard-confirmacoes-title" className={sectionTitle}>Confirmações para amanhã</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Consultas ainda não confirmadas</p>
            </div>
            <span className={cn('rounded-full px-2.5 py-1 text-xs font-extrabold', confirmacoesAmanha.length > 0 ? 'bg-gradient-primary text-white' : 'bg-success/10 text-success')}>{confirmacoesAmanha.length}</span>
          </div>
          {confirmacoesAmanha.length > 0 ? (
            <ul className="space-y-1.5">
              {confirmacoesAmanha.slice(0, 5).map((item) => (
                <li key={item.id} className="flex items-center gap-3 rounded-2xl px-2 py-1.5 hover:bg-muted/60">
                  <span className="w-12 shrink-0 text-sm font-extrabold tabular-nums text-foreground">{item.horario}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.paciente}</span>
                  {item.whatsapp ? (
                    <a
                      href={item.whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Confirmar ${item.paciente} pelo WhatsApp`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1080CA]/10 text-[#1080CA] transition hover:bg-gradient-primary hover:text-white"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </a>
                  ) : (
                    <span className="w-8 shrink-0" />
                  )}
                </li>
              ))}
              {confirmacoesAmanha.length > 5 && (
                <li className="pt-1"><Link to="/agenda" className={linkAzul}>Ver todas ({confirmacoesAmanha.length}) <ArrowRight className="h-3.5 w-3.5" /></Link></li>
              )}
            </ul>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl bg-success/10 px-4 py-4 text-sm font-semibold text-success">
              <CheckCircle2 className="h-5 w-5" /> Amanhã está todo confirmado.
            </div>
          )}
        </section>

        <section aria-labelledby="dashboard-semana-title" className={`${cardBase} p-5`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 id="dashboard-semana-title" className={sectionTitle}>Ocupação da semana</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Consultas por dia</p>
            </div>
            <Link to="/agenda" className={linkAzul}>Agenda <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          {ocupacaoSemana.length > 0 ? (
            <ol className="flex h-36 items-end gap-2" aria-label="Consultas por dia da semana">
              {ocupacaoSemana.map((dia) => (
                <li key={dia.dia} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <span className={cn('text-[11px] font-bold tabular-nums', dia.hoje ? 'text-[#1080CA]' : 'text-muted-foreground')}>{dia.total}</span>
                  <div className="flex h-24 w-full items-end rounded-xl bg-muted/70">
                    <div
                      className={cn('w-full rounded-xl', dia.hoje ? 'bg-gradient-primary' : 'bg-[#111111]/80')}
                      style={{ height: `${Math.max(dia.total > 0 ? 8 : 0, Math.round((dia.total / picoSemana) * 100))}%` }}
                      aria-hidden="true"
                    />
                  </div>
                  <span className={cn('text-[11px] font-semibold capitalize', dia.hoje ? 'text-foreground' : 'text-muted-foreground')}>{dia.dia}</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex h-36 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/40 text-sm text-muted-foreground">Sem consultas nesta semana.</div>
          )}
        </section>

        <section aria-labelledby="dashboard-tarefas-title" className={`${cardBase} p-5`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 id="dashboard-tarefas-title" className={sectionTitle}>Minhas tarefas</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{tarefasAtrasadas > 0 ? `${tarefasAtrasadas} atrasada${tarefasAtrasadas > 1 ? 's' : ''}` : 'Pendentes e em andamento'}</p>
            </div>
            <Link to="/tarefas" className={linkAzul}>Ver todas <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          {tarefas.length > 0 ? (
            <ul className="divide-y divide-dashed divide-border">
              {tarefas.slice(0, 5).map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2">
                  <ListChecks className={cn('h-4 w-4 shrink-0', t.atrasada ? 'text-destructive' : 'text-[#1080CA]')} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.titulo}</span>
                  {t.vencimento && <span className={cn('shrink-0 text-xs font-bold tabular-nums', t.atrasada ? 'text-destructive' : 'text-muted-foreground')}>{t.vencimento}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl bg-success/10 px-4 py-4 text-sm font-semibold text-success">
              <Check className="h-5 w-5" /> Nenhuma tarefa pendente.
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(240px,0.9fr)_minmax(320px,1.4fr)_minmax(250px,0.9fr)]">
        <section aria-labelledby="dashboard-progress-title" className={`${cardBase} p-5`}>
          <h2 id="dashboard-progress-title" className={sectionTitle}>Atendimentos do dia</h2>
          <div className="mt-3 flex items-center gap-4">
            <div className="relative h-28 w-28 shrink-0" role="progressbar" aria-label="Atendimentos concluídos" aria-valuemin={0} aria-valuemax={100} aria-valuenow={desempenhoSeguro}>
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
                <defs>
                  <linearGradient id="dashboard-ring" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stopColor="#1080CA" />
                    <stop offset="100%" stopColor="#2ED5E7" />
                  </linearGradient>
                </defs>
                <circle cx="50" cy="50" r="40" fill="none" className="stroke-muted" strokeWidth="11" />
                <circle cx="50" cy="50" r="40" fill="none" stroke="url(#dashboard-ring)" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 40}`} strokeDashoffset={`${2 * Math.PI * 40 * (1 - desempenhoSeguro / 100)}`} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-foreground">
                <span className="text-2xl font-extrabold tabular-nums">{desempenhoSeguro}%</span>
                <span className="text-[10px] text-muted-foreground">concluídos</span>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{desempenho.descricao}</p>
          </div>
          {aniversariantes.length > 0 && (
            <div className="mt-4 rounded-2xl bg-gradient-primary/10 p-3" style={{ background: 'linear-gradient(135deg, rgba(16,128,202,0.10), rgba(46,213,231,0.10))' }}>
              <p className="flex items-center gap-1.5 text-xs font-bold text-foreground"><Cake className="h-3.5 w-3.5 text-[#1080CA]" /> Aniversariantes de hoje</p>
              <ul className="mt-1.5 space-y-1">
                {aniversariantes.slice(0, 3).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium text-foreground">{p.nome}</span>
                    {p.whatsapp && (
                      <a href={p.whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Parabenizar ${p.nome} pelo WhatsApp`} className="shrink-0 text-[#1080CA] hover:underline">Parabenizar</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section aria-labelledby="dashboard-cashflow-title" className={`${cardBase} min-w-0 p-5`}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 id="dashboard-cashflow-title" className={sectionTitle}>Fluxo financeiro</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Últimos seis meses</p>
            </div>
            <Link to="/fluxo-caixa" className={linkAzul}>Detalhes</Link>
          </div>
          {fluxoFinanceiro.length > 0 ? (
            <div className="h-36" aria-label="Gráfico de receitas e despesas">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fluxoFinanceiro} barGap={5}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                  <YAxis hide />
                  <Tooltip formatter={(value: number, name: string) => [new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value), name === 'receitas' ? 'Receitas' : 'Despesas']} />
                  <Bar dataKey="receitas" name="receitas" fill="#1080CA" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="despesas" name="despesas" fill="#2b2b33" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-36 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border bg-muted/40 text-center text-sm text-muted-foreground">
              Sem dados financeiros neste período.
              <Link to="/financeiro" className="text-xs font-bold text-[#1080CA]">Registrar primeiro lançamento</Link>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#1080CA]" />Receitas</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#2b2b33]" />Despesas</span>
          </div>
        </section>

        <section aria-labelledby="dashboard-actions-title" className={`${cardBase} p-5`}>
          <h2 id="dashboard-actions-title" className={`${sectionTitle} mb-3`}>Ações rápidas</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {acoes.map((acao, index) => {
              const Icon = actionIcons[acao.icon];
              return (
                <Link
                  key={acao.label}
                  to={acao.href}
                  className={cn(
                    'group flex min-h-[84px] flex-col justify-between gap-2 rounded-2xl p-3 transition hover:-translate-y-0.5 hover:shadow-md',
                    actionTones[index % actionTones.length],
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs font-bold leading-tight">{acao.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatMes({ label, valor, tom }: { label: string; valor: string; tom?: 'alta' | 'queda' }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-3">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex items-center gap-1.5 text-xl font-bold tabular-nums text-foreground">
        {valor}
        {tom === 'alta' && <ArrowUpRight className="h-4 w-4 text-success" aria-label="em alta" />}
        {tom === 'queda' && <ArrowDownRight className="h-4 w-4 text-destructive" aria-label="em queda" />}
      </dd>
    </div>
  );
}

function iniciais(nome: string) {
  return nome.split(' ').filter(Boolean).map(parte => parte[0]).slice(0, 2).join('').toUpperCase();
}

function primeiroNome(nome: string) {
  return nome.split(' ')[0] || nome;
}
