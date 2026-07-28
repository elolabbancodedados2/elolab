import { useEffect, useMemo, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { format, isToday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Ban, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppointmentCard } from '../AppointmentCard';

const START_HOUR = 6;
const END_HOUR = 22;
// Fine-grained droppable slots (5min) so users can drop / click at any time.
const SLOT_MINUTES = 5;
const SLOT_PX = 7;
// Visual hour rows only (labels + strong borders every hour).
const HOUR_PX = (60 / SLOT_MINUTES) * SLOT_PX;
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
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) =>
  fromMinutes((START_HOUR + i) * 60)
);

function DoctorColumn({
  medico, date, agendamentos, bloqueios, colorFor, onSlotClick, onCardClick,
}: any) {
  const minutesToPx = (m: number) => (m / SLOT_MINUTES) * SLOT_PX;
  const columnRef = useRef<HTMLDivElement>(null);
  const [hoverMin, setHoverMin] = useState<number | null>(null);
  const sorted = [...agendamentos].sort((a: any, b: any) => a.hora_inicio.localeCompare(b.hora_inicio));
  const total = agendamentos.length;
  const confirmed = agendamentos.filter((a: any) => ['confirmado', 'em_atendimento', 'finalizado'].includes(a.status)).length;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const next = sorted.find((a: any) => toMinutes(a.hora_inicio) >= nowMin);

  return (
    <div className="flex-1 min-w-[220px] border-r border-border/60 last:border-r-0">
      <div className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">Dr(a). {medico.nome || medico.crm}</div>
            <div className="text-[11px] text-muted-foreground truncate">{medico.especialidade || 'Clínico Geral'}</div>
          </div>
          {total > 0 && (
            <div className="text-right shrink-0">
              <div className="text-xs font-semibold tabular-nums">{total}</div>
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground">consultas</div>
            </div>
          )}
        </div>
        {next && (
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span>Próximo <span className="font-semibold tabular-nums text-foreground">{next.hora_inicio.slice(0, 5)}</span></span>
            {confirmed > 0 && <span className="ml-auto text-success">✓ {confirmed}</span>}
          </div>
        )}
        {total === 0 && (
          <div className="mt-1.5 text-[10px] text-muted-foreground/60 italic">Agenda livre</div>
        )}
      </div>

      <div
        ref={columnRef}
        className="relative"
        style={{ height: minutesToPx(TOTAL_MINUTES) }}
        onMouseMove={(e) => {
          const rect = columnRef.current?.getBoundingClientRect();
          if (!rect) return;
          const y = e.clientY - rect.top;
          const totalMin = Math.max(0, Math.min(TOTAL_MINUTES - 1, Math.round((y / rect.height) * TOTAL_MINUTES)));
          setHoverMin(totalMin);
        }}
        onMouseLeave={() => setHoverMin(null)}
      >
        {hoverMin !== null && (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-primary/60 z-30"
            style={{ top: minutesToPx(hoverMin) }}
          >
            <span className="absolute -top-2 left-1 rounded bg-primary px-1 py-0 text-[10px] font-medium text-primary-foreground shadow">
              {fromMinutes(START_HOUR * 60 + hoverMin)}
            </span>
          </div>
        )}
        {/* Visual hour gridlines */}
        {HOURS.map((h, i) => (
          <div
            key={h}
            className={cn('absolute inset-x-0 border-t', i === 0 ? 'border-transparent' : 'border-border/50')}
            style={{ top: minutesToPx(i * 60) }}
          />
        ))}
        {HOURS.map((h, i) => (
          <div
            key={`half-${h}`}
            className="absolute inset-x-0 border-t border-dashed border-border/25"
            style={{ top: minutesToPx(i * 60 + 30) }}
          />
        ))}

        {/* Fine-grained (5min) drop + click targets */}
        {SLOTS.map((slot) => (
          <DropSlot
            key={slot}
            id={`slot:${medico.id}:${date}:${slot}`}
            data={{ medico_id: medico.id, data: date, hora_inicio: slot }}
            onClick={() => onSlotClick(medico.id, slot)}
            className="absolute inset-x-0 hover:bg-primary/5 cursor-pointer"
            style={{ top: minutesToPx(toMinutes(slot) - START_HOUR * 60), height: SLOT_PX }}
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [nowMin, setNowMin] = useState<number>(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  const showNow = isToday(parseISO(date));

  useEffect(() => {
    const t = setInterval(() => {
      const n = new Date();
      setNowMin(n.getHours() * 60 + n.getMinutes());
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!showNow || !scrollRef.current) return;
    const relMin = Math.max(0, nowMin - START_HOUR * 60 - 60);
    scrollRef.current.scrollTop = (relMin / SLOT_MINUTES) * SLOT_PX;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, showNow]);

  const nowPx = showNow && nowMin >= START_HOUR * 60 && nowMin <= END_HOUR * 60
    ? ((nowMin - START_HOUR * 60) / SLOT_MINUTES) * SLOT_PX
    : null;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-2 border-b border-border/60 bg-muted/30">
        <div className="text-sm font-medium capitalize flex items-center gap-2">
          {dayStr}
          {showNow && <span className="text-[11px] font-normal text-primary">• agora {fromMinutes(nowMin)}</span>}
        </div>
      </div>
      <div ref={scrollRef} className="flex overflow-auto max-h-[calc(100vh-16rem)] relative">
        {nowPx !== null && (
          <div
            className="pointer-events-none absolute left-14 right-0 z-40 border-t-2 border-destructive"
            style={{ top: 52 + nowPx }}
          >
            <span className="absolute -top-2 -left-1 h-3 w-3 rounded-full bg-destructive shadow" />
          </div>
        )}
        <div className="w-14 shrink-0 border-r border-border/60 pt-[52px] relative">
          <div className="relative" style={{ height: HOUR_PX * HOURS.length }}>
            {HOURS.map((h, i) => (
              <div
                key={h}
                className="absolute right-1 -mt-1.5 text-[11px] font-medium text-muted-foreground"
                style={{ top: i * HOUR_PX }}
              >
                {h}
              </div>
            ))}
          </div>
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
