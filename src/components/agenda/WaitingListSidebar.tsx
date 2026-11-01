import type { ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarPlus, ChevronLeft, MessageCircle, Plus, Users } from '@/components/icons/elolabIcons';
import { cn } from '@/lib/utils';
import { linkWhatsApp } from '@/lib/whatsapp';
import { getPrioridadeListaEspera, ROTULO_STATUS_LISTA_ESPERA } from '@/lib/listaEsperaPrioridade';
import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';

interface Item {
  id: string;
  paciente_id: string;
  medico_id?: string | null;
  especialidade?: string | null;
  prioridade?: string | null;
  motivo?: string | null;
  preferencia_horario?: string | null;
  status: string;
  pacientes?: { nome?: string; nome_social?: string; telefone?: string };
}

interface Props {
  open: boolean;
  onToggle: () => void;
  items: Item[];
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Conteúdo exibido acima da lista de espera quando o painel está aberto. */
  topo?: ReactNode;
  /** Agenda sem arrastar: abre a nova consulta já com o pedido da lista. */
  onAgendar?: (item: Item) => void;
  /** Lista vazia: atalho para incluir alguém na lista de espera. */
  onAdicionar?: () => void;
}

function WaitingCard({ item, onAgendar }: { item: Item; onAgendar?: (item: Item) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `wait:${item.id}`,
    data: { waiting: item },
  });
  const paciente = item.pacientes;
  const prioridade = item.prioridade ? getPrioridadeListaEspera(item.prioridade) : null;
  const nome = paciente?.nome_social || paciente?.nome || 'Paciente';
  const whatsapp = linkWhatsApp(paciente?.telefone, `Olá, ${nome.split(' ')[0]}! Surgiu um horário na clínica. Podemos agendar sua consulta?`);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        'rounded-xl border border-border/60 bg-card p-3 cursor-grab active:cursor-grabbing shadow-xs hover:border-primary/40 hover:shadow-sm transition-all',
        isDragging && 'opacity-40'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{nome}</div>
          {paciente?.telefone && <div className="text-[11px] text-muted-foreground">{paciente.telefone}</div>}
        </div>
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Chamar ${nome} no WhatsApp`}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#25D366]/10 text-[#128C7E] transition hover:bg-[#128C7E] hover:text-white"
          >
            <MessageCircle className="h-4 w-4" />
          </a>
        )}
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {item.status && item.status !== 'aguardando' && (
          <Badge variant="outline" className="border-border bg-muted text-[10px] text-foreground">
            {ROTULO_STATUS_LISTA_ESPERA[item.status] ?? item.status}
          </Badge>
        )}
        {prioridade && (
          <Badge variant="outline" className={cn('text-[10px]', prioridade.className)}>
            {prioridade.label}
          </Badge>
        )}
        {item.especialidade && <Badge variant="outline" className="text-[10px]">{item.especialidade}</Badge>}
        {item.preferencia_horario && <Badge variant="outline" className="text-[10px]">{item.preferencia_horario}</Badge>}
      </div>
      {item.motivo && <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">{item.motivo}</p>}
      {onAgendar && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2 h-9 w-full gap-1.5 rounded-lg text-xs"
          aria-label={`Agendar ${nome}`}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onClick={() => onAgendar(item)}
        >
          <CalendarPlus aria-hidden="true" className="h-3.5 w-3.5" /> Agendar
        </Button>
      )}
    </div>
  );
}

export function WaitingListSidebar({ open, onToggle, items, isLoading = false, error, onRetry, topo, onAgendar, onAdicionar }: Props) {
  return (
    <div
      className={cn(
        'hidden shrink-0 border-l border-border bg-card transition-all duration-300 lg:block',
        open ? 'lg:w-80' : 'lg:w-11'
      )}
    >
      <div className="sticky top-0">
        {open && topo}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
          {open && (
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-primary" />
              Lista de espera
              <Badge variant="secondary" className="text-[10px]">{isLoading ? '…' : items.length}</Badge>
            </div>
          )}
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={open ? 'Recolher lista de espera' : 'Expandir lista de espera'} onClick={onToggle}>
            <ChevronLeft className={cn('h-4 w-4 transition-transform', !open && 'rotate-180')} />
          </Button>
        </div>
        {open && (
          <div className="p-2 space-y-2 max-h-[calc(100vh-180px)] overflow-y-auto">
            {error ? (
              <ErrorState compact title="Erro na lista de espera" error={error} onRetry={onRetry} />
            ) : isLoading ? (
              <div className="space-y-2" role="status" aria-label="Carregando lista de espera">
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
                <span className="sr-only">Carregando lista de espera...</span>
              </div>
            ) : items.length === 0 ? (
              <div className="space-y-3 px-2 py-6 text-center">
                <p className="text-xs text-muted-foreground">Ninguém aguardando vaga no momento.</p>
                {onAdicionar && (
                  <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5 rounded-lg text-xs" onClick={onAdicionar}>
                    <Plus aria-hidden="true" className="h-3.5 w-3.5" /> Adicionar paciente
                  </Button>
                )}
              </div>
            ) : (
              <>
                <p className="px-1 text-[11px] leading-snug text-muted-foreground">Arraste para um horário vago ou use “Agendar”.</p>
                {items.map(i => <WaitingCard key={i.id} item={i} onAgendar={onAgendar} />)}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
