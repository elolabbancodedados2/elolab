import { useMemo } from 'react';
import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Props {
  date: string;
  agendamentos: any[];
  colorFor: (a: any) => string;
  onDayClick: (day: string) => void;
  onCardClick: (a: any) => void;
}

export function WeeklyView({ date, agendamentos, colorFor, onDayClick, onCardClick }: Props) {
  const days = useMemo(() => {
    const start = startOfWeek(parseISO(date), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      return { iso: format(d, 'yyyy-MM-dd'), date: d };
    });
  }, [date]);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="grid grid-cols-7">
        {days.map(({ iso, date: d }) => {
          const dayAppts = agendamentos.filter(a => a.data === iso).sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
          const isToday = iso === format(new Date(), 'yyyy-MM-dd');
          return (
            <div key={iso} className="border-r border-border/60 last:border-r-0 min-h-[500px]">
              <button
                onClick={() => onDayClick(iso)}
                className={cn(
                  'w-full px-3 py-2 border-b border-border/60 text-left hover:bg-muted/40 transition-colors',
                  isToday && 'bg-primary/5'
                )}
              >
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {format(d, 'EEE', { locale: ptBR })}
                </div>
                <div className={cn('text-lg font-semibold', isToday && 'text-primary')}>
                  {format(d, 'd')}
                </div>
              </button>
              <div className="p-2 space-y-1">
                {dayAppts.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground/60 text-center py-4">Livre</div>
                ) : dayAppts.map(a => (
                  <button
                    key={a.id}
                    onClick={() => onCardClick(a)}
                    className="w-full rounded-md bg-card border border-border/60 hover:shadow-sm text-left px-2 py-1.5 text-[11px] transition-shadow"
                    style={{ borderLeft: `3px solid ${colorFor(a)}` }}
                  >
                    <div className="font-medium">{a.hora_inicio.slice(0, 5)}</div>
                    <div className="truncate text-muted-foreground">
                      {a.pacientes?.nome_social || a.pacientes?.nome || 'Paciente'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
