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
import { normalizeAgendaDate } from '@/lib/agendaDate';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

export type AgendaView = 'daily' | 'weekly' | 'monthly';

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
  const reagendarAplicadoRef = useRef<string | null>(null);
  const { medicoId: myMedicoId, isMedicoOnly } = useCurrentMedico();
  const [date, setDate] = useState(() => normalizeAgendaDate(lerPreferenciaAgenda('agenda:date')));
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
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Com um modal aberto, as setas e letras pertencem a ele, não à agenda atrás.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
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
  const agendaQuery = useAgendamentosPeriodo(periodo.inicio, periodo.fim);
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

  useEffect(() => {
    if (!reagendarIdDaRota) {
      reagendarAplicadoRef.current = null;
      return;
    }
    if (!profile?.clinica_id || reagendamentoQuery.isLoading || reagendarAplicadoRef.current === reagendarIdDaRota) return;
    if (reagendamentoQuery.isError) {
      reagendarAplicadoRef.current = reagendarIdDaRota;
      toast.error('Não foi possível carregar o atendimento para reagendar.', {
        description: 'Tente novamente ou abra a Agenda e crie a consulta manualmente.',
        action: {
          label: 'Tentar de novo',
          onClick: () => {
            reagendarAplicadoRef.current = null;
            void reagendamentoQuery.refetch();
          },
        },
      });
      return;
    }
    const origem = reagendamentoQuery.data;
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
  }, [reagendarIdDaRota, profile?.clinica_id, reagendamentoQuery.isLoading, reagendamentoQuery.isError, reagendamentoQuery.data, reagendamentoQuery.refetch, searchParams, setSearchParams]);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // A política de acesso continua sendo a autoridade final, mas o médico
    // não deve sequer receber uma primeira renderização com a agenda de toda a
    // clínica enquanto o useEffect sincroniza o filtro visual.
    const allowedMedicoId = isMedicoOnly ? myMedicoId : null;
    return allAppts.filter((a: any) => {
      if (isMedicoOnly && !allowedMedicoId) return false;
      if (allowedMedicoId && a.medico_id !== allowedMedicoId) return false;
      if (medicoFilter.length && !medicoFilter.includes(a.medico_id)) return false;
      if (statusFilter.length && !statusFilter.includes(a.status)) return false;
      if (q) {
        // O CPF é gravado com máscara: concatenar e comparar com o termo cru
        // fazia "12345678900" não achar "123.456.789-00".
        if (!a.pacientes || !pacienteCorresponde(a.pacientes, q)) return false;
      }
      return true;
    });
  }, [allAppts, medicoFilter, statusFilter, search, isMedicoOnly, myMedicoId]);

  const visibleMedicos = useMemo(
    () => isMedicoOnly && myMedicoId ? medicos.filter((m: any) => m.id === myMedicoId) : medicos,
    [medicos, isMedicoOnly, myMedicoId],
  );

  const dayAppts = useMemo(() => filtered.filter((a: any) => a.data === date), [filtered, date]);

  const totals = useMemo(() => ({
    total: dayAppts.length,
    confirmados: dayAppts.filter((a: any) => a.status === 'confirmado').length,
    aguardando: dayAppts.filter((a: any) => a.status === 'aguardando' || a.status === 'agendado').length,
    cancelados: dayAppts.filter((a: any) => a.status === 'cancelado').length,
  }), [dayAppts]);

  const sensors = useSensors(
    useSensor(KeyboardSensor),
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

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
      setDialogState({
        open: true,
        initial: {
          paciente_id: w.paciente_id,
          medico_id: slotData.medico_id,
          data: slotData.data,
          hora_inicio: slotData.hora_inicio,
          observacoes: w.motivo || '',
          tipo: 'consulta',
          status: 'agendado',
          _waiting_id: w.id,
        },
      });
      return;
    }

    if (active?.agendamento) {
      const ag = active.agendamento;
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

  const doMove = async (ag: any, slot: { medico_id: string; data: string; hora_inicio: string }) => {
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
      const { data, error } = await (updateQuery.select('id').maybeSingle() as any);
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
        toast.success('Consulta remarcada');
        void queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      }
    } catch (error) {
      toast.error('Não foi possível remarcar a consulta.', { description: error instanceof Error ? error.message : 'Verifique sua conexão e tente novamente.' });
    }
  };

  const handleSlotClick = (medico_id: string, hora_inicio: string) => {
    setDialogState({ open: true, initial: { medico_id, data: date, hora_inicio, status: 'agendado', tipo: 'consulta' } });
  };

  if (isMedicoOnly && medicosQuery.isLoading) return <AgendaSkeleton />;
  if (isMedicoOnly && medicosQuery.isError) {
    return <ErrorState title="Não foi possível identificar seu vínculo médico" error={medicosQuery.error} onRetry={() => void medicosQuery.refetch()} />;
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
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            {view === 'daily' && (
              <DailyMultiDoctorView
                date={date}
                medicos={medicoFilter.length ? visibleMedicos.filter((m: any) => medicoFilter.includes(m.id)) : visibleMedicos}
                agendamentos={dayAppts}
                bloqueios={bloqueios}
                colorFor={colorFor}
                convenioById={Object.fromEntries((convenios as any[]).map(c => [c.id, c]))}
                onSlotClick={handleSlotClick}
                onCardClick={(a: any) => setDialogState({ open: true, initial: a })}
              />
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
                <div className="rounded-md bg-card border border-primary shadow-lg px-2 py-1.5 text-xs">
                  {activeDrag.agendamento.hora_inicio.slice(0, 5)} · {activeDrag.agendamento.pacientes?.nome || 'Paciente'}
                </div>
              )}
              {activeDrag?.waiting && (
                <div className="rounded-md bg-card border border-primary shadow-lg px-3 py-2 text-xs">
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
