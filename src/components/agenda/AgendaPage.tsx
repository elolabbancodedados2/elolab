import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, MouseSensor,
  TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { useAgendamentos, useMedicos, usePacientes, useSupabaseQuery } from '@/hooks/useSupabaseData';
import { useAgendaColorScheme } from './hooks/useAgendaColorScheme';
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
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [view, setView] = useState<AgendaView>('daily');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [medicoFilter, setMedicoFilter] = useState<string[]>([]);
  const [waitingOpen, setWaitingOpen] = useState(true);
  const [colorOpen, setColorOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [dialogState, setDialogState] = useState<{ open: boolean; initial: any | null }>({ open: false, initial: null });
  const [confirmMove, setConfirmMove] = useState<null | { agendamento: any; medico_id: string; data: string; hora_inicio: string }>(null);
  const [activeDrag, setActiveDrag] = useState<any>(null);

  const { data: allAppts = [], isLoading } = useAgendamentos();
  const { data: medicos = [] } = useMedicos();
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

      // conflict?
      const conflict = allAppts.find((a: any) =>
        a.id !== ag.id && a.medico_id === slotData.medico_id && a.data === slotData.data &&
        Math.abs(toMinutes(a.hora_inicio) - toMinutes(slotData.hora_inicio)) < 30
      );
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
    if (error) toast.error('Erro ao mover consulta');
    else { toast.success('Consulta remarcada'); queryClient.invalidateQueries({ queryKey: ['agendamentos'] }); }
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
          onViewChange={setView}
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
                onSlotClick={handleSlotClick}
                onCardClick={(a: any) => setDialogState({ open: true, initial: a })}
              />
            )}
            {view === 'weekly' && (
              <WeeklyView
                date={date}
                agendamentos={filtered}
                colorFor={colorFor}
                onDayClick={(d) => { setDate(d); setView('daily'); }}
                onCardClick={(a) => setDialogState({ open: true, initial: a })}
              />
            )}
            {view === 'monthly' && (
              <MonthlyView
                date={date}
                agendamentos={filtered}
                colorFor={colorFor}
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
