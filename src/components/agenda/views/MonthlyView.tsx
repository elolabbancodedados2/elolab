import { nomeMedico, primeiroNome } from '@/lib/formatters';
import { useMemo } from 'react';
import {
  addDays, eachDayOfInterval, endOfMonth, format, getDay, isSameMonth, isWeekend,
  parseISO, startOfMonth, startOfWeek,
} from 'date-fns';
import { cn } from '@/lib/utils';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { ptBR } from 'date-fns/locale';
import { Ban } from 'lucide-react';
import { bloqueiosDoDia, contaNaAgenda, rotuloBloqueio } from './resumoDiaAgenda';

interface Props {
  date: string;
  agendamentos: any[];
  colorFor: (a: any) => string;
  medicoById?: Record<string, any>;
  onDayClick: (day: string) => void;
  /** Bloqueios do período; o dia bloqueado mostra "Bloqueado: motivo". */
  bloqueios?: any[];
  /** Médicos em exibição; limita quais bloqueios aparecem. */
  medicosVisiveis?: string[];
}

export function MonthlyView({ date, agendamentos, colorFor, medicoById = {}, onDayClick, bloqueios = [], medicosVisiveis }: Props) {
  const days = useMemo(() => {
    const base = parseISO(date);
    const start = startOfWeek(startOfMonth(base), { weekStartsOn: 1 });
    const monthEnd = endOfMonth(base);
    const total = Math.ceil((monthEnd.getTime() - start.getTime()) / (86400 * 1000)) + (7 - getDay(monthEnd) || 0);
    return eachDayOfInterval({ start, end: addDays(start, Math.max(41, total)) }).slice(0, 42);
  }, [date]);

  const base = parseISO(date);
  const today = todaySaoPauloDateOnly();
  const dayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const mostrarMedicoNoBloqueio = (medicosVisiveis?.length ?? 2) !== 1;
  // Lista do celular: só os dias do mês com consultas ou bloqueios.
  const diasDaLista = days
    .filter(d => isSameMonth(d, base))
    .map(d => {
      const iso = format(d, 'yyyy-MM-dd');
      return {
        iso,
        date: d,
        ativos: agendamentos.filter(a => a.data === iso && contaNaAgenda(a)).sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio)),
        bloqueios: bloqueiosDoDia(bloqueios, iso, medicosVisiveis),
      };
    })
    .filter(dia => dia.ativos.length > 0 || dia.bloqueios.length > 0);

  return (
    <>
    {/* Abaixo de sm a grade de 7 colunas não cabe: vira uma lista por dia. */}
    <div role="region" aria-label="Agenda mensal em lista" className="space-y-2 sm:hidden">
      {diasDaLista.length === 0 && (
        <p className="rounded-2xl border border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma consulta ou bloqueio neste mês.</p>
      )}
      {diasDaLista.map(dia => (
        <button
          key={dia.iso}
          type="button"
          onClick={() => onDayClick(dia.iso)}
          className={cn('block min-h-11 w-full rounded-2xl border border-border bg-card px-3 py-2 text-left shadow-sm', dia.iso === today && 'border-primary/50')}
        >
          <span className="flex items-center justify-between gap-2">
            <span className={cn('text-sm font-semibold capitalize', dia.iso === today && 'text-primary')}>
              {format(dia.date, "EEEE, d 'de' MMM", { locale: ptBR })}{dia.iso === today ? ' · hoje' : ''}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {dia.ativos.length === 0 ? 'Sem consultas' : `${dia.ativos.length} consulta${dia.ativos.length === 1 ? '' : 's'}`}
            </span>
          </span>
          {dia.bloqueios.map((b, i) => (
            <span key={b.id ?? i} className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Ban aria-hidden="true" className="h-3 w-3 shrink-0" />
              <span className="truncate">{rotuloBloqueio(b, medicoById, mostrarMedicoNoBloqueio)}</span>
            </span>
          ))}
          {dia.ativos.length > 0 && (
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              {dia.ativos.slice(0, 3).map(a => `${a.hora_inicio.slice(0, 5)} ${a.pacientes?.nome_social || a.pacientes?.nome || 'Paciente'}`).join(' · ')}
              {dia.ativos.length > 3 ? ` · +${dia.ativos.length - 3}` : ''}
            </span>
          )}
        </button>
      ))}
    </div>
    <div role="region" aria-label="Agenda mensal, deslize horizontal para ver a grade" tabIndex={0} className="hidden overflow-x-auto rounded-2xl border border-border bg-card shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:block">
      <div className="min-w-[770px]">
      <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30">
        {dayLabels.map(d => (
          <div key={d} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map(d => {
          const iso = format(d, 'yyyy-MM-dd');
          const inMonth = isSameMonth(d, base);
          const dayAppts = agendamentos.filter(a => a.data === iso && contaNaAgenda(a));
          const bloqueiosDia = bloqueiosDoDia(bloqueios, iso, medicosVisiveis);
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
                isToday && 'bg-primary/[0.05] ring-1 ring-primary/40 ring-inset',
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <div className={cn(
                  'text-sm font-semibold flex items-center justify-center h-6 min-w-6 px-1 rounded-full',
                  isToday && 'bg-primary text-primary-foreground shadow-sm',
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
                {bloqueiosDia.length > 0 && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground" title={bloqueiosDia.map(b => rotuloBloqueio(b, medicoById, mostrarMedicoNoBloqueio)).join('\n')}>
                    <Ban aria-hidden="true" className="h-3 w-3 shrink-0" />
                    <span className="truncate">{rotuloBloqueio(bloqueiosDia[0], medicoById, mostrarMedicoNoBloqueio)}{bloqueiosDia.length > 1 ? ` +${bloqueiosDia.length - 1}` : ''}</span>
                  </div>
                )}
                {dayAppts.slice(0, 3).map(a => (
                  <div key={a.id} className="flex items-center gap-1 text-[10px] truncate">
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: colorFor(a) }} />
                    <span className="font-medium tabular-nums">{a.hora_inicio.slice(0, 5)}</span>
                    <span className="truncate text-muted-foreground">
                      {a.pacientes?.nome_social || a.pacientes?.nome || ''}
                      {medicoById[a.medico_id] && (
                        <span className="text-muted-foreground/60"> · {nomeMedico(primeiroNome(medicoById[a.medico_id].nome) || medicoById[a.medico_id].crm)}</span>
                      )}
                    </span>
                  </div>
                ))}
                {dayAppts.length > 3 && (
                  <div className="text-[10px] font-semibold text-primary">+{dayAppts.length - 3} mais</div>
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
    </div>
    </>
  );
}
