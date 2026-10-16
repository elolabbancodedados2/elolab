import { nomeMedico } from '@/lib/formatters';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Ban, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppointmentCard } from '../AppointmentCard';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';

function minutesNowInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const hour = Number(parts.find(part => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

const START_HOUR = 6;
const END_HOUR = 22;
// Fine-grained droppable slots (5min) so users can drop / click at any time.
const SLOT_MINUTES = 5;
const SLOT_PX = 7;
// Visual hour rows only (labels + strong borders every hour).
const HOUR_PX = (60 / SLOT_MINUTES) * SLOT_PX;
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;
// Fixed doctor header height (sticky strip above the grid).
const DOCTOR_HEADER_PX = 75;

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

// O cabeçalho dos profissionais fica numa faixa própria, fixa no topo do
// <main>: assim a grade não precisa de rolagem vertical própria (antes havia
// duas barras verticais aninhadas) e o cabeçalho continua visível.
const SLOT_LIVRE_MIN = 30;

/** Primeiro horário com 30 min livres a partir de `fromMin`, respeitando consultas e bloqueios. */
function proximaVagaLivre(agendamentos: any[], bloqueios: any[], fromMin: number): string | null {
  const ocupados = [
    ...agendamentos
      .filter((a: any) => a.status !== 'cancelado' && a.status !== 'faltou')
      .map((a: any) => {
        const ini = toMinutes(a.hora_inicio);
        return [ini, a.hora_fim ? toMinutes(a.hora_fim) : ini + 30] as const;
      }),
    ...bloqueios.map((b: any) => [
      b.hora_inicio ? toMinutes(b.hora_inicio) : START_HOUR * 60,
      b.hora_fim ? toMinutes(b.hora_fim) : END_HOUR * 60,
    ] as const),
  ];
  const inicio = Math.max(START_HOUR * 60, Math.ceil(fromMin / SLOT_MINUTES) * SLOT_MINUTES);
  for (let m = inicio; m + SLOT_LIVRE_MIN <= END_HOUR * 60; m += SLOT_MINUTES) {
    const fim = m + SLOT_LIVRE_MIN;
    if (!ocupados.some(([ini, end]) => ini < fim && end > m)) return fromMinutes(m);
  }
  return null;
}

const STATUS_SEM_RESERVA = new Set(['cancelado', 'faltou']);

function DoctorHeader({ medico, date, agendamentos, agendamentosDoDia, bloqueios = [], columnIndex, inactive = false, onSlotClick, expedienteMinutos }: any) {
  // `agendamentos` é a lista exibida (pode estar filtrada por status/busca);
  // `agendamentosDoDia` é a ocupação real da coluna, usada para "próximo",
  // vaga livre e ocupação — senão um filtro faria horários ocupados parecerem livres.
  const reais: any[] = (agendamentosDoDia ?? agendamentos).filter((a: any) => !STATUS_SEM_RESERVA.has(a.status));
  const sorted = [...reais].sort((a: any, b: any) => a.hora_inicio.localeCompare(b.hora_inicio));
  const total = agendamentos.length;
  const confirmed = agendamentos.filter((a: any) => ['confirmado', 'em_atendimento', 'finalizado'].includes(a.status)).length;
  const hoje = todaySaoPauloDateOnly();
  const nowMin = minutesNowInSaoPaulo();
  const isToday = date === hoje;
  const next = isToday ? sorted.find((a: any) => toMinutes(a.hora_inicio) >= nowMin) : sorted[0];
  const vagaLivre = inactive || date < hoje ? null : proximaVagaLivre(reais, bloqueios, isToday ? nowMin : START_HOUR * 60);
  const nomeExibido = nomeMedico(medico.nome || medico.crm);
  const minutosOcupados = reais.reduce((acc: number, a: any) => {
    const ini = toMinutes(a.hora_inicio);
    const fim = a.hora_fim ? toMinutes(a.hora_fim) : ini + 30;
    return acc + Math.max(0, fim - ini);
  }, 0);
  const ocupacao = expedienteMinutos > 0 ? Math.min(100, Math.round((minutosOcupados / expedienteMinutos) * 100)) : null;

  return (
    <div
      data-testid="agenda-doctor-header"
      className={cn(
        'flex-1 min-w-[240px] border-r border-border/60 last:border-r-0 px-3 py-2',
        columnIndex % 2 === 1 && 'bg-muted/[0.15]'
      )}
      style={{ height: DOCTOR_HEADER_PX }}
    >
      <div className="flex items-center gap-2">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-sm', inactive ? 'bg-muted-foreground/50' : 'bg-gradient-primary')}>
          <User className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{nomeExibido}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {inactive ? 'Inativo · sem novos horários' : medico.especialidade || 'Clínico Geral'}
          </div>
        </div>
        {total > 0 && (
          <div className="text-right shrink-0">
            <div className="text-xs font-semibold tabular-nums">{total}</div>
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">consultas</div>
          </div>
        )}
      </div>
      {ocupacao !== null && (
        <div className="mt-1 flex items-center gap-1.5" title={`${minutosOcupados} de ${expedienteMinutos} minutos do expediente ocupados`}>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`Ocupação de ${nomeExibido}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={ocupacao}>
            <div className={cn('h-full rounded-full', ocupacao >= 90 ? 'bg-destructive' : 'bg-gradient-primary')} style={{ width: `${ocupacao}%` }} />
          </div>
          <span className="shrink-0 text-[9px] font-semibold tabular-nums text-muted-foreground">{ocupacao}%</span>
        </div>
      )}
      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        {next ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-[#1080CA]" />
            <span>Próximo <span className="font-semibold tabular-nums text-foreground">{next.hora_inicio.slice(0, 5)}</span></span>
            {confirmed > 0 && <span className="text-success">✓ {confirmed}</span>}
          </>
        ) : (
          <span className="italic text-muted-foreground/60">{total === 0 ? 'Agenda livre' : 'Sem próximas consultas'}</span>
        )}
        {vagaLivre && onSlotClick && (
          <button
            type="button"
            onClick={() => onSlotClick(medico.id, vagaLivre)}
            aria-label={`Criar consulta na próxima vaga livre, ${vagaLivre}, com ${nomeExibido}`}
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#1080CA]/10 px-2 py-0.5 font-semibold text-[#1080CA] transition hover:bg-gradient-primary hover:text-white"
          >
            Livre <span className="tabular-nums">{vagaLivre}</span>
          </button>
        )}
      </div>
    </div>
  );
}

function DoctorColumn({
  medico, date, agendamentos, bloqueios, colorFor, onSlotClick, onCardClick, onNovaConsulta, convenioById, columnIndex, inactive = false,
}: any) {
  const minutesToPx = (m: number) => (m / SLOT_MINUTES) * SLOT_PX;
  const columnRef = useRef<HTMLDivElement>(null);
  const [hoverMin, setHoverMin] = useState<number | null>(null);

  return (
    <div className={cn(
      'flex-1 min-w-[240px] border-r border-border/60 last:border-r-0',
      columnIndex % 2 === 1 && 'bg-muted/[0.15]'
    )}>
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
            className="pointer-events-none absolute inset-x-0 border-t border-[#1080CA]/60 z-30"
            style={{ top: minutesToPx(hoverMin) }}
          >
            <span className="absolute -top-2 left-1 rounded bg-[#1080CA] px-1 py-0 text-[10px] font-medium text-white shadow">
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
        {!inactive && SLOTS.map((slot) => (
          <DropSlot
            key={slot}
            id={`slot:${medico.id}:${date}:${slot}`}
            data={{ medico_id: medico.id, data: date, hora_inicio: slot }}
            onClick={() => onSlotClick(medico.id, slot)}
            onKeyDown={(event: React.KeyboardEvent<HTMLButtonElement>) => {
              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
              const slots = Array.from(columnRef.current?.querySelectorAll<HTMLButtonElement>('[data-agenda-slot]') || []);
              const index = slots.indexOf(event.currentTarget);
              const next = slots[index + (event.key === 'ArrowDown' ? 1 : -1)];
              if (!next) return;
              event.preventDefault();
              next.focus();
            }}
            accessibleName={`Criar consulta ${slot} com ${nomeMedico(medico.nome || medico.crm)}`}
            // Uma única parada de Tab por profissional; setas percorrem os horários.
            tabStop={slot === SLOTS[0]}
            className="absolute inset-x-0 cursor-pointer border-0 bg-transparent p-0 hover:bg-[#1080CA]/5 focus-visible:z-30 focus-visible:bg-[#1080CA]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1080CA]"
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
            onNovaConsulta={onNovaConsulta}
            convenioName={convenioById?.[ag.pacientes?.convenio_id]?.nome}
          />
        ))}
      </div>
    </div>
  );
}

function DropSlot({ id, data, className, style, onClick, onKeyDown, accessibleName, tabStop }: any) {
  const { setNodeRef, isOver } = useDroppable({ id, data });
  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      onKeyDown={onKeyDown}
      aria-label={accessibleName}
      aria-haspopup="dialog"
      tabIndex={tabStop ? 0 : -1}
      data-agenda-slot="true"
      className={cn(className, isOver && 'bg-[#1080CA]/10 ring-1 ring-[#1080CA]/40 ring-inset')}
    />
  );
}

export function DailyMultiDoctorView({
  date, medicos, agendamentos, agendamentosDoDia, bloqueios, colorFor, onSlotClick, onCardClick, onNovaConsulta, convenioById, expedientePorMedico = {},
}: any) {
  const ocupacaoBase: any[] = agendamentosDoDia ?? agendamentos;
  const activeDoctors = useMemo(() => medicos.filter((m: any) => m.ativo !== false), [medicos]);
  // Keep existing bookings visible after a clinician is deactivated, but do not
  // expose empty slots that could create new appointments for that clinician.
  const inactiveDoctorsWithAppointments = useMemo(
    () => medicos.filter((m: any) => m.ativo === false && agendamentos.some((a: any) => a.medico_id === m.id)),
    [medicos, agendamentos],
  );
  const doctorsToShow = [
    ...activeDoctors.map((medico: any) => ({ medico, inactive: false })),
    ...inactiveDoctorsWithAppointments.map((medico: any) => ({ medico, inactive: true })),
  ];
  const dayStr = format(parseISO(date), "EEEE, d 'de' MMMM", { locale: ptBR })
    .replace(/^./u, (first) => first.toLocaleUpperCase('pt-BR'));
  const headerStripRef = useRef<HTMLDivElement>(null);
  const nowLineRef = useRef<HTMLDivElement>(null);
  const [nowMin, setNowMin] = useState<number>(minutesNowInSaoPaulo);
  const showNow = date === todaySaoPauloDateOnly();

  useEffect(() => {
    const t = setInterval(() => {
      setNowMin(minutesNowInSaoPaulo());
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  // A rolagem vertical pertence ao <main>; só trazemos a linha de "agora"
  // para a tela quando ela está fora da área visível.
  useEffect(() => {
    const line = nowLineRef.current;
    if (!showNow || !line) return;
    const rect = line.getBoundingClientRect();
    if (rect.top >= DOCTOR_HEADER_PX && rect.bottom <= window.innerHeight) return;
    line.scrollIntoView?.({ block: 'center', inline: 'nearest' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, showNow]);

  const nowPx = showNow && nowMin >= START_HOUR * 60 && nowMin <= END_HOUR * 60
    ? ((nowMin - START_HOUR * 60) / SLOT_MINUTES) * SLOT_PX
    : null;

  return (
    // overflow-clip recorta os cantos sem criar contêiner de rolagem, o que
    // manteria o cabeçalho sticky preso ao cartão em vez do <main>.
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-clip">
      <div className="px-4 py-2 border-b border-border/60 bg-muted/30">
        <div className="text-sm font-medium flex items-center gap-2">
          {dayStr}
          {showNow && <span className="rounded-full bg-gradient-primary px-2 py-0.5 text-[10px] font-bold text-white">agora {fromMinutes(nowMin)}</span>}
        </div>
      </div>
      {doctorsToShow.length > 0 && (
        <div className="sticky top-0 z-[45] flex bg-card/95 backdrop-blur border-b border-border/60">
          <div className="w-14 shrink-0 border-r border-border/60" />
          {/* Acompanha a rolagem horizontal da grade (sincronizada em onScroll). */}
          <div ref={headerStripRef} data-testid="agenda-doctor-header-strip" className="flex flex-1 min-w-0 overflow-hidden">
            {doctorsToShow.map(({ medico, inactive }: any, idx: number) => (
              <DoctorHeader
                key={medico.id}
                medico={medico}
                date={date}
                columnIndex={idx}
                inactive={inactive}
                agendamentos={agendamentos.filter((a: any) => a.medico_id === medico.id)}
                agendamentosDoDia={ocupacaoBase.filter((a: any) => a.medico_id === medico.id)}
                bloqueios={bloqueios.filter((b: any) => b.medico_id === medico.id && date >= b.data_inicio && date <= b.data_fim)}
                onSlotClick={onSlotClick}
                expedienteMinutos={expedientePorMedico[medico.id] ?? 0}
              />
            ))}
          </div>
        </div>
      )}
      {/* Só rola na horizontal: a altura acompanha o conteúdo, então não há
          uma segunda barra vertical dentro da página. */}
      <div
        data-testid="agenda-day-grid"
        className="flex overflow-x-auto overflow-y-hidden"
        onScroll={(e) => {
          if (headerStripRef.current) headerStripRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
      >
        <div data-testid="agenda-hour-axis" className="sticky left-0 z-[41] w-14 shrink-0 border-r border-border/60 bg-card">
          <div className="relative" style={{ height: HOUR_PX * HOURS.length }}>
            {HOURS.map((h, i) => (
              <div
                key={h}
                className={cn('absolute right-1 text-[11px] font-medium text-muted-foreground', i > 0 && '-mt-1.5')}
                style={{ top: i * HOUR_PX }}
              >
                {h}
              </div>
            ))}
          </div>
        </div>
        {doctorsToShow.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-16 text-sm text-muted-foreground">
            Nenhum médico ativo. Cadastre médicos em <span className="mx-1 font-medium">Equipe</span> para começar.
          </div>
        ) : (
          <div className="relative flex flex-1">
            {nowPx !== null && (
              <div
                ref={nowLineRef}
                data-testid="agenda-now-line"
                className="pointer-events-none absolute inset-x-0 z-40 border-t-2 border-[#1080CA]"
                style={{ top: nowPx }}
              >
                <span className="absolute -top-2 left-0 h-3 w-3 rounded-full bg-gradient-primary shadow ring-2 ring-white" />
              </div>
            )}
            {doctorsToShow.map(({ medico, inactive }: any, idx: number) => (
              <DoctorColumn
                key={medico.id}
                medico={medico}
                date={date}
                columnIndex={idx}
                inactive={inactive}
                agendamentos={agendamentos.filter((a: any) => a.medico_id === medico.id)}
                bloqueios={bloqueios.filter((b: any) => b.medico_id === medico.id && date >= b.data_inicio && date <= b.data_fim)}
                colorFor={colorFor}
                convenioById={convenioById}
                onSlotClick={onSlotClick}
                onCardClick={onCardClick}
                onNovaConsulta={onNovaConsulta}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
