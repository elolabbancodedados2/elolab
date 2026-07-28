import { useDraggable } from '@dnd-kit/core';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

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
}

function WaitingCard({ item }: { item: Item }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `wait:${item.id}`,
    data: { waiting: item },
  });
  const paciente = item.pacientes;
  const prioColor: Record<string, string> = {
    alta: 'bg-destructive/10 text-destructive border-destructive/20',
    media: 'bg-warning/10 text-warning border-warning/20',
    baixa: 'bg-muted text-muted-foreground border-border',
  };
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        'rounded-lg border border-border bg-card p-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow',
        isDragging && 'opacity-40'
      )}
    >
      <div className="text-sm font-medium truncate">{paciente?.nome_social || paciente?.nome || 'Paciente'}</div>
      {paciente?.telefone && <div className="text-[11px] text-muted-foreground">{paciente.telefone}</div>}
      <div className="flex flex-wrap gap-1 mt-2">
        {item.prioridade && (
          <Badge variant="outline" className={cn('text-[10px]', prioColor[item.prioridade])}>
            {item.prioridade}
          </Badge>
        )}
        {item.especialidade && <Badge variant="outline" className="text-[10px]">{item.especialidade}</Badge>}
        {item.preferencia_horario && <Badge variant="outline" className="text-[10px]">{item.preferencia_horario}</Badge>}
      </div>
      {item.motivo && <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">{item.motivo}</p>}
    </div>
  );
}

export function WaitingListSidebar({ open, onToggle, items }: Props) {
  return (
    <div
      className={cn(
        'shrink-0 border-l border-border bg-card/60 backdrop-blur transition-all duration-300',
        open ? 'w-72' : 'w-10'
      )}
    >
      <div className="sticky top-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
          {open && (
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-primary" />
              Lista de espera
              <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
            </div>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle}>
            <ChevronLeft className={cn('h-4 w-4 transition-transform', !open && 'rotate-180')} />
          </Button>
        </div>
        {open && (
          <div className="p-2 space-y-2 max-h-[calc(100vh-180px)] overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                Ninguém aguardando. Arraste um paciente da lista de espera para um horário vago para agendá-lo rapidamente.
              </p>
            ) : items.map(i => <WaitingCard key={i.id} item={i} />)}
          </div>
        )}
      </div>
    </div>
  );
}
