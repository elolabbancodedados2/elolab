import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Clock, User, CheckCircle2, PlayCircle, Ban, Trash2, Edit3 } from 'lucide-react';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  agendamento: any;
  color: string;
  slotHeight: number;
  minutesToPx: (m: number) => number;
  onClick: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  aguardando: 'Aguardando',
  em_atendimento: 'Em atendimento',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
  faltou: 'Faltou',
};

function toMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function AppointmentCard({ agendamento, color, minutesToPx, onClick }: Props) {
  const queryClient = useQueryClient();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `ag:${agendamento.id}`,
    data: { agendamento },
  });

  const start = toMinutes(agendamento.hora_inicio);
  const end = agendamento.hora_fim ? toMinutes(agendamento.hora_fim) : start + 30;
  const duration = Math.max(15, end - start);
  const paciente = agendamento.pacientes;

  const style: React.CSSProperties = {
    position: 'absolute',
    top: minutesToPx(start - toMinutes('06:00')),
    height: minutesToPx(duration) - 4,
    left: 4,
    right: 4,
    borderLeft: `4px solid ${color}`,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 10,
  };

  const setStatus = async (status: string) => {
    const { error } = await (supabase.from('agendamentos').update({ status }).eq('id', agendamento.id) as any);
    if (error) return toast.error('Erro ao atualizar');
    toast.success('Status atualizado');
    queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
  };
  const remove = async () => {
    if (!confirm('Remover esta consulta?')) return;
    const { error } = await (supabase.from('agendamentos').delete().eq('id', agendamento.id) as any);
    if (error) return toast.error('Erro ao remover');
    toast.success('Consulta removida');
    queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        'rounded-md bg-card shadow-sm border border-border/60 hover:shadow-md',
        'cursor-grab active:cursor-grabbing overflow-hidden transition-shadow',
        'px-2 py-1.5 text-xs'
      )}
    >
      <div className="flex items-center gap-1 font-medium text-foreground truncate">
        <Clock className="h-3 w-3 shrink-0" style={{ color }} />
        <span>{agendamento.hora_inicio.slice(0, 5)}</span>
        {agendamento.hora_fim && <span className="text-muted-foreground">–{agendamento.hora_fim.slice(0, 5)}</span>}
      </div>
      <div className="flex items-center gap-1 mt-0.5 truncate">
        <User className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="truncate">{paciente?.nome_social || paciente?.nome || 'Paciente'}</span>
      </div>
      {duration >= 45 && (
        <div className="mt-1 text-[10px] text-muted-foreground truncate">
          {STATUS_LABEL[agendamento.status] || agendamento.status}
          {agendamento.tipo && ` · ${agendamento.tipo}`}
        </div>
      )}
      </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onSelect={onClick}><Edit3 className="mr-2 h-4 w-4" /> Abrir / editar</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => setStatus('confirmado')}><CheckCircle2 className="mr-2 h-4 w-4" /> Confirmar</ContextMenuItem>
        <ContextMenuItem onSelect={() => setStatus('aguardando')}>Marcar como aguardando</ContextMenuItem>
        <ContextMenuItem onSelect={() => setStatus('em_atendimento')}><PlayCircle className="mr-2 h-4 w-4" /> Iniciar atendimento</ContextMenuItem>
        <ContextMenuItem onSelect={() => setStatus('finalizado')}>Finalizar</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => setStatus('faltou')} className="text-warning"><Ban className="mr-2 h-4 w-4" /> Marcar faltou</ContextMenuItem>
        <ContextMenuItem onSelect={() => setStatus('cancelado')} className="text-destructive">Cancelar consulta</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={remove} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Remover</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
