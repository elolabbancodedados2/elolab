import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, addMonths, addWeeks, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
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
import { AppointmentDialog } from './AppointmentDialog';
import { WaitingListSidebar } from './WaitingListSidebar';
import { ColorSchemeDialog } from './ColorSchemeDialog';
import { BloqueioAgenda } from './BloqueioAgenda';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AgendaSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ErrorState';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { pacienteCorresponde } from '@/lib/buscaPaciente';
import { isValidAgendaDate, normalizeAgendaDate } from '@/lib/agendaDate';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { podeRemarcarAgendamento } from '@/lib/appointmentStatus';
import { prepareWaitingListAppointment } from '@/lib/waitingListSlotCompatibility';
import { agendaScreenReaderInstructions, criarAnunciosAgenda } from './agendaDndAccessibility';
import { formatAppointmentStatus } from '@/components/dashboard/appointmentStatus';
import { nomeMedico } from '@/lib/formatters';

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

function MobileDailyAppointments({
  appointments,
  medicoById,
  onCardClick,
}: {
  appointments: MobileAgendaAppointment[];
  medicoById: Record<string, { nome?: string | null; crm?: string | null } | undefined>;
  onCardClick: (appointment: MobileAgendaAppointment) => void;
}) {
  const ordered = [...appointments].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));

  if (ordered.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center xl:hidden">
        <p className="font-medium text-foreground">Nenhuma consulta neste dia</p>
        <p className="mt-1 text-sm text-muted-foreground">Escolha outra data ou crie um novo agendamento.</p>
      </div>
    );
  }

  return (
    <section className="space-y-2 xl:hidden" aria-label="Consultas do dia em ordem de horário">
      <p className="px-1 text-sm text-muted-foreground">{ordered.length} consulta{ordered.length === 1 ? '' : 's'} neste dia</p>
      {ordered.map(appointment => {
        const patient = appointment.pacientes?.nome_social || appointment.pacientes?.nome || 'Paciente';
        const medico = appointment.medico_id ? medicoById[appointment.medico_id] : undefined;
        const doctor = medico?.nome || medico?.crm || 'Profissional não informado';
        const start = appointment.hora_inicio?.slice(0, 5) || '—';
        const end = appointment.hora_fim?.slice(0, 5);
        const status = appointment.status?.replace(/_/g, ' ') || 'agendado';

        return (
          <button
            key={appointment.id}
            type="button"
            onClick={() => onCardClick(appointment)}
            aria-label={`Abrir consulta de ${patient} às ${start}`}
            className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="w-[4.5rem] shrink-0 text-sm font-semibold tabular-nums text-foreground">
              {start}{end ? <span className="block text-xs font-normal text-muted-foreground">até {end}</span> : null}
            </span>
            <span className="min-w-0 flex-1 border-l border-border pl-3">
              <span className="block truncate text-sm font-semibold text-foreground">{patient}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{doctor}{appointment.tipo ? ` · ${appointment.tipo}` : ''}</span>
            </span>
            <span className="shrink-0 rounded-full bg-accent px-2 py-1 text-[10px] font-medium capitalize text-accent-foreground">{status}</span>
          </button>
        );
      })}
    </section>
  );
}

const VIEWS_AGENDA: AgendaView[] = ['daily', 'weekly', 'monthly'];

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

function toMinutes(t: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(t)) return Number.NaN;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function AgendaPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useSupabaseAuth();
  const esperaIdDaRota = searchParams.get('espera');
  const pacienteIdDaRota = searchParams.get('paciente');
  const reagendarIdDaRota = searchParams.get('reagendar');
  // Links da central de notificações: ?data=AAAA-MM-DD&agendamento=<id>
  const dataDaRota = searchParams.get('data');
  const agendamentoIdDaRota = searchParams.get('agendamento');
  const reagendarAplicadoRef = useRef<string | null>(null);
  const { medicoId: myMedicoId, isMedicoOnly, isLoading: loadingCurrentMedico, error: currentMedicoError, refetch: refetchCurrentMedico } = useCurrentMedico();
  const [date, setDate] = useState(() => normalizeAgendaDate(isValidAgendaDate(dataDaRota) ? dataDaRota : lerPreferenciaAgenda('agenda:date')));
  useEffect(() => {
    if (isValidAgendaDate(dataDaRota)) setDate(dataDaRota);
  }, [dataDaRota]);
  const [view, setView] = useState<AgendaView>(() => {
    const preferencia = lerPreferenciaAgenda('agenda:view');
    return VIEWS_AGENDA.includes(preferencia as AgendaView) ? preferencia as AgendaView : 'daily';
  });
  const { defaultView, setDefaultView, loaded: defaultViewLoaded } = useAgendaDefaultView();
  const [viewTouched, setViewTouched] = useState(() => VIEWS_AGENDA.includes(lerPreferenciaAgenda('agenda:view') as AgendaView));
  useEffect(() => {
    if (defaultViewLoaded && defaultView && !viewTouched) setView(defaultView);
  }, [defaultViewLoaded, defaultView, viewTouched]);
  const handleViewChange = (v: AgendaView) => { setViewTouched(true); setView(v); };
  useEffect(() => { salvarPreferenciaAgenda('agenda:date', date); }, [date]);
  useEffect(() => { salvarPreferenciaAgenda('agenda:view', view); }, [view]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [medicoFilter, setMedicoFilter] = useState<string[]>([]);
  const [waitingOpen, setWaitingOpen] = useState(true);
  const [colorOpen, setColorOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [dialogState, setDialogState] = useState<{ open: boolean; initial: any | null }>({ open: false, initial: null });
  const [activeDrag, setActiveDrag] = useState<any>(null);
  const [moveForaExpediente, setMoveForaExpediente] = useState<{ agendamento: any; slot: any; faixa: string } | null>(null);

  // Keyboard shortcuts: ← → navigate, T = today, N = new, D/W/M = view
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (e.target as HTMLElement)?.isContentEditable) return;
      if (['checkbox', 'switch', 'combobox', 'menuitem'].includes((e.target as HTMLElement)?.getAttribute?.('role') || '')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Com um modal ou menu aberto, as setas e letras pertencem a ele, não à agenda atrás.
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [data-state="open"][role="listbox"]')) return;
      const d = parseISO(date);
      const step = view === 'monthly' ? addMonths : view === 'weekly' ? addWeeks : addDays;
      if (e.key === 'ArrowLeft') { setDate(format(step(d, -1), 'yyyy-MM-dd')); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { setDate(format(step(d, 1), 'yyyy-MM-dd')); e.preventDefault(); }
      else if (e.key.toLowerCase() === 't') { setDate(todaySaoPauloDateOnly()); }
      else if (e.key.toLowerCase() === 'n') { setDialogState({ open: true, initial: { data: date } }); e.preventDefault(); }
      else if (e.key.toLowerCase() === 'd') handleViewChange('daily');
      else if (e.key.toLowerCase() === 'w') handleViewChange('weekly');
      else if (e.key.toLowerCase() === 'm') handleViewChange('monthly');
      else if (e.key === '/') { setSearch(''); (document.querySelector('input[placeholder*="Buscar paciente"]') as HTMLInputElement)?.focus(); e.preventDefault(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [date, view]);

  // Só o período que a visão mostra. Antes a agenda baixava o histórico
  // inteiro da clínica (com paciente e médico de cada consulta) a cada abertura.
  const periodo = useMemo(() => {
    const d = parseISO(date);
    if (view === 'daily') return { inicio: date, fim: date };
    if (view === 'weekly') {
      const ini = startOfWeek(d, { weekStartsOn: 1 });
      return { inicio: format(ini, 'yyyy-MM-dd'), fim: format(addDays(ini, 6), 'yyyy-MM-dd') };
    }
    // Mesma grade de 6 semanas que a MonthlyView desenha.
    const ini = startOfWeek(startOfMonth(d), { weekStartsOn: 1 });
    return { inicio: format(ini, 'yyyy-MM-dd'), fim: format(addDays(ini, 41), 'yyyy-MM-dd') };
  }, [date, view]);
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
  const waitingQuery = useSupabaseQuery<any>('lista_espera', {
    select: '*, pacientes(nome, nome_social, telefone)',
    filters: [{ column: 'status', operator: 'eq', value: 'aguardando' }],
    orderBy: { column: 'created_at', ascending: false },
  });
  const { data: waiting = [] } = waitingQuery;
  const conveniosQuery = useSupabaseQuery<any>('convenios', { orderBy: { column: 'nome', ascending: true } });
  const tiposQuery = useSupabaseQuery<any>('tipos_consulta', { orderBy: { column: 'nome', ascending: true } });
  const salasQuery = useSupabaseQuery<any>('salas', { orderBy: { column: 'nome', ascending: true } });
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
      const params = new URLSearchParams(searchParams);
      params.delete('reagendar');
      setSearchParams(params, { replace: true });
      return;
    }

    const novaData = format(addDays(parseISO(todaySaoPauloDateOnly()), 1), 'yyyy-MM-dd');
    reagendarAplicadoRef.current = reagendarIdDaRota;
    setDate(novaData);
    handleViewChange('daily');
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
    const params = new URLSearchParams(searchParams);
    params.delete('reagendar');
    setSearchParams(params, { replace: true });
  }, [reagendarIdDaRota, profile?.clinica_id, reagendamentoLoading, reagendamentoError, reagendamentoData, refetchReagendamento, searchParams, setSearchParams]);

  // Abre a consulta indicada pela notificação quando ela aparece no período carregado.
  useEffect(() => {
    if (!agendamentoIdDaRota || isLoading || (isValidAgendaDate(dataDaRota) && date !== dataDaRota)) return;
    const alvo = (allAppts as any[]).find((a) => a.id === agendamentoIdDaRota);
    if (alvo) setDialogState({ open: true, initial: alvo });
    else toast.info('A consulta da notificação não está mais nesta data.', { description: 'Ela pode ter sido remarcada ou cancelada.' });
    const params = new URLSearchParams(searchParams);
    params.delete('agendamento');
    params.delete('data');
    setSearchParams(params, { replace: true });
  }, [agendamentoIdDaRota, dataDaRota, date, isLoading, allAppts, searchParams, setSearchParams]);

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

      const params = new URLSearchParams(searchParams);
      params.delete('espera');
      params.delete('paciente');
      setSearchParams(params, { replace: true });

      if (error || !data || data.paciente_id !== pacienteIdDaRota || data.status !== 'confirmado') {
        toast.error('Não foi possível iniciar o agendamento', {
          description: error?.message || 'Confirme se o paciente ainda está na lista de espera.',
        });
        return;
      }

      setDialogState({
        open: true,
        initial: {
          paciente_id: data.paciente_id,
          medico_id: data.medico_id || '',
          data: todaySaoPauloDateOnly(),
          hora_inicio: '09:00',
          observacoes: data.motivo || '',
          tipo: 'consulta',
          status: 'agendado',
          _waiting_id: data.id,
          _waiting_status: data.status,
        },
      });
    };
    void abrirAgendamentoDaLista();
    return () => { active = false; };
  }, [esperaIdDaRota, pacienteIdDaRota, profile?.clinica_id, searchParams, setSearchParams]);

  const { scheme, setScheme, colorFor } = useAgendaColorScheme();

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
        case 'tipo': return (tipos as any[]).find(t => t.id === chave || t.nome === chave)?.nome ?? null;
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

  const filtered = useMemo(
    () => statusFilter.length ? baseVisivel.filter((a: any) => statusFilter.includes(a.status)) : baseVisivel,
    [baseVisivel, statusFilter],
  );

  const visibleMedicos = useMemo(
    () => isMedicoOnly && myMedicoId ? medicos.filter((m: any) => m.id === myMedicoId) : medicos,
    [medicos, isMedicoOnly, myMedicoId],
  );

  const dayAppts = useMemo(() => filtered.filter((a: any) => a.data === date), [filtered, date]);
  const dayApptsBase = useMemo(() => baseVisivel.filter((a: any) => a.data === date), [baseVisivel, date]);

  const totals = useMemo(() => ({
    total: dayApptsBase.length,
    confirmados: dayApptsBase.filter((a: any) => a.status === 'confirmado').length,
    aguardando: dayApptsBase.filter((a: any) => a.status === 'aguardando' || a.status === 'agendado').length,
    cancelados: dayApptsBase.filter((a: any) => a.status === 'cancelado').length,
  }), [dayApptsBase]);

  // Dias com consulta no mês exibido (grade de 6 semanas), só para marcar o
  // mini‑calendário — carrega apenas data e status.
  const gradeMes = useMemo(() => {
    const ini = startOfWeek(startOfMonth(parseISO(date)), { weekStartsOn: 1 });
    return { inicio: format(ini, 'yyyy-MM-dd'), fim: format(addDays(ini, 41), 'yyyy-MM-dd') };
  }, [date]);
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
  const diaSemana = new Date(`${date}T12:00:00Z`).getUTCDay();
  const idsMedicosVisiveis = useMemo(() => visibleMedicos.map((m: any) => m.id).sort(), [visibleMedicos]);
  const expedienteQuery = useQuery({
    queryKey: ['agenda-expediente', profile?.clinica_id, diaSemana, idsMedicosVisiveis],
    enabled: !!profile?.clinica_id && idsMedicosVisiveis.length > 0 && view === 'daily',
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.from('medico_disponibilidade' as any)
        .select('medico_id, hora_inicio, hora_fim')
        .in('medico_id', idsMedicosVisiveis)
        .eq('dia_semana', diaSemana)
        .eq('ativo', true) as any);
      if (error) throw error;
      const minutos: Record<string, number> = {};
      for (const j of (data as any[]) ?? []) {
        const ini = toMinutes(String(j.hora_inicio).slice(0, 5));
        const fim = toMinutes(String(j.hora_fim).slice(0, 5));
        if (Number.isFinite(ini) && Number.isFinite(fim) && fim > ini) minutos[j.medico_id] = (minutos[j.medico_id] ?? 0) + (fim - ini);
      }
      return minutos;
    },
  });
  const expedientePorMedico = expedienteQuery.data ?? {};

  const proximaDoDia = useMemo(() => {
    if (date !== todaySaoPauloDateOnly()) return null;
    const agora = new Date();
    const partes = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(agora);
    const nowMin = Number(partes.find(p => p.type === 'hour')?.value ?? 0) * 60 + Number(partes.find(p => p.type === 'minute')?.value ?? 0);
    return [...dayApptsBase]
      .filter((a: any) => !['cancelado', 'faltou'].includes(a.status))
      .sort((a: any, b: any) => a.hora_inicio.localeCompare(b.hora_inicio))
      .find((a: any) => toMinutes(a.hora_inicio.slice(0, 5)) >= nowMin) ?? null;
  }, [dayApptsBase, date]);

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
    const slotData = over.data.current as any;
    if (!slotData?.medico_id) return;

    const active = e.active.data.current as any;

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
      toast.error('Esta consulta nao pode ser remarcada depois que o atendimento comecou ou terminou.');
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
    setDialogState({ open: true, initial: { medico_id, data: date, hora_inicio, status: 'agendado', tipo: 'consulta' } });
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
          date={date}
          view={view}
          onDateChange={setDate}
          onViewChange={handleViewChange}
          defaultView={defaultView}
          onSetDefaultView={setDefaultView}
          search={search}
          onSearchChange={setSearch}
           medicos={visibleMedicos}
          statusFilter={statusFilter}
          medicoFilter={medicoFilter}
          onStatusFilterChange={setStatusFilter}
          onMedicoFilterChange={setMedicoFilter}
          onNewAppointment={() => setDialogState({ open: true, initial: { data: date } })}
          onNewBlock={() => setBlockOpen(true)}
          onOpenColorScheme={() => setColorOpen(true)}
          onToggleWaiting={() => setWaitingOpen(o => !o)}
          waitingCount={waiting.length}
          totals={totals}
          legend={legend}
          diasComConsulta={diasComConsulta}
          onIrParaProxima={view === 'daily' && date === todaySaoPauloDateOnly() ? irParaProxima : undefined}
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
        ) : conveniosQuery.isError ? (
          <ErrorState title="Não foi possível carregar os convênios" description="Atualize os dados antes de criar ou editar consultas." error={conveniosQuery.error} onRetry={() => void conveniosQuery.refetch()} />
        ) : tiposQuery.isError ? (
          <ErrorState title="Não foi possível carregar os tipos de consulta" description="Atualize os dados antes de criar ou editar consultas." error={tiposQuery.error} onRetry={() => void tiposQuery.refetch()} />
        ) : salasQuery.isError ? (
          <ErrorState title="Não foi possível carregar as salas" description="Atualize os dados antes de criar ou editar consultas." error={salasQuery.error} onRetry={() => void salasQuery.refetch()} />
        ) : isLoading || medicosQuery.isLoading || bloqueiosQuery.isLoading || conveniosQuery.isLoading || tiposQuery.isLoading || salasQuery.isLoading ? (
          <AgendaSkeleton />
        ) : (
          <DndContext
            sensors={sensors}
            accessibility={{ announcements: anunciosArraste, screenReaderInstructions: agendaScreenReaderInstructions }}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {view === 'daily' && (
              <>
                <div className="hidden xl:block">
                  <DailyMultiDoctorView
                    date={date}
                    medicos={medicoFilter.length ? visibleMedicos.filter((m: any) => medicoFilter.includes(m.id)) : visibleMedicos}
                    agendamentos={dayAppts}
                    agendamentosDoDia={dayApptsBase}
                    bloqueios={bloqueios}
                    colorFor={colorFor}
                    convenioById={Object.fromEntries((convenios as any[]).map(c => [c.id, c]))}
                    expedientePorMedico={expedientePorMedico}
                    onSlotClick={handleSlotClick}
                    onCardClick={(a: any) => setDialogState({ open: true, initial: a })}
                    onNovaConsulta={(initial: any) => setDialogState({ open: true, initial })}
                  />
                </div>
                <MobileDailyAppointments
                  appointments={dayAppts}
                  medicoById={medicoById}
                  onCardClick={(appointment) => setDialogState({ open: true, initial: appointment })}
                />
              </>
            )}
            {view === 'weekly' && (
              <WeeklyView
                date={date}
                agendamentos={filtered}
                colorFor={colorFor}
                medicoById={medicoById}
                onDayClick={(d) => { setDate(d); setView('daily'); }}
                onCardClick={(a) => setDialogState({ open: true, initial: a })}
              />
            )}
            {view === 'monthly' && (
              <MonthlyView
                date={date}
                agendamentos={filtered}
                colorFor={colorFor}
                medicoById={medicoById}
                onDayClick={(d) => { setDate(d); setView('daily'); }}
              />
            )}
            <DragOverlay>
              {activeDrag?.agendamento && (
                <div className="rounded-lg border border-[#1080CA] bg-card px-2 py-1.5 text-xs shadow-lg">
                  {activeDrag.agendamento.hora_inicio.slice(0, 5)} · {activeDrag.agendamento.pacientes?.nome || 'Paciente'}
                </div>
              )}
              {activeDrag?.waiting && (
                <div className="rounded-lg border border-[#1080CA] bg-card px-3 py-2 text-xs shadow-lg">
                  {activeDrag.waiting.pacientes?.nome || 'Paciente'}
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <WaitingListSidebar
        open={waitingOpen}
        onToggle={() => setWaitingOpen(o => !o)}
        items={waiting as any}
        isLoading={waitingQuery.isLoading}
        error={waitingQuery.error}
        onRetry={() => void waitingQuery.refetch()}
      />

      <AppointmentDialog
        open={dialogState.open}
        onOpenChange={(o) => setDialogState({ open: o, initial: o ? dialogState.initial : null })}
        initial={dialogState.initial}
        medicos={visibleMedicos}
        tipos={tipos}
        salas={salas}
        onSaved={async () => {
          const w = dialogState.initial?._waiting_id;
          if (w) {
            try {
              const { data, error } = await (supabase.from('lista_espera' as any)
                .update({ status: 'agendado' })
                .eq('id', w)
                .eq('clinica_id', profile?.clinica_id || '')
                .eq('status', dialogState.initial?._waiting_status || 'aguardando')
                .select('id')
                .maybeSingle() as any);
              if (error) throw error;
              if (!data) {
                toast.error('Consulta salva, mas a vaga da lista de espera não foi atualizada.', {
                  description: 'Ela pode ter sido agendada em outra tela ou não estar mais aguardando.',
                });
              }
            } catch (error) {
              toast.error('Consulta salva, mas não foi possível atualizar a lista de espera.', {
                description: error instanceof Error ? error.message : 'Tente atualizar a lista de espera.',
              });
            } finally {
              void queryClient.invalidateQueries({ queryKey: ['lista_espera'] });
            }
          }
        }}
      />

      <AlertDialog open={!!moveForaExpediente} onOpenChange={open => { if (!open) setMoveForaExpediente(null); }}>
        <AlertDialogContent>
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

      <ColorSchemeDialog
        open={colorOpen}
        onOpenChange={setColorOpen}
        scheme={scheme}
        onSave={setScheme}
         medicos={visibleMedicos}
        convenios={convenios}
        tipos={tipos}
      />

      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Bloqueios de agenda</DialogTitle></DialogHeader>
          <BloqueioAgenda />
        </DialogContent>
      </Dialog>

    </div>
  );
}
