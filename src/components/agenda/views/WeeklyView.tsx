import { nomeMedico } from '@/lib/formatters';
import { useMemo, type ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { podeRemarcarAgendamento } from '@/lib/appointmentStatus';
import { addDays, format, isWeekend, parseISO, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { Ban } from 'lucide-react';
import { bloqueiosDoDia, contaNaAgenda, rotuloBloqueio } from './resumoDiaAgenda';

interface Props {
  date: string;
  agendamentos: any[];
  colorFor: (a: any) => string;
  medicoById?: Record<string, any>;
  onDayClick: (day: string) => void;
  onCardClick: (a: any) => void;
  /** Bloqueios do período; o dia bloqueado mostra "Bloqueado: motivo". */
  bloqueios?: any[];
  /** Médicos em exibição; limita quais bloqueios aparecem. */
  medicosVisiveis?: string[];
}

/** Coluna do dia que recebe uma consulta arrastada de outro dia da semana. */
function DiaSoltavel({ iso, rotulo, children }: { iso: string; rotulo: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `semana:${iso}`, data: { semana: true, data: iso } });
  return (
    <div
      ref={setNodeRef}
      aria-label={`Consultas de ${rotulo}`}
      className={cn('flex-1 p-1.5 space-y-1 overflow-y-auto max-h-[520px]', isOver && 'bg-primary/5 ring-1 ring-inset ring-primary/30')}
    >
      {children}
    </div>
  );
}

function CartaoSemana({ agendamento: a, cor, medicoById, onClick }: { agendamento: any; cor: string; medicoById: Record<string, any>; onClick: () => void }) {
  const movel = podeRemarcarAgendamento(a.status);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `semana-ag:${a.id}`,
    data: { agendamento: a },
    disabled: !movel,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onKeyDown={(e) => {
        // Enter abre a consulta; Espaço pega o cartão para levá-lo a outro dia.
        if (e.key === 'Enter' && !isDragging) { e.preventDefault(); onClick(); return; }
        listeners?.onKeyDown?.(e);
      }}
      aria-roledescription="consulta"
      aria-label={`Consulta de ${a.pacientes?.nome_social || a.pacientes?.nome || 'Paciente'} às ${a.hora_inicio.slice(0, 5)}`}
      className={cn(
        'w-full rounded-lg bg-card border border-border/60 hover:shadow-sm hover:border-primary/40 text-left px-2 py-1.5 text-[11px] transition-all leading-tight',
        movel && 'cursor-grab active:cursor-grabbing',
        !contaNaAgenda(a) && 'opacity-50 line-through',
        isDragging && 'opacity-40',
      )}
      style={{ borderLeft: `3px solid ${cor}`, transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }}
    >
      <div className="font-medium tabular-nums">{a.hora_inicio.slice(0, 5)}</div>
      <div className="truncate text-muted-foreground">
        {a.pacientes?.nome_social || a.pacientes?.nome || 'Paciente'}
      </div>
      {medicoById[a.medico_id] && (
        <div className="truncate text-[10px] text-muted-foreground/80 mt-0.5">
          {nomeMedico(medicoById[a.medico_id].nome || medicoById[a.medico_id].crm)}
        </div>
      )}
    </button>
  );
}

export function WeeklyView({ date, agendamentos, colorFor, medicoById = {}, onDayClick, onCardClick, bloqueios = [], medicosVisiveis }: Props) {
  const days = useMemo(() => {
    const start = startOfWeek(parseISO(date), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      return { iso: format(d, 'yyyy-MM-dd'), date: d };
    });
  }, [date]);

  const today = todaySaoPauloDateOnly();
  const mostrarMedicoNoBloqueio = (medicosVisiveis?.length ?? 2) !== 1;

  return (
    <>
    {/* Abaixo de sm a grade de 7 colunas não cabe: vira uma lista por dia. */}
    <div role="region" aria-label="Agenda semanal em lista" className="space-y-2 sm:hidden">
      {days.map(({ iso, date: d }) => {
        const dayAppts = agendamentos.filter(a => a.data === iso).sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
        const ativos = dayAppts.filter(contaNaAgenda);
        const bloqueiosDia = bloqueiosDoDia(bloqueios, iso, medicosVisiveis);
        const isToday = iso === today;
        return (
          <section key={iso} className={cn('rounded-2xl border border-border bg-card shadow-sm', isToday && 'border-primary/50')}>
            <button
              type="button"
              onClick={() => onDayClick(iso)}
              className="flex min-h-11 w-full items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-left"
            >
              <span className={cn('text-sm font-semibold capitalize', isToday && 'text-primary')}>
                {format(d, "EEEE, d 'de' MMM", { locale: ptBR })}{isToday ? ' · hoje' : ''}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {ativos.length === 0 ? 'Livre' : `${ativos.length} consulta${ativos.length === 1 ? '' : 's'}`}
              </span>
            </button>
            {bloqueiosDia.map((b, i) => (
              <p key={b.id ?? i} className="flex items-center gap-1 px-3 pt-2 text-xs text-muted-foreground">
                <Ban aria-hidden="true" className="h-3 w-3 shrink-0" />
                <span className="truncate">{rotuloBloqueio(b, medicoById, mostrarMedicoNoBloqueio)}</span>
              </p>
            ))}
            {dayAppts.length > 0 && (
              <ul className="space-y-1 p-2">
                {dayAppts.map(a => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => onCardClick(a)}
                      className={cn(
                        'flex min-h-11 w-full items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2 text-left text-sm',
                        !contaNaAgenda(a) && 'opacity-50 line-through',
                      )}
                      style={{ borderLeft: `3px solid ${colorFor(a)}` }}
                    >
                      <span className="font-medium tabular-nums">{a.hora_inicio.slice(0, 5)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{a.pacientes?.nome_social || a.pacientes?.nome || 'Paciente'}</span>
                        {medicoById[a.medico_id] && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {nomeMedico(medicoById[a.medico_id].nome || medicoById[a.medico_id].crm)}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
    <div role="region" aria-label="Agenda semanal, deslize horizontal para ver os dias" tabIndex={0} className="hidden overflow-x-auto rounded-2xl border border-border bg-card shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:block">
      <div className="min-w-[770px]">
      <div className="grid grid-cols-7">
        {days.map(({ iso, date: d }) => {
          const dayAppts = agendamentos.filter(a => a.data === iso).sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
          const ativos = dayAppts.filter(contaNaAgenda);
          const bloqueiosDia = bloqueiosDoDia(bloqueios, iso, medicosVisiveis);
          const isToday = iso === today;
          const weekend = isWeekend(d);
          const confirmedCount = ativos.filter(a => a.status === 'confirmado' || a.status === 'em_atendimento' || a.status === 'finalizado').length;

          return (
            <div key={iso} className={cn(
              'border-r border-border/60 last:border-r-0 min-h-[520px] flex flex-col',
              weekend && !isToday && 'bg-muted/10',
              isToday && 'bg-primary/[0.04]',
            )}>
              <button
                onClick={() => onDayClick(iso)}
                className={cn(
                  'sticky top-0 z-10 w-full px-3 py-2.5 border-b border-border/60 text-left bg-card/95 backdrop-blur hover:bg-muted/40 transition-colors',
                  isToday && 'border-b-2 border-b-primary',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold leading-none',
                      isToday ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground',
                    )}>{format(d, 'd')}</span>
                    <div>
                      <div className={cn(
                        'text-[10px] uppercase tracking-wide',
                        isToday ? 'font-semibold text-primary' : 'text-muted-foreground',
                      )}>
                        {format(d, 'EEE', { locale: ptBR })}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{format(d, 'MMM', { locale: ptBR })}</div>
                    </div>
                  </div>
                  {ativos.length > 0 && (
                    <Badge variant="secondary" className={cn('h-5 px-1.5 text-[10px]', isToday && 'bg-primary text-primary-foreground')}>
                      {ativos.length}
                    </Badge>
                  )}
                </div>
                {ativos.length > 0 && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="tabular-nums">{ativos[0].hora_inicio.slice(0, 5)}</span>
                    <span>→</span>
                    <span className="tabular-nums">{ativos[ativos.length - 1].hora_inicio.slice(0, 5)}</span>
                    {confirmedCount > 0 && <span className="ml-auto text-success">✓ {confirmedCount}</span>}
                  </div>
                )}
                {bloqueiosDia.map((b, i) => (
                  <div key={b.id ?? i} className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground" title={rotuloBloqueio(b, medicoById, mostrarMedicoNoBloqueio)}>
                    <Ban aria-hidden="true" className="h-3 w-3 shrink-0" />
                    <span className="truncate">{rotuloBloqueio(b, medicoById, mostrarMedicoNoBloqueio)}</span>
                  </div>
                ))}
              </button>
              <DiaSoltavel iso={iso} rotulo={format(d, "EEEE, d 'de' MMM", { locale: ptBR })}>
                {dayAppts.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground/50 text-center py-8 italic">{bloqueiosDia.length > 0 ? 'Sem consultas' : 'Livre'}</div>
                ) : dayAppts.map(a => (
                  <CartaoSemana key={a.id} agendamento={a} cor={colorFor(a)} medicoById={medicoById} onClick={() => onCardClick(a)} />
                ))}
              </DiaSoltavel>
            </div>
          );
        })}
      </div>
      </div>
    </div>
    </>
  );
}
