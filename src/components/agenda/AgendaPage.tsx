import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { addDays, addMonths, addWeeks, endOfMonth, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, KeyboardSensor, MouseSensor,
  TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { MAX_LINHAS_AUTO, useAgendamentosPeriodo, useMedicos, useSupabaseQuery } from '@/hooks/useSupabaseData';
import { useAgendaColorScheme } from './hooks/useAgendaColorScheme';
import { useAgendaDefaultView } from './hooks/useAgendaDefaultView';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { AgendaHeader } from './AgendaHeader';
import { DailyMultiDoctorView } from './views/DailyMultiDoctorView';
import { WeeklyView } from './views/WeeklyView';
import { MonthlyView } from './views/MonthlyView';
import { WaitingListSidebar } from './WaitingListSidebar';
import { PainelNovoAgendamento } from './PainelNovoAgendamento';
import { AgendaSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ErrorState';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { pacienteCorresponde } from '@/lib/buscaPaciente';
import { isValidAgendaDate, normalizeAgendaDate } from '@/lib/agendaDate';
import { minutosAgoraSaoPaulo, proximaVagaLivre } from '@/lib/proximaVagaLivre';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { podeRemarcarAgendamento } from '@/lib/appointmentStatus';
import { prepareWaitingListAppointment } from '@/lib/waitingListSlotCompatibility';
import { compararPorPrioridade, STATUS_ATIVOS_LISTA_ESPERA } from '@/lib/listaEsperaPrioridade';
import { agendaScreenReaderInstructions, criarAnunciosAgenda } from './agendaDndAccessibility';
import { formatAppointmentStatus } from '@/components/dashboard/appointmentStatus';
import { nomeMedico } from '@/lib/formatters';
import { contarTotaisAgenda, eAgendamentoOnline, TIPOS_FIXOS_CONSULTA } from './agendaStatus';
import { proximaVagaNoDia, type Faixa } from '@/lib/vagaLivreDia';
import { Ban, Plus } from '@/components/icons/elolabIcons';
import { AcoesConsultaSheet } from './AcoesConsultaSheet';
import { cn } from '@/lib/utils';

export type AgendaView = 'daily' | 'weekly' | 'monthly';

type MobileAgendaAppointment = {
  id: string;
  hora_inicio: string;
  hora_fim?: string | null;
  medico_id?: string | null;
  tipo?: string | null;
  status?: string | null;
  pacientes?: { nome_social?: string | null; nome?: string | null } | null;
};

type FichaMobile =
  | { tipo: 'consulta'; hora: string; appointment: MobileAgendaAppointment }
  | { tipo: 'bloqueio'; hora: string; bloqueio: any }
  | { tipo: 'livre'; hora: string; medicoId: string };

function MobileDailyAppointments({
  appointments,
  medicoById,
  onCardClick,
  bloqueios = [],
  vagasLivres = [],
  onSlotClick,
  sempreVisivel = false,
  comAcoes = false,
  onNovaConsulta,
  onRemarcar,
}: {
  /** Botão "⋯" com as ações da consulta numa folha (o celular não tem botão direito). */
  comAcoes?: boolean;
  onNovaConsulta?: (initial: any) => void;
  onRemarcar?: (agendamento: any) => void;
  appointments: MobileAgendaAppointment[];
  medicoById: Record<string, { nome?: string | null; crm?: string | null } | undefined>;
  onCardClick: (appointment: MobileAgendaAppointment) => void;
  /** Bloqueios do dia dos profissionais exibidos. */
  bloqueios?: any[];
  /** Próxima vaga livre de cada profissional. */
  vagasLivres?: Array<{ medicoId: string; hora: string }>;
  onSlotClick?: (medicoId: string, hora: string) => void;
  /** Mostra a lista também no desktop (consultas fora da grade). */
  sempreVisivel?: boolean;
}) {
  const ordered = [...appointments].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  const nomeDoMedico = (id?: string | null) => {
    const medico = id ? medicoById[id] : undefined;
    return medico ? nomeMedico(medico.nome || medico.crm) : 'Profissional não informado';
  };
  // Consultas, bloqueios e horários livres numa linha do tempo só: no celular
  // a grade não aparece, e antes a lista escondia bloqueios e vagas.
  const fichas: FichaMobile[] = [
    ...ordered.map(appointment => ({ tipo: 'consulta' as const, hora: appointment.hora_inicio.slice(0, 5), appointment })),
    ...bloqueios.map(bloqueio => ({ tipo: 'bloqueio' as const, hora: bloqueio.dia_inteiro ? '00:00' : String(bloqueio.hora_inicio || '00:00').slice(0, 5), bloqueio })),
    ...(onSlotClick ? vagasLivres.map(vaga => ({ tipo: 'livre' as const, hora: vaga.hora, medicoId: vaga.medicoId })) : []),
  ].sort((a, b) => a.hora.localeCompare(b.hora) || (a.tipo === 'consulta' ? -1 : 1));
  const visibilidade = sempreVisivel ? '' : 'xl:hidden';

  if (fichas.length === 0) {
    return (
      <div className={cn('rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center', visibilidade)}>
        <p className="font-medium text-foreground">Nenhuma consulta neste dia</p>
        <p className="mt-1 text-sm text-muted-foreground">Escolha outra data ou crie um novo agendamento.</p>
      </div>
    );
  }

  return (
    <section className={cn('space-y-2', visibilidade)} aria-label="Consultas do dia em ordem de horário">
      <p className="px-1 text-sm text-muted-foreground">{ordered.length} consulta{ordered.length === 1 ? '' : 's'} neste dia</p>
      {fichas.map(ficha => {
        if (ficha.tipo === 'bloqueio') {
          const b = ficha.bloqueio;
          return (
            <div key={`bloqueio-${b.id}`} className="flex min-h-12 items-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              <span className="w-[4.5rem] shrink-0 text-xs font-semibold tabular-nums">
                {b.dia_inteiro ? 'Dia todo' : `${String(b.hora_inicio).slice(0, 5)}–${String(b.hora_fim).slice(0, 5)}`}
              </span>
              <span className="min-w-0 flex-1 border-l border-border pl-3">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><Ban aria-hidden="true" className="h-3.5 w-3.5" /> Bloqueado</span>
                <span className="block truncate text-xs">{nomeDoMedico(b.medico_id)}{b.motivo || b.tipo ? ` · ${b.motivo || b.tipo}` : ''}</span>
              </span>
            </div>
          );
        }
        if (ficha.tipo === 'livre') {
          return (
            <button
              key={`livre-${ficha.medicoId}-${ficha.hora}`}
              type="button"
              onClick={() => onSlotClick?.(ficha.medicoId, ficha.hora)}
              aria-label={`Agendar no horário livre das ${ficha.hora} com ${nomeDoMedico(ficha.medicoId)}`}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-dashed border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="w-[4.5rem] shrink-0 text-sm font-semibold tabular-nums text-foreground">{ficha.hora}</span>
              <span className="min-w-0 flex-1 border-l border-border pl-3">
                <span className="block text-xs font-semibold text-foreground">Horário livre</span>
                <span className="block truncate text-xs text-muted-foreground">{nomeDoMedico(ficha.medicoId)}</span>
              </span>
              <Plus aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          );
        }
        const appointment = ficha.appointment;
        const patient = appointment.pacientes?.nome_social || appointment.pacientes?.nome || 'Paciente';
        const doctor = nomeDoMedico(appointment.medico_id);
        const start = appointment.hora_inicio?.slice(0, 5) || '—';
        const end = appointment.hora_fim?.slice(0, 5);
        const statusKey = appointment.status || 'agendado';
        const status = formatAppointmentStatus(statusKey);
        const statusClass = ['confirmado', 'pago'].includes(statusKey)
          ? 'bg-success/10 text-success'
          : ['aguardando', 'aguardando_triagem', 'em_triagem', 'fila_atendimento', 'aguardando_pagamento', 'aguardando_pagamento_adicional', 'faltou'].includes(statusKey)
            ? 'bg-warning/15 text-warning-foreground'
            : ['cancelado', 'finalizado', 'atendimento_finalizado'].includes(statusKey)
              ? 'bg-muted text-muted-foreground'
              : 'bg-primary/10 text-primary';

        return (
          <div key={appointment.id} className="flex items-stretch gap-2">
            <button
              type="button"
              onClick={() => onCardClick(appointment)}
              aria-label={`Abrir consulta de ${patient} às ${start}, status ${status}`}
              className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="w-[4.5rem] shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {start}{end ? <span className="block text-xs font-normal text-muted-foreground">até {end}</span> : null}
              </span>
              <span className="min-w-0 flex-1 border-l border-border pl-3">
                <span className="block truncate text-sm font-semibold text-foreground">{patient}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{doctor}{appointment.tipo ? ` · ${appointment.tipo}` : ''}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${statusClass}`}>{status}</span>
            </button>
            {comAcoes && (
              <div className="flex items-center">
                <AcoesConsultaSheet agendamento={appointment} onAbrir={() => onCardClick(appointment)} onNovaConsulta={onNovaConsulta} onRemarcar={onRemarcar} />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

const VIEWS_AGENDA: AgendaView[] = ['daily', 'weekly', 'monthly'];
const isAgendaView = (value: string | null): value is AgendaView =>
  value !== null && VIEWS_AGENDA.includes(value as AgendaView);

function lerPreferenciaAgenda(chave: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage.getItem(chave);
  } catch {
    return null;
  }
}

function salvarPreferenciaAgenda(chave: string, valor: string) {
  try {
    if (typeof window !== 'undefined') window.sessionStorage.setItem(chave, valor);
  } catch {
    // A preferência é opcional; a agenda deve continuar funcionando sem armazenamento local.
  }
}

/** Pedido do link público que a recepção ainda não confirmou. */
const pendenteOnline = (a: any) => a.status === 'agendado' && eAgendamentoOnline(a);

function toMinutes(t: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(t)) return Number.NaN;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function AgendaPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchString = searchParams.toString();
  const { profile } = useSupabaseAuth();
  // Encaixe sem agendamento é operação da recepção, só no dia de hoje.
  const podeEncaixar = Boolean(profile?.roles?.some(role => role === 'admin' || role === 'recepcao'));
  const esperaIdDaRota = searchParams.get('espera');
  const pacienteIdDaRota = searchParams.get('paciente');
  const reagendarIdDaRota = searchParams.get('reagendar');
  // Links da central de notificações: ?data=AAAA-MM-DD&agendamento=<id>
  const dataDaRota = searchParams.get('data');
  const agendamentoIdDaRota = searchParams.get('agendamento');
  const viewDaRota = searchParams.get('view');
  const viewDaRotaValida = isAgendaView(viewDaRota);
  const reagendarAplicadoRef = useRef<string | null>(null);
  const { medicoId: myMedicoId, isMedicoOnly, isLoading: loadingCurrentMedico, error: currentMedicoError, refetch: refetchCurrentMedico } = useCurrentMedico();
  const [date, setDate] = useState(() => normalizeAgendaDate(isValidAgendaDate(dataDaRota) ? dataDaRota : lerPreferenciaAgenda('agenda:date')));
  const activeDate = isValidAgendaDate(dataDaRota) ? dataDaRota : date;
  useEffect(() => {
    if (isValidAgendaDate(dataDaRota)) setDate(dataDaRota);
  }, [dataDaRota]);
  const [view, setView] = useState<AgendaView>(() => {
    if (isAgendaView(viewDaRota)) return viewDaRota;
    const preferencia = lerPreferenciaAgenda('agenda:view');
    return VIEWS_AGENDA.includes(preferencia as AgendaView) ? preferencia as AgendaView : 'daily';
  });
  const activeView: AgendaView = viewDaRotaValida ? viewDaRota : view;
  const { defaultView, setDefaultView, loaded: defaultViewLoaded } = useAgendaDefaultView();
  const [viewTouched, setViewTouched] = useState(() => viewDaRotaValida || VIEWS_AGENDA.includes(lerPreferenciaAgenda('agenda:view') as AgendaView));
  useEffect(() => {
    if (viewDaRotaValida) {
      if (view !== viewDaRota) setView(viewDaRota);
      if (!viewTouched) setViewTouched(true);
      return;
    }
    if (defaultViewLoaded && defaultView && !viewTouched && view !== defaultView) setView(defaultView);
  }, [defaultViewLoaded, defaultView, viewTouched, viewDaRotaValida, viewDaRota, view]);

  const updateAgendaContext = useCallback((context: { date?: string; view?: AgendaView }) => {
    const nextDate = context.date ? normalizeAgendaDate(context.date) : undefined;
    if (nextDate) setDate(nextDate);
    if (context.view) {
      setViewTouched(true);
      setView(context.view);
    }
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      if (nextDate) {
        next.set('data', nextDate);
        next.delete('agendamento');
      }
      if (context.view) next.set('view', context.view);
      return next.toString() === current.toString() ? current : next;
    });
  }, [setSearchParams]);
  const handleDateChange = useCallback((nextDate: string) => updateAgendaContext({ date: nextDate }), [updateAgendaContext]);
  const handleViewChange = useCallback((nextView: AgendaView) => updateAgendaContext({ view: nextView }), [updateAgendaContext]);
  const handleDayClick = useCallback((nextDate: string) => updateAgendaContext({ date: nextDate, view: 'daily' }), [updateAgendaContext]);

  // Date and view are safe to keep in a link; patient search text remains in local state.
  useEffect(() => {
    if (!defaultViewLoaded) return;
    // Browser back/forward must win over the previous in-memory date. Wait for
    // the URL-to-state effect above before normalizing the route back to state.
    if (isValidAgendaDate(dataDaRota) && date !== dataDaRota) return;
    if (viewDaRotaValida && view !== viewDaRota) return;
    if (!viewDaRotaValida && !viewTouched && defaultView && view !== defaultView) return;
    const normalized = new URLSearchParams(searchParams);
    if (!isValidAgendaDate(dataDaRota) || dataDaRota !== date) normalized.set('data', date);
    if (!viewDaRotaValida || viewDaRota !== view) normalized.set('view', view);
    if (normalized.toString() !== searchParams.toString()) {
      setSearchParams(normalized, { replace: true });
    }
  }, [defaultViewLoaded, defaultView, viewTouched, viewDaRotaValida, viewDaRota, view, dataDaRota, date, searchParams, setSearchParams]);

  useEffect(() => { salvarPreferenciaAgenda('agenda:date', activeDate); }, [activeDate]);
  useEffect(() => { salvarPreferenciaAgenda('agenda:view', activeView); }, [activeView]);
  const [search, setSearch] = useState<string>(() => location.state?.agendaFilters?.search || '');
  const [statusFilter, setStatusFilter] = useState<string[]>(() => location.state?.agendaFilters?.status || []);
  const [medicoFilter, setMedicoFilter] = useState<string[]>(() => location.state?.agendaFilters?.medicos || []);
  const [waitingOpen, setWaitingOpen] = useState(true);
  const [dialogState, setDialogState] = useState<{ open: boolean; initial: any | null }>({ open: false, initial: null });
  const openingAppointment = useRef(false);
  useEffect(() => {
    if (!dialogState.open || openingAppointment.current) return;
    openingAppointment.current = true;
    const query = new URLSearchParams(searchParams);
    for (const key of ['agendamento', 'reagendar', 'espera', 'paciente']) query.delete(key);
    query.set('data', activeDate);
    query.set('view', activeView);
    const initial = dialogState.initial;
    const agendaFilters = { search, status: statusFilter, medicos: medicoFilter };
    // Keep filters on the originating history entry as well as the return action.
    navigate(`/agenda?${query}`, { replace: true, state: { agendaFilters } });
    navigate(initial?.id ? `/agenda/${initial.id}/editar` : `/agenda/nova?data=${initial?.data || activeDate}`, {
      state: {
        initial: initial?.id ? undefined : initial,
        returnTo: `/agenda?${query}`,
        agendaFilters,
      },
    });
  }, [dialogState, searchParams, activeDate, activeView, search, statusFilter, medicoFilter, navigate]);
  const [activeDrag, setActiveDrag] = useState<any>(null);
  const [moveForaExpediente, setMoveForaExpediente] = useState<{ agendamento: any; slot: any; faixa: string } | null>(null);

  // Keyboard shortcuts: ← → navigate, T = today, N = new, D/W/M = view
  // Atualizado a cada render com abrirNovaConsulta (definida após as consultas
  // de apoio), para o atalho "n" respeitar o bloqueio por falta de dados.
  const abrirNovaConsultaRef = useRef<(initial: any) => void>(() => {});
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (e.target as HTMLElement)?.isContentEditable) return;
      if (['checkbox', 'switch', 'combobox', 'menuitem'].includes((e.target as HTMLElement)?.getAttribute?.('role') || '')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Com um modal ou menu aberto, as setas e letras pertencem a ele, não à agenda atrás.
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [data-state="open"][role="listbox"]')) return;
      const d = parseISO(activeDate);
      const step = activeView === 'monthly' ? addMonths : activeView === 'weekly' ? addWeeks : addDays;
      if (e.key === 'ArrowLeft') { handleDateChange(format(step(d, -1), 'yyyy-MM-dd')); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { handleDateChange(format(step(d, 1), 'yyyy-MM-dd')); e.preventDefault(); }
      else if (e.key.toLowerCase() === 't') { handleDateChange(todaySaoPauloDateOnly()); }
      else if (e.key.toLowerCase() === 'n') { abrirNovaConsultaRef.current({ data: activeDate }); e.preventDefault(); }
      else if (e.key.toLowerCase() === 'd') handleViewChange('daily');
      else if (e.key.toLowerCase() === 'w') handleViewChange('weekly');
      else if (e.key.toLowerCase() === 'm') handleViewChange('monthly');
      else if (e.key === '/') { setSearch(''); (document.querySelector('input[placeholder*="Buscar paciente"]') as HTMLInputElement)?.focus(); e.preventDefault(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeDate, activeView, searchString, setSearchParams, updateAgendaContext, handleDateChange, handleViewChange]);

  // Só o período que a visão mostra. Antes a agenda baixava o histórico
  // inteiro da clínica (com paciente e médico de cada consulta) a cada abertura.
  const periodo = useMemo(() => {
    const d = parseISO(activeDate);
    if (activeView === 'daily') return { inicio: activeDate, fim: activeDate };
    if (activeView === 'weekly') {
      const ini = startOfWeek(d, { weekStartsOn: 1 });
      return { inicio: format(ini, 'yyyy-MM-dd'), fim: format(addDays(ini, 6), 'yyyy-MM-dd') };
    }
    // Mesma grade de 6 semanas que a MonthlyView desenha.
    const ini = startOfWeek(startOfMonth(d), { weekStartsOn: 1 });
    return { inicio: format(ini, 'yyyy-MM-dd'), fim: format(addDays(ini, 41), 'yyyy-MM-dd') };
  }, [activeDate, activeView]);
  const agendaQuery = useAgendamentosPeriodo(periodo.inicio, periodo.fim, { enabled: !isMedicoOnly || !!myMedicoId, resumoPaciente: true });
  const { data: allAppts = [], isLoading } = agendaQuery;
  const medicosQuery = useMedicos();
  const { data: medicos = [] } = medicosQuery;

  // Isolamento por profissional: um médico só vê a própria agenda; admin/recepção veem todos.
  // Isso corrige o vazamento em que pacientes de um médico apareciam na agenda de outro
  // (principalmente nas visões Semana e Mês, que mostravam todos os médicos misturados).
  useEffect(() => {
    if (isMedicoOnly && myMedicoId && !medicoFilter.includes(myMedicoId)) {
      setMedicoFilter([myMedicoId]);
    }
  }, [isMedicoOnly, myMedicoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const medicoById = useMemo(() => {
    const map: Record<string, any> = {};
    for (const m of medicos as any[]) map[m.id] = m;
    return map;
  }, [medicos]);

  const bloqueiosQuery = useSupabaseQuery<any>('bloqueios_agenda', {
    orderBy: { column: 'data_inicio', ascending: true },
    filters: [
      { column: 'data_fim', operator: 'gte', value: periodo.inicio },
      { column: 'data_inicio', operator: 'lte', value: periodo.fim },
    ],
  });
  const { data: bloqueios = [] } = bloqueiosQuery;
  // Notificados e confirmados também esperam vaga; a ordem segue a prioridade.
  const waitingQuery = useSupabaseQuery<any>('lista_espera', {
    select: '*, pacientes(nome, nome_social, telefone)',
    filters: [{ column: 'status', operator: 'in', value: `(${STATUS_ATIVOS_LISTA_ESPERA.join(',')})` }],
    orderBy: { column: 'created_at', ascending: true },
  });
  const waiting = useMemo(() => {
    const itens = (waitingQuery.data ?? []) as any[];
    // O médico vê os pedidos dele e os que aceitam qualquer profissional.
    const doEscopo = isMedicoOnly
      ? itens.filter(item => !item.medico_id || item.medico_id === myMedicoId)
      : itens;
    return [...doEscopo].sort(compararPorPrioridade);
  }, [waitingQuery.data, isMedicoOnly, myMedicoId]);
  const conveniosQuery = useSupabaseQuery<any>('convenios', { orderBy: { column: 'nome', ascending: true } });
  const tiposQuery = useSupabaseQuery<any>('tipos_consulta', { orderBy: { column: 'nome', ascending: true } });
  const salasQuery = useSupabaseQuery<any>('salas', { orderBy: { column: 'nome', ascending: true } });
  // Convênios, tipos e salas só servem ao formulário de consulta: se falharem,
  // a agenda continua visível e apenas "Nova consulta" fica bloqueada.
  const falhasDadosApoio = [
    conveniosQuery.isError && 'convênios',
    tiposQuery.isError && 'tipos de consulta',
    salasQuery.isError && 'salas',
  ].filter((item): item is string => Boolean(item));
  const novaConsultaBloqueada = falhasDadosApoio.length > 0;
  const recarregarDadosApoio = () => {
    if (conveniosQuery.isError) void conveniosQuery.refetch();
    if (tiposQuery.isError) void tiposQuery.refetch();
    if (salasQuery.isError) void salasQuery.refetch();
  };
  const abrirNovaConsulta = (initial: any) => {
    if (novaConsultaBloqueada) {
      toast.error('Nova consulta indisponível no momento', { description: `Não foi possível carregar ${falhasDadosApoio.join(', ')}. Tente recarregar os dados.` });
      return;
    }
    setDialogState({ open: true, initial });
  };
  abrirNovaConsultaRef.current = abrirNovaConsulta;
  const { data: convenios = [] } = conveniosQuery;
  const { data: tipos = [] } = tiposQuery;
  const { data: salas = [] } = salasQuery;
  const reagendamentoQuery = useQuery({
    queryKey: ['agenda-reagendar', profile?.clinica_id, reagendarIdDaRota],
    enabled: !!profile?.clinica_id && !!reagendarIdDaRota,
    queryFn: async () => {
      const { data, error } = await supabase.from('agendamentos')
        .select('id, paciente_id, medico_id, sala_id, hora_inicio, hora_fim, tipo, observacoes')
        .eq('id', reagendarIdDaRota)
        .eq('clinica_id', profile!.clinica_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const reagendamentoLoading = reagendamentoQuery.isLoading;
  const reagendamentoError = reagendamentoQuery.isError;
  const reagendamentoData = reagendamentoQuery.data;
  const refetchReagendamento = reagendamentoQuery.refetch;

  useEffect(() => {
    if (!reagendarIdDaRota) {
      reagendarAplicadoRef.current = null;
      return;
    }
    if (!profile?.clinica_id || reagendamentoLoading || reagendarAplicadoRef.current === reagendarIdDaRota) return;
    if (reagendamentoError) {
      reagendarAplicadoRef.current = reagendarIdDaRota;
      toast.error('Não foi possível carregar o atendimento para reagendar.', {
        description: 'Tente novamente ou abra a Agenda e crie a consulta manualmente.',
        action: {
          label: 'Tentar de novo',
          onClick: () => {
            reagendarAplicadoRef.current = null;
            void refetchReagendamento();
          },
        },
      });
      return;
    }
    const origem = reagendamentoData;
    if (!origem) {
      toast.error('O atendimento original não foi encontrado nesta clínica.');
      setSearchParams(current => {
        const params = new URLSearchParams(current);
        params.delete('reagendar');
        return params;
      }, { replace: true });
      return;
    }

    const novaData = format(addDays(parseISO(todaySaoPauloDateOnly()), 1), 'yyyy-MM-dd');
    reagendarAplicadoRef.current = reagendarIdDaRota;
    updateAgendaContext({ date: novaData, view: 'daily' });
    setDialogState({
      open: true,
      initial: {
        paciente_id: origem.paciente_id,
        medico_id: origem.medico_id || '',
        sala_id: origem.sala_id || '',
        data: novaData,
        hora_inicio: origem.hora_inicio?.slice(0, 5) || '09:00',
        hora_fim: origem.hora_fim?.slice(0, 5) || '',
        tipo: origem.tipo || 'consulta',
        status: 'agendado',
        observacoes: ['exame', 'exames'].includes(String(origem.tipo || '').toLocaleLowerCase('pt-BR'))
          ? origem.observacoes || ''
          : '',
      },
    });
    toast.info('Reagendamento preparado', { description: 'Revise a data e o horário antes de salvar.' });
    setSearchParams(current => {
      const params = new URLSearchParams(current);
      params.delete('reagendar');
      return params;
    }, { replace: true });
  }, [reagendarIdDaRota, profile?.clinica_id, reagendamentoLoading, reagendamentoError, reagendamentoData, refetchReagendamento, setSearchParams, updateAgendaContext]);

  // Abre a consulta indicada pela notificação quando ela aparece no período carregado.
  useEffect(() => {
    if (!agendamentoIdDaRota || isLoading || (isValidAgendaDate(dataDaRota) && activeDate !== dataDaRota)) return;
    const alvo = (allAppts as any[]).find((a) => a.id === agendamentoIdDaRota);
    if (alvo) setDialogState({ open: true, initial: alvo });
    else toast.info('A consulta da notificação não está mais nesta data.', { description: 'Ela pode ter sido remarcada ou cancelada.' });
    setSearchParams(current => {
      const params = new URLSearchParams(current);
      params.delete('agendamento');
      return params;
    }, { replace: true });
  }, [agendamentoIdDaRota, dataDaRota, activeDate, isLoading, allAppts, setSearchParams]);

  // A lista de espera abre esta rota para criar a consulta. Valide o vínculo e
  // o estado no servidor antes de carregar o paciente no formulário.
  useEffect(() => {
    if (!esperaIdDaRota || !pacienteIdDaRota || !profile?.clinica_id) return;
    let active = true;
    const abrirAgendamentoDaLista = async () => {
      const { data, error } = await supabase.from('lista_espera')
        .select('id, paciente_id, medico_id, motivo, status')
        .eq('id', esperaIdDaRota)
        .eq('clinica_id', profile.clinica_id)
        .maybeSingle();
      if (!active) return;

      setSearchParams(current => {
        const params = new URLSearchParams(current);
        params.delete('espera');
        params.delete('paciente');
        return params;
      }, { replace: true });

      // Qualquer pedido ativo pode ser agendado direto; antes exigia registrar
      // contato e confirmar (três cliques) para chegar aqui.
      if (error || !data || data.paciente_id !== pacienteIdDaRota || !(STATUS_ATIVOS_LISTA_ESPERA as readonly string[]).includes(data.status || 'aguardando')) {
        toast.error('Não foi possível iniciar o agendamento', {
          description: error?.message || 'Confirme se o paciente ainda está na lista de espera.',
        });
        return;
      }

      // Sugere a próxima vaga real do médico pedido; sem médico ou sem
      // expediente cadastrado, mantém o padrão de hoje às 09:00.
      const hoje = todaySaoPauloDateOnly();
      let sugestao: { data: string; hora_inicio: string } | null = null;
      if (data.medico_id) {
        try {
          const ate = new Date(`${hoje}T12:00:00Z`);
          ate.setUTCDate(ate.getUTCDate() + 13);
          const fim = ate.toISOString().slice(0, 10);
          const [jornada, ocupacao, bloqueios] = await Promise.all([
            (supabase.from('medico_disponibilidade' as any).select('dia_semana, hora_inicio, hora_fim')
              .eq('medico_id', data.medico_id).eq('ativo', true) as any),
            supabase.from('agendamentos').select('data, hora_inicio, hora_fim, status')
              .eq('clinica_id', profile.clinica_id).eq('medico_id', data.medico_id).gte('data', hoje).lte('data', fim),
            (supabase.from('bloqueios_agenda' as any).select('data_inicio, data_fim, hora_inicio, hora_fim, dia_inteiro')
              .eq('medico_id', data.medico_id).lte('data_inicio', fim).gte('data_fim', hoje) as any),
          ]);
          if (!jornada.error && !ocupacao.error && !bloqueios.error) {
            const medico = (medicos as any[]).find(m => m.id === data.medico_id);
            sugestao = proximaVagaLivre({
              hoje,
              agoraMinutos: minutosAgoraSaoPaulo(),
              duracaoMinutos: Number(medico?.intervalo_consulta) || 30,
              jornada: jornada.data ?? [],
              agendamentos: ocupacao.data ?? [],
              bloqueios: bloqueios.data ?? [],
            });
          }
        } catch {
          sugestao = null;
        }
        if (!active) return;
      }

      setDialogState({
        open: true,
        initial: {
          paciente_id: data.paciente_id,
          medico_id: data.medico_id || '',
          data: sugestao?.data ?? hoje,
          hora_inicio: sugestao?.hora_inicio ?? '09:00',
          observacoes: data.motivo || '',
          tipo: 'consulta',
          status: 'agendado',
          _waiting_id: data.id,
          _waiting_status: data.status || 'aguardando',
        },
      });
    };
    void abrirAgendamentoDaLista();
    return () => { active = false; };
  }, [esperaIdDaRota, pacienteIdDaRota, profile?.clinica_id, setSearchParams]);

  const { scheme, colorFor } = useAgendaColorScheme();

  const STATUS_CONHECIDOS = useMemo(() => new Set([
    'agendado', 'confirmado', 'aguardando', 'aguardando_triagem', 'em_triagem', 'fila_atendimento', 'em_atendimento',
    'finalizado', 'atendimento_finalizado', 'aguardando_pagamento', 'aguardando_pagamento_adicional', 'pago', 'cancelado', 'faltou',
  ]), []);

  const legend = useMemo(() => {
    // O esquema salvo guarda chaves de todos os critérios juntas (os status
    // padrão são sempre mesclados). A legenda só mostra as do critério ativo.
    const rotulo = (chave: string): string | null => {
      switch (scheme.criterion) {
        case 'status': return STATUS_CONHECIDOS.has(chave) ? formatAppointmentStatus(chave) : null;
        case 'medico': return medicoById[chave] ? nomeMedico(medicoById[chave].nome || medicoById[chave].crm) : null;
        case 'convenio': return chave === 'particular' ? 'Particular' : (convenios as any[]).find(c => c.id === chave)?.nome ?? null;
        case 'tipo': return TIPOS_FIXOS_CONSULTA.find(([valor]) => valor === chave)?.[1]
          ?? (tipos as any[]).find(t => t.id === chave || t.nome === chave)?.nome ?? null;
      }
    };
    return Object.entries(scheme.map)
      .map(([chave, color]) => ({ label: rotulo(chave), color }))
      .filter((item): item is { label: string; color: string } => !!item.label)
      .filter((item, index, items) => items.findIndex(other => other.label === item.label && other.color === item.color) === index)
      .slice(0, 10);
  }, [scheme, medicoById, convenios, tipos, STATUS_CONHECIDOS]);

  // A política de acesso continua sendo a autoridade final, mas o médico
  // não deve sequer receber uma primeira renderização com a agenda de toda a
  // clínica enquanto o useEffect sincroniza o filtro visual.
  const allowedMedicoId = isMedicoOnly ? myMedicoId : null;

  // Base visível: escopo do profissional + filtro de médicos + busca. O filtro
  // de status entra só em `filtered`, para que totais, "próximo" e vaga livre
  // continuem refletindo a ocupação real do dia.
  const baseVisivel = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allAppts.filter((a: any) => {
      if (isMedicoOnly && !allowedMedicoId) return false;
      if (allowedMedicoId && a.medico_id !== allowedMedicoId) return false;
      if (medicoFilter.length && !medicoFilter.includes(a.medico_id)) return false;
      if (q) {
        // O CPF é gravado com máscara: concatenar e comparar com o termo cru
        // fazia "12345678900" não achar "123.456.789-00".
        if (!a.pacientes || !pacienteCorresponde(a.pacientes, q)) return false;
      }
      return true;
    });
  }, [allAppts, medicoFilter, search, isMedicoOnly, allowedMedicoId]);

  const [onlineFilter, setOnlineFilter] = useState(false);
  const filtered = useMemo(() => baseVisivel.filter((a: any) => {
    if (statusFilter.length && !statusFilter.includes(a.status)) return false;
    if (onlineFilter && !pendenteOnline(a)) return false;
    return true;
  }), [baseVisivel, statusFilter, onlineFilter]);

  const visibleMedicos = useMemo(
    () => isMedicoOnly && myMedicoId ? medicos.filter((m: any) => m.id === myMedicoId) : medicos,
    [medicos, isMedicoOnly, myMedicoId],
  );

  const medicosEmExibicao = useMemo(
    () => medicoFilter.length ? medicoFilter : visibleMedicos.map((m: any) => m.id as string),
    [medicoFilter, visibleMedicos],
  );

  const dayAppts = useMemo(() => filtered.filter((a: any) => a.data === activeDate), [filtered, activeDate]);
  const dayApptsBase = useMemo(() => baseVisivel.filter((a: any) => a.data === activeDate), [baseVisivel, activeDate]);

  // Os totais acompanham a visão: dia, semana inteira ou só os dias do mês
  // (a grade mensal carrega semanas vizinhas, que não entram na conta).
  const periodoTotais = useMemo(() => {
    if (activeView === 'daily') return { inicio: activeDate, fim: activeDate, rotulo: 'no dia' };
    if (activeView === 'weekly') return { inicio: periodo.inicio, fim: periodo.fim, rotulo: 'na semana' };
    const d = parseISO(activeDate);
    return { inicio: format(startOfMonth(d), 'yyyy-MM-dd'), fim: format(endOfMonth(d), 'yyyy-MM-dd'), rotulo: 'no mês' };
  }, [activeView, activeDate, periodo]);
  const totals = useMemo(
    () => contarTotaisAgenda(baseVisivel.filter((a: any) => a.data >= periodoTotais.inicio && a.data <= periodoTotais.fim)),
    [baseVisivel, periodoTotais],
  );

  // Dias com consulta no mês exibido (grade de 6 semanas), só para marcar o
  // mini‑calendário — carrega apenas data e status.
  const gradeMes = useMemo(() => {
    const ini = startOfWeek(startOfMonth(parseISO(activeDate)), { weekStartsOn: 1 });
    return { inicio: format(ini, 'yyyy-MM-dd'), fim: format(addDays(ini, 41), 'yyyy-MM-dd') };
  }, [activeDate]);
  const diasQuery = useSupabaseQuery<{ id: string; data: string; status: string; medico_id: string }>('agendamentos', {
    select: 'id, data, status, medico_id',
    filters: [
      { column: 'data', operator: 'gte', value: gradeMes.inicio },
      { column: 'data', operator: 'lte', value: gradeMes.fim },
    ],
    staleTime: 60_000,
  });
  const diasComConsulta = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const a of diasQuery.data ?? []) {
      if (a.status === 'cancelado' || a.status === 'faltou') continue;
      if (allowedMedicoId && a.medico_id !== allowedMedicoId) continue;
      mapa[a.data] = (mapa[a.data] ?? 0) + 1;
    }
    return mapa;
  }, [diasQuery.data, allowedMedicoId]);

  // Expediente de cada profissional no dia da semana exibido, para a barra de
  // ocupação do cabeçalho da visão diária.
  const diaSemana = new Date(`${activeDate}T12:00:00Z`).getUTCDay();
  const idsMedicosVisiveis = useMemo(() => visibleMedicos.map((m: any) => m.id).sort(), [visibleMedicos]);
  const expedienteQuery = useQuery({
    queryKey: ['agenda-expediente', profile?.clinica_id, diaSemana, idsMedicosVisiveis],
    enabled: !!profile?.clinica_id && idsMedicosVisiveis.length > 0 && activeView === 'daily',
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.from('medico_disponibilidade' as any)
        .select('medico_id, hora_inicio, hora_fim')
        .in('medico_id', idsMedicosVisiveis)
        .eq('dia_semana', diaSemana)
        .eq('ativo', true) as any);
      if (error) throw error;
      const minutos: Record<string, number> = {};
      const faixas: Record<string, Faixa[]> = {};
      for (const j of (data as any[]) ?? []) {
        const ini = toMinutes(String(j.hora_inicio).slice(0, 5));
        const fim = toMinutes(String(j.hora_fim).slice(0, 5));
        if (Number.isFinite(ini) && Number.isFinite(fim) && fim > ini) {
          minutos[j.medico_id] = (minutos[j.medico_id] ?? 0) + (fim - ini);
          faixas[j.medico_id] = [...(faixas[j.medico_id] ?? []), [ini, fim] as const].sort((a, b) => a[0] - b[0]);
        }
      }
      return { minutos, faixas };
    },
  });
  const expedientePorMedico = expedienteQuery.data?.minutos ?? {};
  // Sem a consulta (carregando ou com erro), a vaga livre volta à grade inteira.
  const faixasPorMedico = expedienteQuery.isSuccess ? expedienteQuery.data.faixas : undefined;

  const proximaDoDia = useMemo(() => {
    if (activeDate !== todaySaoPauloDateOnly()) return null;
    const agora = new Date();
    const partes = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(agora);
    const nowMin = Number(partes.find(p => p.type === 'hour')?.value ?? 0) * 60 + Number(partes.find(p => p.type === 'minute')?.value ?? 0);
    return [...dayApptsBase]
      .filter((a: any) => !['cancelado', 'faltou'].includes(a.status))
      .sort((a: any, b: any) => a.hora_inicio.localeCompare(b.hora_inicio))
      .find((a: any) => toMinutes(a.hora_inicio.slice(0, 5)) >= nowMin) ?? null;
  }, [dayApptsBase, activeDate]);

  const irParaProxima = () => {
    if (!proximaDoDia) { toast.info('Não há mais consultas hoje.'); return; }
    const el = document.querySelector<HTMLElement>(`[data-agendamento-id="${proximaDoDia.id}"]`);
    if (!el) { toast.info('A próxima consulta está fora desta visão.', { description: 'Limpe os filtros para vê-la.' }); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  };

  const sensors = useSensors(
    // Enter fica livre para abrir a consulta; Espaço pega e solta o card.
    useSensor(KeyboardSensor, {
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const anunciosArraste = useMemo(() => criarAnunciosAgenda(medicoById), [medicoById]);

  const handleDragStart = (e: DragStartEvent) => setActiveDrag(e.active.data.current);

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveDrag(null);
    const over = e.over;
    if (!over) return;
    const active = e.active.data.current as any;
    let slotData = over.data.current as any;
    // Na visão semanal a coluna é o dia: a consulta mantém médico e horário.
    if (slotData?.semana) {
      if (!active?.agendamento) return;
      slotData = {
        medico_id: active.agendamento.medico_id,
        data: slotData.data,
        hora_inicio: String(active.agendamento.hora_inicio).slice(0, 5),
      };
    }
    if (!slotData?.medico_id) return;


    if (active?.waiting) {
      const w = active.waiting;
      const draft = prepareWaitingListAppointment(w, slotData, medicos as any[]);
      if (draft.error || !draft.appointment) {
        toast.error('Esta vaga não corresponde ao pedido da lista de espera.', { description: draft.error });
        return;
      }
      setDialogState({
        open: true,
        initial: draft.appointment,
      });
      return;
    }

    if (active?.agendamento) {
      const ag = active.agendamento;
      if (!podeRemarcarAgendamento(ag.status)) return;
      if (ag.medico_id === slotData.medico_id && ag.data === slotData.data && ag.hora_inicio.slice(0, 5) === slotData.hora_inicio) return;

      // Conflito real por sobreposição de janela (não apenas "menos de 30 min de distância")
      const oldStart = toMinutes(ag.hora_inicio?.slice(0, 5));
      const storedEnd = ag.hora_fim ? toMinutes(ag.hora_fim.slice(0, 5)) : null;
      if (!Number.isFinite(oldStart) || (ag.hora_fim && !Number.isFinite(storedEnd)) || (storedEnd !== null && storedEnd <= oldStart)) {
        toast.error('A consulta tem um horário inválido e não pode ser remarcada.');
        return;
      }
      const oldDur = storedEnd === null ? 30 : storedEnd - oldStart;
      const newStart = toMinutes(slotData.hora_inicio);
      const newEnd = newStart + oldDur;
      if (!Number.isFinite(newStart) || newStart < 0 || newStart >= 24 * 60 || newEnd >= 24 * 60) {
        toast.error('A consulta precisa terminar no mesmo dia.', { description: 'Escolha um horário que permita concluir o atendimento antes da meia-noite.' });
        return;
      }

      // Bloqueio de agenda cobre o novo horário?
      const blocked = (bloqueios as any[]).find((b: any) =>
        b.medico_id === slotData.medico_id &&
        slotData.data >= b.data_inicio && slotData.data <= b.data_fim &&
        (b.dia_inteiro || (
          b.hora_inicio && b.hora_fim &&
          toMinutes(b.hora_inicio.slice(0, 5)) < newEnd &&
          toMinutes(b.hora_fim.slice(0, 5)) > newStart
        ))
      );
      if (blocked) {
        toast.error('Horário bloqueado', { description: blocked.motivo || blocked.tipo || 'Este período está bloqueado para o médico.' });
        return;
      }

      const conflict = allAppts.find((a: any) => {
        if (a.id === ag.id) return false;
        if (a.status === 'cancelado' || a.status === 'faltou') return false;
        if (a.medico_id !== slotData.medico_id || a.data !== slotData.data) return false;
        const ini = toMinutes(a.hora_inicio.slice(0, 5));
        const fim = a.hora_fim ? toMinutes(a.hora_fim.slice(0, 5)) : ini + 30;
        return ini < newEnd && fim > newStart;
      });
      if (conflict) {
        toast.error('Horário indisponível', {
          description: 'Este médico já tem outra consulta nesse período. Escolha um horário livre.',
        });
        return;
      }
      const conflitoPaciente = allAppts.find((a: any) => {
        if (a.id === ag.id || a.status === 'cancelado' || a.status === 'faltou') return false;
        if (a.paciente_id !== ag.paciente_id || a.data !== slotData.data) return false;
        const inicio = toMinutes(a.hora_inicio?.slice(0, 5));
        const fim = a.hora_fim ? toMinutes(a.hora_fim.slice(0, 5)) : inicio + 30;
        return Number.isFinite(inicio) && Number.isFinite(fim) && inicio < newEnd && fim > newStart;
      });
      if (conflitoPaciente) {
        toast.error('Este paciente já tem outro atendimento neste horário.');
        return;
      }
      const conflitoSala = ag.sala_id && allAppts.find((a: any) => {
        if (a.id === ag.id || a.status === 'cancelado' || a.status === 'faltou') return false;
        if (a.sala_id !== ag.sala_id || a.data !== slotData.data) return false;
        const inicio = toMinutes(a.hora_inicio?.slice(0, 5));
        const fim = a.hora_fim ? toMinutes(a.hora_fim.slice(0, 5)) : inicio + 30;
        return Number.isFinite(inicio) && Number.isFinite(fim) && inicio < newEnd && fim > newStart;
      });
      if (conflitoSala) {
        toast.error('Esta sala já está reservada neste horário.', { description: 'Escolha outro horário.' });
        return;
      }

      const diaSemana = new Date(`${slotData.data}T12:00:00Z`).getUTCDay();
      const { data: jornada, error: erroJornada } = await (supabase.from('medico_disponibilidade' as any)
        .select('hora_inicio, hora_fim')
        .eq('medico_id', slotData.medico_id)
        .eq('dia_semana', diaSemana)
        .eq('ativo', true) as any);
      if (erroJornada) {
        toast.error('Não foi possível conferir o expediente do médico.', {
          description: `${erroJornada.message}. Tente novamente antes de mover a consulta.`,
        });
        return;
      }
      const dentroDoExpediente = ((jornada as any[]) || []).some(j => {
        const inicio = toMinutes(j.hora_inicio);
        const fim = toMinutes(j.hora_fim);
        return Number.isFinite(inicio) && Number.isFinite(fim) && newStart >= inicio && newEnd <= fim;
      });
      if (!dentroDoExpediente) {
        const faixa = ((jornada as any[]) || [])
          .map(j => `${String(j.hora_inicio).slice(0, 5)}–${String(j.hora_fim).slice(0, 5)}`)
          .join(', ');
        setMoveForaExpediente({ agendamento: ag, slot: slotData, faixa });
        return;
      }
      await doMove(ag, slotData);
    }
  };

  const doMove = async (ag: any, slot: { medico_id: string; data: string; hora_inicio: string }, opcoes: { desfazendo?: boolean } = {}) => {
    if (!podeRemarcarAgendamento(ag.status)) {
      toast.error('Esta consulta não pode ser remarcada depois que o atendimento começou ou terminou.');
      return;
    }
    const oldStart = toMinutes(ag.hora_inicio?.slice(0, 5));
    const storedEnd = ag.hora_fim ? toMinutes(ag.hora_fim.slice(0, 5)) : null;
    if (!Number.isFinite(oldStart) || (ag.hora_fim && !Number.isFinite(storedEnd)) || (storedEnd !== null && storedEnd <= oldStart)) {
      toast.error('A consulta tem um horário inválido e não pode ser remarcada.');
      return;
    }
    const oldEnd = storedEnd === null ? 30 : storedEnd - oldStart;
    const newStart = toMinutes(slot.hora_inicio);
    const newEnd = newStart + oldEnd;
    if (!Number.isFinite(newStart) || newStart < 0 || newStart >= 24 * 60 || newEnd >= 24 * 60) {
      toast.error('A consulta precisa terminar no mesmo dia.', { description: 'Escolha um horário que permita concluir o atendimento antes da meia-noite.' });
      return;
    }
    const hh = (n: number) => `${Math.floor(n / 60).toString().padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}:00`;
    try {
      if (!profile?.clinica_id) {
        toast.error('Não foi possível identificar a clínica para remarcar esta consulta. Atualize a sessão e tente novamente.');
        return;
      }
      let updateQuery = supabase.from('agendamentos').update({
        medico_id: slot.medico_id,
        data: slot.data,
        hora_inicio: hh(newStart),
        hora_fim: hh(newEnd),
      }).eq('id', ag.id).eq('clinica_id', profile.clinica_id);
      updateQuery = ag.updated_at
        ? updateQuery.eq('updated_at', ag.updated_at)
        : updateQuery.is('updated_at', null);
      const { data, error } = await (updateQuery.select('id, updated_at').maybeSingle() as any);
      if (error) {
        const conflitoDeRecurso = String(error.message || '').includes('AGENDA_RECURSO_CONFLITO');
        const overlap = error.code === '23P01' || String(error.message || '').includes('agendamentos_sem_sobreposicao');
        if (conflitoDeRecurso) {
          toast.error('Paciente ou sala acabaram de ser ocupados', {
            description: 'Outro usuário marcou neste período enquanto você movia a consulta. Atualize a agenda e escolha outro horário.',
          });
          void queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
        } else if (overlap) {
          toast.error('Horário indisponível', { description: 'Outra consulta deste médico se sobrepõe a este período.' });
          void queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
        } else {
          toast.error('Erro ao mover consulta', { description: error.message });
        }
      } else if (!data) {
        toast.error('A consulta não foi remarcada.', { description: 'Ela pode ter sido alterada ou removida por outro usuário. Atualize a agenda.' });
        void queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      } else {
        void queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
        if (opcoes.desfazendo) {
          toast.success('Remarcação desfeita');
        } else {
          const movida = { ...ag, medico_id: slot.medico_id, data: slot.data, hora_inicio: hh(newStart), hora_fim: hh(newEnd), updated_at: data.updated_at };
          const origem = { medico_id: ag.medico_id, data: ag.data, hora_inicio: String(ag.hora_inicio).slice(0, 5) };
          toast.success('Consulta remarcada', {
            description: `${slot.data.split('-').reverse().join('/')} às ${slot.hora_inicio}`,
            action: { label: 'Desfazer', onClick: () => { void doMove(movida, origem, { desfazendo: true }); } },
            duration: 8000,
          });
        }
      }
    } catch (error) {
      toast.error('Não foi possível remarcar a consulta.', { description: error instanceof Error ? error.message : 'Verifique sua conexão e tente novamente.' });
    }
  };

  const handleSlotClick = (medico_id: string, hora_inicio: string) => {
    abrirNovaConsulta({ medico_id, data: activeDate, hora_inicio, status: 'agendado', tipo: 'consulta' });
  };

  // Remarcar de verdade: abre uma nova consulta com os dados da original, que é
  // cancelada (com motivo) só depois que a nova for salva.
  const remarcarConsulta = (ag: any) => abrirNovaConsulta({
    paciente_id: ag.paciente_id,
    medico_id: ag.medico_id || '',
    sala_id: ag.sala_id || '',
    data: ag.data,
    hora_inicio: String(ag.hora_inicio || '').slice(0, 5),
    tipo: ag.tipo || 'consulta',
    status: 'agendado',
    observacoes: ag.observacoes || '',
    convenio_id: ag.convenio_id || '',
    _remarcar_id: ag.id,
    _remarcar_updated_at: ag.updated_at ?? null,
    _remarcar_resumo: `${String(ag.data).split('-').reverse().join('/')} às ${String(ag.hora_inicio || '').slice(0, 5)}`,
  });

  const medicosDoDia = medicoFilter.length ? visibleMedicos.filter((m: any) => medicoFilter.includes(m.id)) : visibleMedicos;
  const bloqueiosDoDia = (bloqueios as any[]).filter((b: any) =>
    activeDate >= b.data_inicio && activeDate <= b.data_fim && medicosDoDia.some((m: any) => m.id === b.medico_id));
  // Próxima vaga de cada profissional, para a lista do celular (onde a grade não aparece).
  const vagasLivresDoDia = activeDate < todaySaoPauloDateOnly() ? [] : medicosDoDia
    .filter((m: any) => m.ativo !== false)
    .map((m: any) => ({
      medicoId: m.id as string,
      hora: proximaVagaNoDia({
        agendamentos: dayApptsBase.filter((a: any) => a.medico_id === m.id),
        bloqueios: bloqueiosDoDia.filter((b: any) => b.medico_id === m.id),
        faixas: faixasPorMedico ? faixasPorMedico[m.id] ?? [] : undefined,
        aPartirDe: activeDate === todaySaoPauloDateOnly() ? minutosAgoraSaoPaulo() : 0,
        duracaoMinutos: Number(m.intervalo_consulta) || 30,
        passoMinutos: 15,
      }),
    }))
    .filter((v): v is { medicoId: string; hora: string } => !!v.hora);
  const [listaNoDesktop, setListaNoDesktop] = useState(false);

  const contextoDaAgenda = () => {
    const query = new URLSearchParams(searchParams);
    for (const key of ['agendamento', 'reagendar', 'espera', 'paciente']) query.delete(key);
    query.set('data', activeDate);
    query.set('view', activeView);
    return { returnTo: `/agenda?${query}`, agendaFilters: { search, status: statusFilter, medicos: medicoFilter } };
  };
  const abrirImpressao = () => {
    const params = new URLSearchParams({ data: activeDate, view: activeView });
    if (medicoFilter.length) params.set('medicos', medicoFilter.join(','));
    navigate(`/agenda/imprimir?${params}`, { state: contextoDaAgenda() });
  };
  const abrirConfirmacoes = () => navigate('/agenda/confirmacoes', { state: contextoDaAgenda() });
  const abrirBuscaDeVaga = () => navigate('/agenda/buscar-vaga', { state: contextoDaAgenda() });
  const onlineAConfirmar = useMemo(
    () => baseVisivel.filter((a: any) => pendenteOnline(a) && a.data >= todaySaoPauloDateOnly()).length,
    [baseVisivel],
  );

  const openBlockManagement = () => {
    const query = new URLSearchParams(searchParams);
    for (const key of ['agendamento', 'reagendar', 'espera', 'paciente']) query.delete(key);
    query.set('data', activeDate);
    query.set('view', activeView);
    navigate('/agenda/bloqueios', {
      state: {
        agendaReturnTo: `/agenda?${query}`,
        agendaFilters: { search, status: statusFilter, medicos: medicoFilter },
        initial: { medico_id: medicoFilter.length === 1 ? medicoFilter[0] : undefined },
      },
    });
  };

  if (isMedicoOnly && loadingCurrentMedico) return <AgendaSkeleton />;
  if (isMedicoOnly && currentMedicoError) {
    return <ErrorState title="Não foi possível identificar seu vínculo médico" error={currentMedicoError} onRetry={() => void refetchCurrentMedico()} />;
  }
  if (isMedicoOnly && !myMedicoId) {
    return (
      <ErrorState
        title="Seu usuário não está vinculado a um médico"
        description="A agenda individual não pode ser exibida até que um administrador vincule sua conta ao cadastro médico correspondente."
      />
    );
  }

  return (
    <div className="flex min-w-0 gap-0">
      <div className="min-w-0 flex-1 space-y-4 px-0 py-2 sm:p-4">
        <AgendaHeader
          date={activeDate}
          view={activeView}
          onDateChange={handleDateChange}
          onViewChange={handleViewChange}
          defaultView={defaultView}
          onSetDefaultView={setDefaultView}
          search={search}
          onSearchChange={setSearch}
          medicos={visibleMedicos}
          hideMedicoFilter={isMedicoOnly}
          statusFilter={statusFilter}
          medicoFilter={medicoFilter}
          onlineFilter={onlineFilter}
          onOnlineFilterChange={setOnlineFilter}
          onlineCount={onlineAConfirmar}
          totalsLabel={periodoTotais.rotulo}
          onPrint={abrirImpressao}
          onOpenConfirmacoes={isMedicoOnly ? undefined : abrirConfirmacoes}
          onBuscarVaga={isMedicoOnly ? undefined : abrirBuscaDeVaga}
          onStatusFilterChange={setStatusFilter}
          onMedicoFilterChange={setMedicoFilter}
          onNewAppointment={() => abrirNovaConsulta({ data: activeDate })}
          newAppointmentDisabled={novaConsultaBloqueada}
          onNewBlock={openBlockManagement}
          onOpenColorScheme={() => navigate('/agenda/configurar-cores', {
            state: {
              returnTo: `${location.pathname}${location.search}`,
              agendaFilters: { search, status: statusFilter, medicos: medicoFilter },
            },
          })}
          onToggleWaiting={() => setWaitingOpen(o => !o)}
          waitingCount={waiting.length}
          totals={totals}
          legend={legend}
          diasComConsulta={diasComConsulta}
          onIrParaProxima={activeView === 'daily' && activeDate === todaySaoPauloDateOnly() ? irParaProxima : undefined}
        />

        {allAppts.length >= MAX_LINHAS_AUTO && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
            <span className="font-semibold">A agenda carregou o limite de {MAX_LINHAS_AUTO.toLocaleString('pt-BR')} consultas para este período.</span>
            <span>Os horários exibidos e a verificação de conflitos podem estar incompletos. Reduza o período consultado e atualize a agenda antes de agendar.</span>
          </div>
        )}

        {agendaQuery.isError ? (
          <ErrorState title="Não foi possível carregar a agenda" error={agendaQuery.error} onRetry={() => void agendaQuery.refetch()} />
        ) : medicosQuery.isError ? (
          <ErrorState title="Não foi possível carregar os médicos" error={medicosQuery.error} onRetry={() => void medicosQuery.refetch()} />
        ) : bloqueiosQuery.isError ? (
          <ErrorState title="Não foi possível verificar os bloqueios da agenda" description="A agenda foi pausada para evitar agendamentos durante férias, feriados ou outros bloqueios." error={bloqueiosQuery.error} onRetry={() => void bloqueiosQuery.refetch()} />
        ) : isLoading || medicosQuery.isLoading || bloqueiosQuery.isLoading || conveniosQuery.isLoading || tiposQuery.isLoading || salasQuery.isLoading ? (
          <AgendaSkeleton />
        ) : (
          <>
          {novaConsultaBloqueada && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning-foreground">
              <span>Não foi possível carregar {falhasDadosApoio.join(', ')}. A agenda segue visível, mas novas consultas estão bloqueadas até recarregar.</span>
              <Button variant="outline" size="sm" onClick={recarregarDadosApoio}>Tentar novamente</Button>
            </div>
          )}
          <DndContext
            sensors={sensors}
            accessibility={{ announcements: anunciosArraste, screenReaderInstructions: agendaScreenReaderInstructions }}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {activeView === 'daily' && (
              <>
                <div className="hidden xl:block">
                  <DailyMultiDoctorView
                    date={activeDate}
                    medicos={medicoFilter.length ? visibleMedicos.filter((m: any) => medicoFilter.includes(m.id)) : visibleMedicos}
                    agendamentos={dayAppts}
                    agendamentosDoDia={dayApptsBase}
                    bloqueios={bloqueios}
                    colorFor={colorFor}
                    convenioById={Object.fromEntries((convenios as any[]).map(c => [c.id, c]))}
                    expedientePorMedico={expedientePorMedico}
                    faixasPorMedico={faixasPorMedico}
                    onVerForaDaGrade={() => setListaNoDesktop(true)}
                    onSlotClick={handleSlotClick}
                    onCardClick={(a: any) => setDialogState({ open: true, initial: a })}
                    onNovaConsulta={(initial: any) => abrirNovaConsulta(initial)}
                    onRemarcar={remarcarConsulta}
                  />
                </div>
                {listaNoDesktop && (
                  <div className="hidden justify-end xl:flex">
                    <Button variant="ghost" size="sm" onClick={() => setListaNoDesktop(false)}>Ocultar lista</Button>
                  </div>
                )}
                <MobileDailyAppointments
                  appointments={dayAppts}
                  medicoById={medicoById}
                  bloqueios={bloqueiosDoDia}
                  vagasLivres={vagasLivresDoDia}
                  onSlotClick={novaConsultaBloqueada ? undefined : handleSlotClick}
                  sempreVisivel={listaNoDesktop}
                  comAcoes
                  onNovaConsulta={abrirNovaConsulta}
                  onRemarcar={remarcarConsulta}
                  onCardClick={(appointment) => setDialogState({ open: true, initial: appointment })}
                />
              </>
            )}
            {activeView === 'weekly' && (
              <WeeklyView
                date={activeDate}
                agendamentos={filtered}
                colorFor={colorFor}
                medicoById={medicoById}
                onDayClick={handleDayClick}
                onCardClick={(a) => setDialogState({ open: true, initial: a })}
                bloqueios={bloqueios}
                medicosVisiveis={medicosEmExibicao}
              />
            )}
            {activeView === 'monthly' && (
              <MonthlyView
                date={activeDate}
                agendamentos={filtered}
                colorFor={colorFor}
                medicoById={medicoById}
                onDayClick={handleDayClick}
                bloqueios={bloqueios}
                medicosVisiveis={medicosEmExibicao}
              />
            )}
            <DragOverlay>
              {activeDrag?.agendamento && (
                <div className="rounded-lg border border-primary bg-card px-2 py-1.5 text-xs shadow-lg">
                  {activeDrag.agendamento.hora_inicio.slice(0, 5)} · {activeDrag.agendamento.pacientes?.nome || 'Paciente'}
                </div>
              )}
              {activeDrag?.waiting && (
                <div className="rounded-lg border border-primary bg-card px-3 py-2 text-xs shadow-lg">
                  {activeDrag.waiting.pacientes?.nome || 'Paciente'}
                </div>
              )}
            </DragOverlay>
          </DndContext>
          </>
        )}
      </div>

      <WaitingListSidebar
        open={waitingOpen}
        onToggle={() => setWaitingOpen(o => !o)}
        items={waiting as any}
        isLoading={waitingQuery.isLoading}
        error={waitingQuery.error}
        onRetry={() => void waitingQuery.refetch()}
        topo={(
          <PainelNovoAgendamento
            date={activeDate}
            diasComConsulta={diasComConsulta}
            onDateChange={handleDateChange}
            onNovoAgendamento={() => abrirNovaConsulta({ data: activeDate })}
            onBloquear={openBlockManagement}
            onEncaixe={podeEncaixar && activeDate === todaySaoPauloDateOnly()
              ? () => navigate('/recepcao/encaixe', { state: { returnTo: `${location.pathname}${location.search}` } })
              : undefined}
          />
        )}
      />


      <AlertDialog open={!!moveForaExpediente} onOpenChange={open => { if (!open) setMoveForaExpediente(null); }}>
        <AlertDialogContent data-elo-font-preview="agenda">
          <AlertDialogHeader>
            <AlertDialogTitle>Mover para fora do expediente?</AlertDialogTitle>
            <AlertDialogDescription>
              {moveForaExpediente?.faixa
                ? `O expediente cadastrado do médico neste dia é ${moveForaExpediente.faixa}. `
                : 'O médico não tem expediente cadastrado neste dia. '}
              Confirme se deseja manter a consulta em {moveForaExpediente?.slot?.hora_inicio}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMoveForaExpediente(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={event => {
              event.preventDefault();
              const pendente = moveForaExpediente;
              setMoveForaExpediente(null);
              if (pendente) void doMove(pendente.agendamento, pendente.slot);
            }}>
              Mover mesmo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
