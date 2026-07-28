import { useMemo } from 'react';
import {
  addDays, eachDayOfInterval, endOfMonth, format, getDay, isSameMonth,
  parseISO, startOfMonth, startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
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
          <div key={d} className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map(d => {
          const iso = format(d, 'yyyy-MM-dd');
          const inMonth = isSameMonth(d, base);
          const dayAppts = agendamentos.filter(a => a.data === iso);
          const isToday = iso === today;
          return (
            <button
              key={iso}
              onClick={() => onDayClick(iso)}
              className={cn(
                'min-h-[110px] border-r border-b border-border/60 p-2 text-left hover:bg-muted/40 transition-colors',
                !inMonth && 'bg-muted/20 text-muted-foreground/60',
                isToday && 'bg-primary/5'
              )}
            >
              <div className={cn('text-sm font-semibold mb-1', isToday && 'text-primary')}>{format(d, 'd')}</div>
              <div className="space-y-0.5">
                {dayAppts.slice(0, 3).map(a => (
                  <div key={a.id} className="flex items-center gap-1 text-[10px] truncate">
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: colorFor(a) }} />
                    <span className="font-medium">{a.hora_inicio.slice(0, 5)}</span>
                    <span className="truncate text-muted-foreground">
                      {a.pacientes?.nome_social || a.pacientes?.nome || ''}
                    </span>
                  </div>
                ))}
                {dayAppts.length > 3 && (
                  <div className="text-[10px] text-primary font-medium">+{dayAppts.length - 3} mais</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
