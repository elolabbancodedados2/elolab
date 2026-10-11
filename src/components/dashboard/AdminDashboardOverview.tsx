import {
  Activity, ArrowRight, BarChart3, CalendarDays, Check, ClipboardList,
  Clock3, FileText, FlaskConical, Plus, UserRoundPlus, Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

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
}

const actionIcons = {
  calendar: CalendarDays,
  patient: UserRoundPlus,
  document: FileText,
  queue: ClipboardList,
};

const cardBase = 'rounded-2xl border border-[#E0EBF2] bg-white shadow-[0_8px_24px_-18px_rgba(12,31,84,0.28)]';

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
}: AdminDashboardOverviewProps) {
  const cards = [
    { label: 'Consultas hoje', value: metricas.consultas, note: dataLabel, icon: CalendarDays, accent: '#0F7BFD' },
    { label: 'Na fila', value: metricas.fila, note: 'Aguardando atendimento', icon: Users, accent: '#005ECC' },
    { label: 'Concluídas', value: metricas.finalizadas, note: 'Atendimentos de hoje', icon: Check, accent: '#0F7BFD' },
    { label: 'Receita do dia', value: metricas.receita, note: 'Valores recebidos hoje', icon: Activity, accent: '#005ECC' },
  ];
  const desempenhoSeguro = Math.max(0, Math.min(100, desempenho.percentual));

  return (
    <div className="space-y-4 pb-8" data-testid="admin-dashboard-overview">
      <header className={`${cardBase} relative overflow-hidden p-5 sm:p-7`}>
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-[#E0EBF2]/70" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[#005ECC]">{dataLabel} <span className="mx-1 text-[#0C1F54]/30">·</span> {horarioLabel}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0C1F54] sm:text-3xl">{saudacao}, {nome}</h1>
            <p className="mt-1 text-sm text-[#0C1F54]/65">Visão da clínica e agenda do dia.</p>
          </div>
          <Link
            to="/agenda"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#005ECC] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#004FAE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7BFD] focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" /> Novo atendimento
          </Link>
        </div>
      </header>

      <section aria-labelledby="dashboard-timeline-title" className="overflow-hidden rounded-2xl border border-[#D4F7FC] bg-[#F2FCFE] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="shrink-0 lg:w-40">
            <h2 id="dashboard-timeline-title" className="font-semibold text-[#0C1F54]">Sua agenda de hoje</h2>
            <p className="mt-1 text-xs text-[#0C1F54]/60">{dataLabel}</p>
          </div>
          {agenda.length > 0 ? (
            <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
              {agenda.slice(0, 5).map((item) => (
                <div key={item.id} className="flex min-w-[145px] items-center gap-2 rounded-xl border border-white bg-white px-3 py-2 shadow-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#0F7BFD] ring-4 ring-[#50E3FB]/25" />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold tabular-nums text-[#0C1F54]">{item.horario}</span>
                    <span className="block truncate text-[11px] text-[#0C1F54]/65">{item.paciente}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="flex-1 rounded-xl bg-white/80 px-4 py-3 text-sm text-[#0C1F54]/65">Nenhuma consulta agendada para hoje.</p>
          )}
          <Link to="/agenda" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#B7D9FF] bg-white px-3 text-sm font-medium text-[#005ECC] hover:bg-[#EAF4FF]">
            Ver agenda <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section aria-label="Indicadores do dia" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, note, icon: Icon, accent }) => (
          <article key={label} className={`${cardBase} relative overflow-hidden p-4 sm:p-5`}>
            <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#0C1F54]/65">{label}</p>
                <p className="mt-2 truncate text-3xl font-bold tracking-tight text-[#0C1F54]">{value}</p>
                <p className="mt-1 truncate text-[11px] text-[#0C1F54]/55">{note}</p>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF4FF] text-[#005ECC]">
                <Icon className="h-5 w-5" />
              </span>
            </div>
          </article>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
        <section aria-labelledby="dashboard-agenda-title" className={`${cardBase} min-w-0 p-4 sm:p-5`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 id="dashboard-agenda-title" className="text-lg font-semibold text-[#0C1F54]">Agenda de hoje</h2>
              <p className="mt-0.5 text-xs text-[#0C1F54]/55">Consultas e atendimentos programados</p>
            </div>
            <Link to="/agenda" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#005ECC] hover:underline">Ver agenda completa <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          {agenda.length > 0 ? (
            <div className="space-y-2">
              {agenda.slice(0, 5).map((item) => (
                <div key={item.id} className="grid grid-cols-[54px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-[#E0EBF2]/80 bg-white px-3 py-3 sm:grid-cols-[64px_minmax(0,1fr)_minmax(90px,0.7fr)_auto]">
                  <span className="text-sm font-semibold tabular-nums text-[#005ECC]">{item.horario}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#0C1F54]">{item.paciente}</p>
                    <p className="truncate text-xs text-[#0C1F54]/55 sm:hidden">{item.tipo}</p>
                  </div>
                  <span className="hidden truncate text-xs text-[#0C1F54]/65 sm:block">{item.tipo}</span>
                  <span className="max-w-28 truncate rounded-full bg-[#EAF4FF] px-2.5 py-1 text-[11px] font-medium text-[#005ECC]">{item.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-40 flex-col items-center justify-center rounded-xl bg-[#F5F9FC] px-4 text-center">
              <CalendarDays className="mb-2 h-7 w-7 text-[#0F7BFD]" />
              <p className="text-sm font-medium text-[#0C1F54]">Nenhuma consulta agendada para hoje</p>
              <Link to="/agenda" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#005ECC]">Agendar consulta <ArrowRight className="h-4 w-4" /></Link>
            </div>
          )}
        </section>

        <section aria-labelledby="dashboard-alerts-title" className="rounded-2xl border border-[#CBEFF5] bg-[#F4FCFE] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 id="dashboard-alerts-title" className="text-lg font-semibold text-[#0C1F54]">Precisa de atenção</h2>
              <p className="mt-0.5 text-xs text-[#0C1F54]/55">Pendências da clínica</p>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#005ECC]">{alertas.length}</span>
          </div>
          {alertas.length > 0 ? (
            <div className="space-y-2">
              {alertas.slice(0, 4).map((alerta) => (
                <Link key={alerta.id} to={alerta.href} className="flex min-h-[66px] items-center gap-3 rounded-xl border border-white bg-white px-3 py-2.5 transition-colors hover:border-[#B7D9FF]">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${alerta.tom === 'attention' ? 'bg-[#E1F9FD] text-[#005ECC]' : 'bg-[#EAF4FF] text-[#0F7BFD]'}`}>
                    {alerta.id === 'fila' ? <Users className="h-4 w-4" /> : alerta.id === 'estoque' ? <FlaskConical className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-[#0C1F54]">{alerta.titulo}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-[#0C1F54]/60">{alerta.detalhe}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[#005ECC]" />
                </Link>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-white px-3 py-4 text-sm text-[#0C1F54]/65">Tudo em dia por aqui.</p>
          )}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(240px,0.9fr)_minmax(320px,1.4fr)_minmax(250px,0.9fr)]">
        <section aria-labelledby="dashboard-progress-title" className={`${cardBase} p-4 sm:p-5`}>
          <h2 id="dashboard-progress-title" className="text-base font-semibold text-[#0C1F54]">Atendimentos do dia</h2>
          <div className="mt-3 flex items-center gap-4">
            <div className="relative h-28 w-28 shrink-0" role="img" aria-label={`${desempenhoSeguro}% concluídos`}>
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#E0EBF2" strokeWidth="10" />
                <circle cx="50" cy="50" r="40" fill="none" stroke="#0F7BFD" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 40}`} strokeDashoffset={`${2 * Math.PI * 40 * (1 - desempenhoSeguro / 100)}`} />
              </svg>
              <span className="absolute inset-0 flex flex-col items-center justify-center text-[#0C1F54]">
                <span className="text-2xl font-bold tabular-nums">{desempenhoSeguro}%</span>
                <span className="text-[10px] text-[#0C1F54]/55">concluídos</span>
              </span>
            </div>
            <p className="text-xs leading-relaxed text-[#0C1F54]/65">{desempenho.descricao}</p>
          </div>
        </section>

        <section aria-labelledby="dashboard-cashflow-title" className={`${cardBase} min-w-0 p-4 sm:p-5`}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 id="dashboard-cashflow-title" className="text-base font-semibold text-[#0C1F54]">Fluxo financeiro</h2>
              <p className="mt-0.5 text-xs text-[#0C1F54]/55">Últimos seis meses</p>
            </div>
            <Link to="/fluxo-caixa" className="text-xs font-semibold text-[#005ECC] hover:underline">Detalhes</Link>
          </div>
          {fluxoFinanceiro.length > 0 ? (
            <div className="h-36" aria-label="Gráfico de receitas e despesas">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fluxoFinanceiro} barGap={5}>
                  <CartesianGrid stroke="#E0EBF2" strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#0C1F54', fontSize: 10 }} />
                  <YAxis hide />
                  <Tooltip formatter={(value: number, name: string) => [new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value), name === 'receitas' ? 'Receitas' : 'Despesas']} />
                  <Bar dataKey="receitas" name="receitas" fill="#0F7BFD" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="despesas" name="despesas" fill="#50E3FB" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-36 items-center justify-center rounded-xl bg-[#F5F9FC] text-sm text-[#0C1F54]/60">Sem dados financeiros neste período.</div>
          )}
          <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-[#0C1F54]/65">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#0F7BFD]" />Receitas</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#50E3FB]" />Despesas</span>
          </div>
        </section>

        <section aria-labelledby="dashboard-actions-title" className={`${cardBase} p-4 sm:p-5`}>
          <h2 id="dashboard-actions-title" className="mb-3 text-base font-semibold text-[#0C1F54]">Ações rápidas</h2>
          <div className="grid grid-cols-2 gap-2">
            {acoes.map((acao) => {
              const Icon = actionIcons[acao.icon];
              return (
                <Link key={acao.label} to={acao.href} className="group flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-xl border border-[#E0EBF2] bg-white px-2 py-3 text-center transition-colors hover:border-[#0F7BFD]/40 hover:bg-[#F5FAFF]">
                  <Icon className="h-5 w-5 text-[#005ECC]" />
                  <span className="text-[11px] font-medium leading-tight text-[#0C1F54]">{acao.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
