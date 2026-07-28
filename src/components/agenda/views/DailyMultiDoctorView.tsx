import { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Ban, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppointmentCard } from '../AppointmentCard';

const START_HOUR = 6;
const END_HOUR = 22;
const SLOT_MINUTES = 30;
const SLOT_PX = 40;
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;

function toMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function fromMinutes(m: number) {
  const h = Math.floor(m / 60).toString().padStart(2, '0');
  const mm = (m % 60).toString().padStart(2, '0');
  return `${h}:${mm}`;
}

const SLOTS = Array.from({ length: (END_HOUR - START_HOUR) * (60 / SLOT_MINUTES) }, (_, i) =>
  fromMinutes(START_HOUR * 60 + i * SLOT_MINUTES)
);

function DoctorColumn({
  medico, date, agendamentos, bloqueios, colorFor, onSlotClick, onCardClick,
}: any) {
  const minutesToPx = (m: number) => (m / SLOT_MINUTES) * SLOT_PX;

  return (
    <div className="flex-1 min-w-[220px] border-r border-border/60 last:border-r-0">
      <div className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">Dr(a). {medico.nome || medico.crm}</div>
            <div className="text-[11px] text-muted-foreground truncate">{medico.especialidade || 'Clínico Geral'}</div>
          </div>
        </div>
      </div>

      <div className="relative" style={{ height: minutesToPx(TOTAL_MINUTES) }}>
        {SLOTS.map((slot) => (
          <DropSlot
            key={slot}
            id={`slot:${medico.id}:${date}:${slot}`}
            data={{ medico_id: medico.id, data: date, hora_inicio: slot }}
            onClick={() => onSlotClick(medico.id, slot)}
            className={cn(
              'border-b border-border/40 hover:bg-muted/40 transition-colors cursor-pointer',
              slot.endsWith(':00') && 'border-border/60'
            )}
            style={{ height: SLOT_PX }}
          />
        ))}

        {bloqueios.map((b: any) => {
          const start = b.hora_inicio ? toMinutes(b.hora_inicio) : START_HOUR * 60;
          const end = b.hora_fim ? toMinutes(b.hora_fim) : END_HOUR * 60;
          const clampedStart = Math.max(start, START_HOUR * 60);
          const clampedEnd = Math.min(end, END_HOUR * 60);
          if (clampedEnd <= clampedStart) return null;
          return (
            <div
              key={b.id}
              className="absolute inset-x-1 rounded-md bg-muted/70 border border-dashed border-border pointer-events-none flex items-center justify-center gap-1 text-[11px] text-muted-foreground"
              style={{
                top: minutesToPx(clampedStart - START_HOUR * 60),
                height: minutesToPx(clampedEnd - clampedStart) - 4,
                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 6px, hsl(var(--muted)) 6px, hsl(var(--muted)) 12px)',
                zIndex: 5,
              }}
              title={b.motivo || b.tipo}
            >
              <Ban className="h-3 w-3" />
              <span className="truncate">{b.motivo || b.tipo}</span>
            </div>
          );
        })}

        {agendamentos.map((ag: any) => (
          <AppointmentCard
            key={ag.id}
            agendamento={ag}
            color={colorFor(ag)}
            slotHeight={SLOT_PX}
            minutesToPx={minutesToPx}
            onClick={() => onCardClick(ag)}
          />
        ))}
      </div>
    </div>
  );
}

function DropSlot({ id, data, className, style, onClick }: any) {
  const { setNodeRef, isOver } = useDroppable({ id, data });
  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={cn(className, isOver && 'bg-primary/10 ring-1 ring-primary/40 ring-inset')}
    />
  );
}

export function DailyMultiDoctorView({
  date, medicos, agendamentos, bloqueios, colorFor, onSlotClick, onCardClick,
}: any) {
  const activeDoctors = useMemo(() => medicos.filter((m: any) => m.ativo !== false), [medicos]);
  const dayStr = format(parseISO(date), "EEEE, d 'de' MMMM", { locale: ptBR });

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-2 border-b border-border/60 bg-muted/30">
        <div className="text-sm font-medium capitalize">{dayStr}</div>
      </div>
      <div className="flex overflow-x-auto">
        <div className="w-14 shrink-0 border-r border-border/60 pt-[52px]">
          {SLOTS.map((slot) => (
            <div
              key={slot}
              className={cn(
                'h-10 -mt-2 pt-2 text-[10px] text-muted-foreground text-right pr-1',
                slot.endsWith(':00') ? 'font-medium' : 'opacity-60'
              )}
            >
              {slot}
            </div>
          ))}
        </div>
        {activeDoctors.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-16 text-sm text-muted-foreground">
            Nenhum médico ativo. Cadastre médicos em <span className="mx-1 font-medium">Equipe</span> para começar.
          </div>
        ) : (
          activeDoctors.map((m: any) => (
            <DoctorColumn
              key={m.id}
              medico={m}
              date={date}
              agendamentos={agendamentos.filter((a: any) => a.medico_id === m.id)}
              bloqueios={bloqueios.filter((b: any) => b.medico_id === m.id && date >= b.data_inicio && date <= b.data_fim)}
              colorFor={colorFor}
              onSlotClick={onSlotClick}
              onCardClick={onCardClick}
            />
          ))
        )}
      </div>
    </div>
  );
}

export const DAILY_CONSTS = { START_HOUR, END_HOUR, SLOT_MINUTES, SLOT_PX };
