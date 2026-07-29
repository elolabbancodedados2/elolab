import { useMemo } from 'react';
import { addDays, format, isWeekend, parseISO, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface Props {
  date: string;
  agendamentos: any[];
  colorFor: (a: any) => string;
  medicoById?: Record<string, any>;
  onDayClick: (day: string) => void;
  onCardClick: (a: any) => void;
}

export function WeeklyView({ date, agendamentos, colorFor, medicoById = {}, onDayClick, onCardClick }: Props) {
  const days = useMemo(() => {
    const start = startOfWeek(parseISO(date), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      return { iso: format(d, 'yyyy-MM-dd'), date: d };
    });
  }, [date]);

  const today = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="grid grid-cols-7">
        {days.map(({ iso, date: d }) => {
          const dayAppts = agendamentos.filter(a => a.data === iso).sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
          const isToday = iso === today;
          const weekend = isWeekend(d);
          const confirmedCount = dayAppts.filter(a => a.status === 'confirmado' || a.status === 'em_atendimento' || a.status === 'finalizado').length;

          return (
            <div key={iso} className={cn(
              'border-r border-border/60 last:border-r-0 min-h-[520px] flex flex-col',
              weekend && !isToday && 'bg-muted/10',
              isToday && 'bg-primary/[0.03]',
            )}>
              <button
                onClick={() => onDayClick(iso)}
                className={cn(
                  'sticky top-0 z-10 w-full px-3 py-2.5 border-b border-border/60 text-left bg-card/95 backdrop-blur hover:bg-muted/40 transition-colors',
                  isToday && 'bg-primary/10 hover:bg-primary/15',
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className={cn(
                      'text-[10px] uppercase tracking-wide',
                      isToday ? 'text-primary font-semibold' : 'text-muted-foreground',
                    )}>
                      {format(d, 'EEE', { locale: ptBR })}
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className={cn(
                        'text-2xl font-bold leading-none',
                        isToday && 'text-primary',
                      )}>{format(d, 'd')}</span>
                      <span className="text-[10px] text-muted-foreground">{format(d, 'MMM', { locale: ptBR })}</span>
                    </div>
                  </div>
                  {dayAppts.length > 0 && (
                    <Badge variant={isToday ? 'default' : 'secondary'} className="h-5 px-1.5 text-[10px]">
                      {dayAppts.length}
                    </Badge>
                  )}
                </div>
                {dayAppts.length > 0 && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="tabular-nums">{dayAppts[0].hora_inicio.slice(0, 5)}</span>
                    <span>→</span>
                    <span className="tabular-nums">{dayAppts[dayAppts.length - 1].hora_inicio.slice(0, 5)}</span>
                    {confirmedCount > 0 && <span className="ml-auto text-success">✓ {confirmedCount}</span>}
                  </div>
                )}
              </button>
              <div className="flex-1 p-1.5 space-y-1 overflow-y-auto max-h-[520px]">
                {dayAppts.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground/50 text-center py-8 italic">Livre</div>
                ) : dayAppts.map(a => (
                  <button
                    key={a.id}
                    onClick={(e) => { e.stopPropagation(); onCardClick(a); }}
                    className={cn(
                      'w-full rounded-md bg-card border border-border/60 hover:shadow-sm hover:border-primary/40 text-left px-2 py-1.5 text-[11px] transition-all leading-tight',
                      a.status === 'cancelado' && 'opacity-50 line-through',
                    )}
                    style={{ borderLeft: `3px solid ${colorFor(a)}` }}
                  >
                    <div className="font-medium tabular-nums">{a.hora_inicio.slice(0, 5)}</div>
                    <div className="truncate text-muted-foreground">
                      {a.pacientes?.nome_social || a.pacientes?.nome || 'Paciente'}
                    </div>
                    {medicoById[a.medico_id] && (
                      <div className="truncate text-[10px] text-muted-foreground/80 mt-0.5">
                        Dr(a). {medicoById[a.medico_id].nome || medicoById[a.medico_id].crm}
                      </div>
                    )}
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
