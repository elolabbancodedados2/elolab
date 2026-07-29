import { useEffect, useMemo, useState } from 'react';
import { addDays, addMonths, addWeeks, format, parseISO } from 'date-fns';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, MouseSensor,
  TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { useAgendamentos, useMedicos, usePacientes, useSupabaseQuery } from '@/hooks/useSupabaseData';
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AgendaSkeleton } from '@/components/ui/loading-skeleton';

export type AgendaView = 'daily' | 'weekly' | 'monthly';

function toMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function AgendaPage() {
  const queryClient = useQueryClient();
  const { medicoId: myMedicoId, isMedicoOnly } = useCurrentMedico();
  const [date, setDate] = useState(() => sessionStorage.getItem('agenda:date') || format(new Date(), 'yyyy-MM-dd'));
  const [view, setView] = useState<AgendaView>(() => (sessionStorage.getItem('agenda:view') as AgendaView) || 'daily');
  const { defaultView, setDefaultView, loaded: defaultViewLoaded } = useAgendaDefaultView();
  const [viewTouched, setViewTouched] = useState(() => !!sessionStorage.getItem('agenda:view'));
  useEffect(() => {
    if (defaultViewLoaded && defaultView && !viewTouched) setView(defaultView);
  }, [defaultViewLoaded, defaultView, viewTouched]);
  const handleViewChange = (v: AgendaView) => { setViewTouched(true); setView(v); };
  useEffect(() => { sessionStorage.setItem('agenda:date', date); }, [date]);
  useEffect(() => { sessionStorage.setItem('agenda:view', view); }, [view]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [medicoFilter, setMedicoFilter] = useState<string[]>([]);
  const [waitingOpen, setWaitingOpen] = useState(true);
  const [colorOpen, setColorOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [dialogState, setDialogState] = useState<{ open: boolean; initial: any | null }>({ open: false, initial: null });
  const [confirmMove, setConfirmMove] = useState<null | { agendamento: any; medico_id: string; data: string; hora_inicio: string }>(null);
  const [activeDrag, setActiveDrag] = useState<any>(null);

  // Keyboard shortcuts: ← → navigate, T = today, N = new, D/W/M = view
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const d = parseISO(date);
      const step = view === 'monthly' ? addMonths : view === 'weekly' ? addWeeks : addDays;
      if (e.key === 'ArrowLeft') { setDate(format(step(d, -1), 'yyyy-MM-dd')); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { setDate(format(step(d, 1), 'yyyy-MM-dd')); e.preventDefault(); }
      else if (e.key.toLowerCase() === 't') { setDate(format(new Date(), 'yyyy-MM-dd')); }
      else if (e.key.toLowerCase() === 'n') { setDialogState({ open: true, initial: { data: date } }); e.preventDefault(); }
      else if (e.key.toLowerCase() === 'd') setView('daily');
      else if (e.key.toLowerCase() === 'w') setView('weekly');
      else if (e.key.toLowerCase() === 'm') setView('monthly');
      else if (e.key === '/') { setSearch(''); (document.querySelector('input[placeholder*="Buscar paciente"]') as HTMLInputElement)?.focus(); e.preventDefault(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [date, view]);

  const { data: allAppts = [], isLoading } = useAgendamentos();
  const { data: medicos = [] } = useMedicos();

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

  const convenioByIdMap = useMemo(() => {
    const map: Record<string, any> = {};
    // convenios é carregado logo abaixo; lookup roda depois via dependência.
    return map;
  }, []);

  const { data: pacientes = [] } = usePacientes();
  const { data: bloqueios = [] } = useSupabaseQuery<any>('bloqueios_agenda', {
    orderBy: { column: 'data_inicio', ascending: true },
  });
  const { data: waiting = [] } = useSupabaseQuery<any>('lista_espera', {
    select: '*, pacientes(nome, nome_social, telefone)',
    filters: [{ column: 'status', operator: 'eq', value: 'aguardando' }],
    orderBy: { column: 'created_at', ascending: false },
  });
  const { data: convenios = [] } = useSupabaseQuery<any>('convenios', { orderBy: { column: 'nome', ascending: true } });
  const { data: tipos = [] } = useSupabaseQuery<any>('tipos_consulta', { orderBy: { column: 'nome', ascending: true } });
  const { data: salas = [] } = useSupabaseQuery<any>('salas', { orderBy: { column: 'nome', ascending: true } });

  const { scheme, setScheme, colorFor } = useAgendaColorScheme();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allAppts.filter((a: any) => {
      if (medicoFilter.length && !medicoFilter.includes(a.medico_id)) return false;
      if (statusFilter.length && !statusFilter.includes(a.status)) return false;
      if (q) {
        const p = a.pacientes;
        const hay = `${p?.nome || ''} ${p?.nome_social || ''} ${p?.cpf || ''} ${p?.telefone || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allAppts, medicoFilter, statusFilter, search]);

  const dayAppts = useMemo(() => filtered.filter((a: any) => a.data === date), [filtered, date]);

  const totals = useMemo(() => ({
    total: dayAppts.length,
    confirmados: dayAppts.filter((a: any) => a.status === 'confirmado').length,
    aguardando: dayAppts.filter((a: any) => a.status === 'aguardando' || a.status === 'agendado').length,
    cancelados: dayAppts.filter((a: any) => a.status === 'cancelado').length,
  }), [dayAppts]);

  const sensors = useSensors(
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
      const oldDur = ag.hora_fim
        ? Math.max(5, toMinutes(ag.hora_fim.slice(0, 5)) - toMinutes(ag.hora_inicio.slice(0, 5)))
        : 30;
      const newStart = toMinutes(slotData.hora_inicio);
      const newEnd = newStart + oldDur;

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
        if (a.status === 'cancelado') return false;
        if (a.medico_id !== slotData.medico_id || a.data !== slotData.data) return false;
        const ini = toMinutes(a.hora_inicio.slice(0, 5));
        const fim = a.hora_fim ? toMinutes(a.hora_fim.slice(0, 5)) : ini + 30;
        return ini < newEnd && fim > newStart;
      });
      if (conflict) {
        setConfirmMove({ agendamento: ag, ...slotData });
        return;
      }
      await doMove(ag, slotData);
    }
  };

  const doMove = async (ag: any, slot: { medico_id: string; data: string; hora_inicio: string }) => {
    const oldEnd = ag.hora_fim ? toMinutes(ag.hora_fim) - toMinutes(ag.hora_inicio) : 30;
    const newStart = toMinutes(slot.hora_inicio);
    const newEnd = newStart + oldEnd;
    const hh = (n: number) => `${Math.floor(n / 60).toString().padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}:00`;
    const { error } = await (supabase.from('agendamentos').update({
      medico_id: slot.medico_id,
      data: slot.data,
      hora_inicio: hh(newStart),
      hora_fim: hh(newEnd),
    }).eq('id', ag.id) as any);
    if (error) {
      const overlap = error.code === '23P01' || String(error.message || '').includes('agendamentos_sem_sobreposicao');
      if (overlap) {
        toast.error('Horário indisponível', { description: 'Outra consulta deste médico se sobrepõe a este período.' });
        queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      } else {
        toast.error('Erro ao mover consulta', { description: error.message });
      }
    } else { toast.success('Consulta remarcada'); queryClient.invalidateQueries({ queryKey: ['agendamentos'] }); }
  };

  const handleSlotClick = (medico_id: string, hora_inicio: string) => {
    setDialogState({ open: true, initial: { medico_id, data: date, hora_inicio, status: 'agendado', tipo: 'consulta' } });
  };

  return (
    <div className="flex gap-0 h-full">
      <div className="flex-1 min-w-0 space-y-4 p-4">
        <AgendaHeader
          date={date}
          view={view}
          onDateChange={setDate}
          onViewChange={handleViewChange}
          defaultView={defaultView}
          onSetDefaultView={setDefaultView}
          search={search}
          onSearchChange={setSearch}
          medicos={medicos}
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

        {isLoading ? (
          <AgendaSkeleton />
        ) : (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            {view === 'daily' && (
              <DailyMultiDoctorView
                date={date}
                medicos={medicoFilter.length ? medicos.filter((m: any) => medicoFilter.includes(m.id)) : medicos}
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

      <WaitingListSidebar open={waitingOpen} onToggle={() => setWaitingOpen(o => !o)} items={waiting as any} />

      <AppointmentDialog
        open={dialogState.open}
        onOpenChange={(o) => setDialogState({ open: o, initial: o ? dialogState.initial : null })}
        initial={dialogState.initial}
        pacientes={pacientes}
        medicos={medicos}
        tipos={tipos}
        salas={salas}
        onSaved={async () => {
          const w = dialogState.initial?._waiting_id;
          if (w) {
            await (supabase.from('lista_espera' as any).update({ status: 'agendado' }).eq('id', w) as any);
            queryClient.invalidateQueries({ queryKey: ['lista_espera'] });
          }
        }}
      />

      <ColorSchemeDialog
        open={colorOpen}
        onOpenChange={setColorOpen}
        scheme={scheme}
        onSave={setScheme}
        medicos={medicos}
        convenios={convenios}
        tipos={tipos}
      />

      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Bloqueios de agenda</DialogTitle></DialogHeader>
          <BloqueioAgenda />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmMove} onOpenChange={(o) => !o && setConfirmMove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conflito de horário</AlertDialogTitle>
            <AlertDialogDescription>
              Já existe outra consulta próxima a este horário para o médico. Deseja mover assim mesmo?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (confirmMove) { await doMove(confirmMove.agendamento, confirmMove); setConfirmMove(null); }
            }}>Mover mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
