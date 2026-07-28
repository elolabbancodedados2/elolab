import { useMemo } from 'react';
import {
  addDays, eachDayOfInterval, endOfMonth, format, getDay, isSameMonth, isWeekend,
  parseISO, startOfMonth, startOfWeek,
} from 'date-fns';
import { cn } from '@/lib/utils';

interface Props {
  date: string;
  agendamentos: any[];
  colorFor: (a: any) => string;
  onDayClick: (day: string) => void;
}

export function MonthlyView({ date, agendamentos, colorFor, onDayClick }: Props) {
  const days = useMemo(() => {
    const base = parseISO(date);
    const start = startOfWeek(startOfMonth(base), { weekStartsOn: 1 });
    const monthEnd = endOfMonth(base);
    const total = Math.ceil((monthEnd.getTime() - start.getTime()) / (86400 * 1000)) + (7 - getDay(monthEnd) || 0);
    return eachDayOfInterval({ start, end: addDays(start, Math.max(41, total)) }).slice(0, 42);
  }, [date]);

  const base = parseISO(date);
  const today = format(new Date(), 'yyyy-MM-dd');
  const dayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30">
        {dayLabels.map(d => (
          <div key={d} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map(d => {
          const iso = format(d, 'yyyy-MM-dd');
          const inMonth = isSameMonth(d, base);
          const dayAppts = agendamentos.filter(a => a.data === iso);
          const isToday = iso === today;
          const weekend = isWeekend(d);
          const confirmed = dayAppts.filter(a => a.status === 'confirmado').length;

          return (
            <button
              key={iso}
              onClick={() => onDayClick(iso)}
              className={cn(
                'min-h-[110px] border-r border-b border-border/60 p-2 text-left hover:bg-muted/40 transition-colors group',
                !inMonth && 'bg-muted/20 text-muted-foreground/50',
                weekend && inMonth && !isToday && 'bg-muted/10',
                isToday && 'bg-primary/[0.06] ring-1 ring-primary/30 ring-inset',
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <div className={cn(
                  'text-sm font-semibold flex items-center justify-center h-6 min-w-6 px-1 rounded-full',
                  isToday && 'bg-primary text-primary-foreground',
                )}>
                  {format(d, 'd')}
                </div>
                {dayAppts.length > 0 && (
                  <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                    {dayAppts.length}
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                {dayAppts.slice(0, 3).map(a => (
                  <div key={a.id} className="flex items-center gap-1 text-[10px] truncate">
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: colorFor(a) }} />
                    <span className="font-medium tabular-nums">{a.hora_inicio.slice(0, 5)}</span>
                    <span className="truncate text-muted-foreground">
                      {a.pacientes?.nome_social || a.pacientes?.nome || ''}
                    </span>
                  </div>
                ))}
                {dayAppts.length > 3 && (
                  <div className="text-[10px] text-primary font-medium">+{dayAppts.length - 3} mais</div>
                )}
              </div>
              {confirmed > 0 && dayAppts.length <= 3 && (
                <div className="mt-1 text-[9px] text-success">✓ {confirmed} conf.</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
