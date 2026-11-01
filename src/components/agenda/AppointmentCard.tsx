import { Fragment } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { MoreHorizontal } from '@/components/icons/elolabIcons';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { podeRemarcarAgendamento } from '@/lib/appointmentStatus';
import { eAgendamentoOnline } from './agendaStatus';
import { useAcoesConsulta, type AcaoConsulta } from './useAcoesConsulta';

interface Props {
  agendamento: any;
  color: string;
  slotHeight: number;
  minutesToPx: (m: number) => number;
  onClick: () => void;
  convenioName?: string;
  /** Abre o formulário de nova consulta já preenchido (retorno, duplicar). */
  onNovaConsulta?: (initial: any) => void;
  /** Remarcar de verdade: nova consulta e cancelamento da original ao salvar. */
  onRemarcar?: (agendamento: any) => void;
}

const STATUS_LABEL: Record<string, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  aguardando: 'Aguardando',
  em_atendimento: 'Em atendimento',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
  faltou: 'Faltou',
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pago',
  atendimento_finalizado: 'Atendimento finalizado',
  aguardando_pagamento_adicional: 'Falta pagar o adicional',
};

const STATUS_DOT: Record<string, string> = {
  agendado: 'bg-primary',
  confirmado: 'bg-success',
  aguardando: 'bg-warning',
  em_atendimento: 'bg-primary animate-pulse',
  finalizado: 'bg-muted-foreground/30',
  cancelado: 'bg-destructive/70',
  faltou: 'bg-warning/70',
  aguardando_pagamento: 'bg-warning',
  pago: 'bg-success',
  atendimento_finalizado: 'bg-muted-foreground/30',
  aguardando_pagamento_adicional: 'bg-destructive',
};

function initials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '')).toUpperCase();
}

function toMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

const TIPO_LABEL: Record<string, string> = {
  consulta: 'Consulta', retorno: 'Retorno', exame: 'Exame', procedimento: 'Procedimento',
  checkup: 'Check-up', avaliacao: 'Avaliação', cirurgia: 'Cirurgia',
  telemedicina: 'Teleconsulta',
  triagem: 'Triagem', coleta: 'Coleta', enfermagem: 'Enfermagem', vacina: 'Vacina', curativo: 'Curativo',
};

const TOM_ACAO: Record<NonNullable<AcaoConsulta['tone']>, string> = {
  warning: 'text-warning-foreground',
  destructive: 'text-destructive',
  primary: '',
};

/** Renderiza a mesma lista de ações no menu de contexto e no menu "⋯". */
function ItensDeAcao({ acoes, Item, Separador }: {
  acoes: AcaoConsulta[];
  Item: typeof ContextMenuItem | typeof DropdownMenuItem;
  Separador: typeof ContextMenuSeparator | typeof DropdownMenuSeparator;
}) {
  return (
    <>
      {acoes.map((acao, i) => {
        const Icone = acao.icon;
        const novoGrupo = i > 0 && acoes[i - 1].grupo !== acao.grupo;
        return (
          <Fragment key={acao.id}>
            {novoGrupo && <Separador />}
            <Item disabled={acao.disabled} title={acao.title} onSelect={acao.onSelect} className={acao.tone ? TOM_ACAO[acao.tone] : undefined}>
              {Icone ? <Icone className="mr-2 h-4 w-4" /> : <span className="mr-2 inline-block w-4" aria-hidden="true" />}
              {acao.label}
              {acao.hint && <span className="ml-auto pl-3 text-xs text-muted-foreground">{acao.hint}</span>}
            </Item>
          </Fragment>
        );
      })}
    </>
  );
}

export function AppointmentCard({ agendamento, color, minutesToPx, onClick, convenioName, onNovaConsulta, onRemarcar }: Props) {
  const movable = podeRemarcarAgendamento(agendamento.status);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `ag:${agendamento.id}`,
    data: { agendamento },
    disabled: !movable,
  });
  const { acoes, dialogos } = useAcoesConsulta(agendamento, { onAbrir: onClick, onNovaConsulta, onRemarcar });

  const start = toMinutes(agendamento.hora_inicio);
  const end = agendamento.hora_fim ? toMinutes(agendamento.hora_fim) : start + 30;
  const duration = Math.max(15, end - start);
  const paciente = agendamento.pacientes;
  const patientName = paciente?.nome_social || paciente?.nome || 'Paciente';
  const cancelled = agendamento.status === 'cancelado';
  const done = agendamento.status === 'finalizado';
  const tipoLabel = TIPO_LABEL[agendamento.tipo as string] || agendamento.tipo;
  const statusLabel = STATUS_LABEL[agendamento.status] || agendamento.status;
  // Cards de 15/20 min têm menos de 30px: horário e paciente vão numa linha só.
  const compact = duration < 30;
  const horaInicio = agendamento.hora_inicio.slice(0, 5);
  const horaFim = agendamento.hora_fim?.slice(0, 5);

  const accessibleName = [
    `Consulta de ${patientName}`,
    horaFim ? `${horaInicio} às ${horaFim}` : `às ${horaInicio}`,
    tipoLabel,
    convenioName,
    statusLabel,
  ].filter(Boolean).join(', ');

  // O contêiner posiciona e move o cartão; o botão "⋯" fica ao lado do
  // cartão arrastável (e não dentro dele) para não aninhar controles.
  const posicao: React.CSSProperties = {
    position: 'absolute',
    top: minutesToPx(start - toMinutes('06:00')),
    height: minutesToPx(duration) - 4,
    left: 3,
    right: 3,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 10,
  };

  return (
    <div style={posicao} className="group/card">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={setNodeRef}
            style={{ borderLeft: `4px solid ${color}`, borderLeftColor: color }}
            {...attributes}
            {...listeners}
            aria-roledescription="consulta"
            aria-label={accessibleName}
            data-agendamento-id={agendamento.id}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            onKeyDown={(e) => {
              // Enter abre a consulta; Espaço continua com o sensor de arraste.
              // Durante o arraste por teclado, Enter apenas solta o card.
              if (e.key === 'Enter' && !e.repeat && !isDragging) {
                e.preventDefault();
                e.stopPropagation();
                onClick();
                return;
              }
              listeners?.onKeyDown?.(e);
            }}
            className={cn(
              'h-full w-full rounded-lg bg-card shadow-xs border border-l-[3px] border-border/60 hover:shadow-md hover:border-primary/40',
              'cursor-grab active:cursor-grabbing overflow-hidden transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              compact ? 'px-1.5 py-0 pr-7 text-[11px] leading-none' : 'px-1.5 py-1 pr-7 text-xs',
              cancelled && 'opacity-60 line-through',
              done && 'opacity-70',
            )}
          >
            {compact ? (
              <div className="flex h-full min-w-0 items-center gap-1" title={`${horaInicio} · ${patientName}`}>
                <span className="shrink-0 tabular-nums font-medium text-foreground">{horaInicio}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{patientName}</span>
                <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', STATUS_DOT[agendamento.status] || 'bg-muted')} />
              </div>
            ) : (
              <div className="flex items-start gap-1.5 min-w-0">
                <div
                  data-testid="appointment-color-marker"
                  className="shrink-0 h-6 w-6 rounded-full border-2 bg-muted text-foreground flex items-center justify-center text-[10px] font-semibold"
                  style={{ borderColor: color }}
                  title={patientName}
                >
                  {initials(patientName)}
                </div>
                <div className="flex-1 min-w-0 leading-tight">
                  <div className="flex items-center gap-1 font-medium text-foreground truncate">
                    <span className="tabular-nums">{horaInicio}</span>
                    {agendamento.hora_fim && duration >= 30 && (
                      <span className="text-muted-foreground text-[10px]">–{agendamento.hora_fim.slice(0, 5)}</span>
                    )}
                    {eAgendamentoOnline(agendamento) && agendamento.status === 'agendado' && (
                      <span className="ml-1 shrink-0 rounded border border-border bg-muted px-1 text-[9px] font-semibold uppercase text-foreground" title="Marcado pelo paciente no link online — confirme com ele">
                        Online
                      </span>
                    )}
                    <span className={cn('ml-auto h-1.5 w-1.5 rounded-full shrink-0', STATUS_DOT[agendamento.status] || 'bg-muted')} />
                  </div>
                  <div className="truncate text-[11px]">{patientName}</div>
                  {duration >= 30 && (tipoLabel || convenioName) && (
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground truncate">
                      {tipoLabel && <span className="truncate">{tipoLabel}</span>}
                      {tipoLabel && convenioName && <span className="text-muted-foreground/40">·</span>}
                      {convenioName && <span className="truncate">{convenioName}</span>}
                    </div>
                  )}
                  {duration >= 60 && (
                    <div className="mt-0.5 text-[10px] text-muted-foreground/70 truncate">
                      {statusLabel}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent data-elo-font-preview="agenda" className="w-60">
          <ItensDeAcao acoes={acoes} Item={ContextMenuItem} Separador={ContextMenuSeparator} />
        </ContextMenuContent>
      </ContextMenu>
      {/* Sem botão direito (trackpad, tablet), as ações ficam no "⋯". */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Ações da consulta de ${patientName} às ${horaInicio}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'absolute right-0.5 top-0.5 z-20 flex h-6 w-6 items-center justify-center rounded-md bg-card/90 text-muted-foreground',
              'opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              'group-hover/card:opacity-100 group-focus-within/card:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100',
            )}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent data-elo-font-preview="agenda" align="end" className="w-60">
          <ItensDeAcao acoes={acoes} Item={DropdownMenuItem} Separador={DropdownMenuSeparator} />
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogos}
    </div>
  );
}
