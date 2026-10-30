import {
  ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, Cake, Check, CheckCircle2, ClipboardList,
  FileText, FlaskConical, ListChecks, MessageCircle, Plus, RefreshCw, Timer, UserRoundPlus, Users,
} from '@/components/icons/elolabIcons';
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

export interface AdminDashboardFilaItem {
  id: string;
  paciente: string;
  medico?: string | null;
  prioridade: string;
  status: string;
  espera: string;
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
  filaAgora?: AdminDashboardFilaItem[];
  filaAtualizando?: boolean;
  onAtualizarFila?: () => void | Promise<unknown>;
  atalhosAdmin?: Array<{ label: string; href: string }>;
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

const cardBase = 'rounded-xl border border-border bg-card text-card-foreground';
const sectionTitle = 'text-base font-bold text-foreground';
const linkAzul = 'inline-flex shrink-0 items-center gap-1 text-xs font-bold text-primary hover:underline';

export function AdminDashboardOverview({
  nome,
  saudacao = 'Bom dia',
  dataLabel,
  horarioLabel,
  metricas,
  agenda,
  filaAgora = [],
  filaAtualizando = false,
  onAtualizarFila,
  atalhosAdmin = [],
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
  const picoSemana = Math.max(1, ...ocupacaoSemana.map(d => d.total));
  const tarefasAtrasadas = tarefas.filter(t => t.atrasada).length;

  return (
    <div className="space-y-5 pb-8" data-testid="admin-dashboard-overview">
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold capitalize text-muted-foreground">
            {dataLabel} <span className="mx-1 text-border">·</span> Hora local {horarioLabel}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Visão da clínica</h1>
          <p className="mt-1 text-sm text-muted-foreground">{saudacao}, {nome}. Prioridades e agenda de hoje.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {atalhosAdmin.length > 0 && (
            <nav aria-label="Atalhos da administração" className="flex flex-wrap items-center gap-2">
              {atalhosAdmin.map((atalho) => (
                <Link key={atalho.href} to={atalho.href} className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                  {atalho.label}
                </Link>
              ))}
            </nav>
          )}
          <Link to="/agenda" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
            <Plus className="h-4 w-4" /> Novo atendimento
          </Link>
        </div>
      </header>

      <section aria-labelledby="dashboard-summary-title" className="border-b border-border pb-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="dashboard-summary-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumo de hoje</h2>
          <span className="text-xs text-muted-foreground">{dataLabel}</span>
        </div>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4 sm:gap-0">
          {[
            { label: 'Consultas agendadas', value: metricas.consultas, href: '/agenda' },
            { label: 'Aguardando atendimento', value: metricas.fila, href: '/fila' },
            { label: 'Atendimentos concluídos', value: metricas.finalizadas, href: '/fila' },
            { label: 'Recebido hoje', value: metricas.receita, href: '/fluxo-caixa' },
          ].map((item, index) => (
            <div key={item.label} className={cn('min-w-0 sm:px-4', index > 0 && 'sm:border-l sm:border-border', index === 0 && 'sm:pl-0')}>
              <dt className="text-xs leading-5 text-muted-foreground">{item.label}</dt>
              <dd className="mt-0.5">
                <Link to={item.href} className="text-xl font-semibold tabular-nums text-foreground hover:text-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-2xl">
                  {item.value}<span className="sr-only"> — abrir detalhes</span>
                </Link>
              </dd>
            </div>
          ))}
        </dl>
      </section>

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
                    index === 0 ? 'bg-primary/5' : 'hover:bg-muted/60',
                  )}
                >
                  <span className="text-sm font-extrabold tabular-nums text-foreground">{item.horario}</span>
                  <span className={cn('h-8 w-1 rounded-full', index === 0 ? 'bg-primary' : 'bg-border')} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">{item.paciente}</p>
                    <p className="truncate text-xs text-muted-foreground sm:hidden">{item.tipo}</p>
                  </div>
                  <span className="hidden truncate text-xs text-muted-foreground sm:block">{item.tipo}</span>
                  <span className="max-w-28 truncate rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground">{item.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/40 px-4 text-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <CalendarDays className="h-5 w-5" />
              </span>
              <p className="text-sm font-bold text-foreground">Nenhuma consulta agendada para hoje</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">Agende um atendimento ou ofereça os horários livres para a lista de espera.</p>
              <Link to="/agenda" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary">Agendar consulta <ArrowRight className="h-4 w-4" /></Link>
            </div>
          )}
        </section>

        <section aria-labelledby="dashboard-alerts-title" className={`${cardBase} p-5`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 id="dashboard-alerts-title" className="text-lg font-bold text-foreground">Precisa de atenção</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Pendências da clínica</p>
            </div>
            <span className={cn('rounded-full px-2.5 py-1 text-xs font-extrabold', alertas.some(alerta => alerta.tom === 'attention') ? 'bg-warning/10 text-warning-foreground' : 'bg-success/10 text-success')}>{alertas.length}</span>
          </div>
          {alertas.length > 0 ? (
            <div className="space-y-2">
              {alertas.slice(0, 4).map((alerta) => (
                <Link key={alerta.id} to={alerta.href} className="group flex min-h-[64px] items-center gap-3 rounded-2xl border border-border/60 px-3 py-2.5 transition hover:border-primary/40 hover:bg-primary/5">
                  <span className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    alerta.tom === 'attention' ? 'bg-warning/10 text-warning-foreground' : 'bg-primary/10 text-primary',
                  )}>
                    {alerta.id === 'fila' ? <Users className="h-4 w-4" /> : alerta.id === 'estoque' ? <FlaskConical className="h-4 w-4" /> : alerta.id === 'tarefas' ? <ListChecks className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-foreground">{alerta.titulo}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{alerta.detalhe}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-primary transition group-hover:translate-x-0.5" />
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

      <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
        <section aria-labelledby="dashboard-fila-title" className={`${cardBase} min-w-0 p-5`}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 id="dashboard-fila-title" className={sectionTitle}>Fila agora</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Atendimentos ativos de hoje</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-extrabold tabular-nums text-primary">{filaAgora.length}</span>
              {onAtualizarFila && (
                <button type="button" onClick={() => { void onAtualizarFila(); }} disabled={filaAtualizando} aria-label="Atualizar fila" title="Atualizar fila" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <RefreshCw aria-hidden="true" className={cn('h-4 w-4 motion-reduce:animate-none', filaAtualizando && 'animate-spin')} />
                </button>
              )}
            </div>
          </div>
          {filaAgora.length > 0 ? (
            <ul className="space-y-2">
              {filaAgora.slice(0, 3).map((item) => {
                const prioridade = item.prioridade === 'urgente' ? 'Urgente' : item.prioridade === 'preferencial' ? 'Preferencial' : 'Normal';
                const prioridadeTom = item.prioridade === 'urgente' ? 'text-destructive' : item.prioridade === 'preferencial' ? 'text-warning-foreground' : 'text-muted-foreground';
                const status = item.status === 'em_atendimento' ? 'Em atendimento' : item.status === 'chamado' ? 'Chamado' : 'Aguardando';
                return (
                  <li key={item.id}>
                    <Link to="/fila" className="block rounded-xl border border-border/70 px-3 py-2.5 transition hover:border-primary/35 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-foreground">{item.paciente}</p>
                          {item.medico && <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.medico}</p>}
                        </div>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{status}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                        <span className={cn('font-semibold', prioridadeTom)}>{prioridade}</span>
                        <span className="inline-flex items-center gap-1 text-muted-foreground"><Timer aria-hidden="true" className="h-3.5 w-3.5" />{item.status === 'aguardando' ? 'Aguardando há' : 'Chegou há'} {item.espera}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-3 text-center">
              <CheckCircle2 aria-hidden="true" className="mb-2 h-5 w-5 text-success" />
              <p className="text-sm font-semibold text-foreground">Fila vazia por enquanto</p>
              <p className="mt-1 text-xs text-muted-foreground">Nenhum paciente aguardando hoje.</p>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-2">
            {filaAgora.length > 3 && <span className="text-xs text-muted-foreground">+{filaAgora.length - 3} pacientes</span>}
            <Link to="/fila" className={cn(linkAzul, 'ml-auto')}>Abrir fila <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
        </section>

        <section aria-labelledby="dashboard-confirmacoes-title" className={`${cardBase} p-5`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 id="dashboard-confirmacoes-title" className={sectionTitle}>Confirmações para amanhã</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Consultas ainda não confirmadas</p>
            </div>
            <span className={cn('rounded-full px-2.5 py-1 text-xs font-extrabold', confirmacoesAmanha.length > 0 ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success')}>{confirmacoesAmanha.length}</span>
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
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
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
                  <span className={cn('text-[11px] font-bold tabular-nums', dia.hoje ? 'text-primary' : 'text-muted-foreground')}>{dia.total}</span>
                  <div className="flex h-24 w-full items-end rounded-xl bg-muted/70">
                    <div
                      className={cn('w-full rounded-xl', dia.hoje ? 'bg-primary' : 'bg-primary/70')}
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
                  <ListChecks className={cn('h-4 w-4 shrink-0', t.atrasada ? 'text-destructive' : 'text-primary')} />
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
          {metricas.consultas > 0 ? (
            <div className="mt-3 flex items-center gap-4">
              <div className="relative h-28 w-28 shrink-0" role="progressbar" aria-label="Atendimentos concluídos" aria-valuemin={0} aria-valuemax={100} aria-valuenow={desempenhoSeguro}>
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
                  <circle cx="50" cy="50" r="40" fill="none" className="stroke-muted" strokeWidth="11" />
                  <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--primary))" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 40}`} strokeDashoffset={`${2 * Math.PI * 40 * (1 - desempenhoSeguro / 100)}`} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-foreground">
                  <span className="text-2xl font-extrabold tabular-nums">{desempenhoSeguro}%</span>
                  <span className="text-[10px] text-muted-foreground">concluídos</span>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{desempenho.descricao}</p>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground">Nenhum atendimento programado para hoje.</p>
              <Link to="/agenda" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">Agendar consulta <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
          )}
          {aniversariantes.length > 0 && (
            <div className="mt-4 rounded-2xl border border-border bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 text-xs font-bold text-foreground"><Cake className="h-3.5 w-3.5 text-primary" /> Aniversariantes de hoje</p>
              <ul className="mt-1.5 space-y-1">
                {aniversariantes.slice(0, 3).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium text-foreground">{p.nome}</span>
                    {p.whatsapp && (
                      <a href={p.whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Parabenizar ${p.nome} pelo WhatsApp`} className="shrink-0 text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Parabenizar</a>
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
                  <Bar dataKey="receitas" name="receitas" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesas" name="despesas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-36 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border bg-muted/40 text-center text-sm text-muted-foreground">
              Sem dados financeiros neste período.
              <Link to="/financeiro" className="text-xs font-bold text-primary">Registrar primeiro lançamento</Link>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" />Receitas</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-destructive" />Despesas</span>
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
                    index === 0
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary'
                      : 'border border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-primary',
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
