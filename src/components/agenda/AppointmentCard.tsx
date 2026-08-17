import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { CheckCircle2, PlayCircle, Ban, Trash2, Edit3, User, Receipt } from 'lucide-react';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { autoCheckin, autoIniciarAtendimento, autoFinalizarAtendimento } from '@/lib/workflowAutomation';
import { mensagemDeErro } from '@/lib/erros';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  agendamento: any;
  color: string;
  slotHeight: number;
  minutesToPx: (m: number) => number;
  onClick: () => void;
  convenioName?: string;
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
  agendado: 'bg-muted-foreground/50',
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
  telemedicina: 'Telemed.', checkup: 'Check-up', avaliacao: 'Avaliação', cirurgia: 'Cirurgia',
  triagem: 'Triagem', coleta: 'Coleta', enfermagem: 'Enfermagem', vacina: 'Vacina', curativo: 'Curativo',
};

export function AppointmentCard({ agendamento, color, minutesToPx, onClick, convenioName }: Props) {
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `ag:${agendamento.id}`,
    data: { agendamento },
  });

  const start = toMinutes(agendamento.hora_inicio);
  const end = agendamento.hora_fim ? toMinutes(agendamento.hora_fim) : start + 30;
  const duration = Math.max(15, end - start);
  const paciente = agendamento.pacientes;
  const patientName = paciente?.nome_social || paciente?.nome || 'Paciente';
  const cancelled = agendamento.status === 'cancelado';
  const done = agendamento.status === 'finalizado';
  const tipoLabel = TIPO_LABEL[agendamento.tipo as string] || agendamento.tipo;

  const style: React.CSSProperties = {
    position: 'absolute',
    top: minutesToPx(start - toMinutes('06:00')),
    height: minutesToPx(duration) - 4,
    left: 3,
    right: 3,
    borderLeft: `3px solid ${color}`,
    background: `linear-gradient(to right, ${color}12, hsl(var(--card)) 40%)`,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 10,
  };

  /**
   * Muda o status pelo menu da agenda.
   *
   * Iniciar e finalizar NÃO passam por aqui: os dois têm consequência além do
   * campo `status`, e gravá-lo direto foi o que produziu o estrago que o banco
   * mostrava — 13 consultas paradas em "em atendimento", a mais antiga de cinco
   * meses, cinco delas numa clínica em operação.
   */
  const [ocupado, setOcupado] = useState(false);

  const setStatus = async (status: any) => {
    const { error } = await (supabase.from('agendamentos').update({ status }).eq('id', agendamento.id) as any);
    if (error) return toast.error('Erro ao atualizar', { description: mensagemDeErro(error) });
    toast.success('Status atualizado');
    queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
  };

  /**
   * Iniciar atendimento pela agenda.
   *
   * Marcava `em_atendimento` direto, sem criar item na fila. O paciente ficava
   * invisível para o médico (a fila nunca o mostrava) e ninguém conseguia
   * finalizá-lo depois — a tela de finalizar age sobre a fila. Foi assim que
   * cinco agendamentos ficaram presos sem fila nenhuma.
   *
   * Agora faz o caminho inteiro: check-in cria a fila, e o início usa o item
   * criado.
   */
  const iniciarAtendimento = async () => {
    setOcupado(true);
    try {
      const checkin = await autoCheckin(agendamento.id, profile?.clinica_id);
      if (!checkin.success) throw new Error(checkin.message);

      const { data: item, error: erroFila } = await supabase
        .from('fila_atendimento')
        .select('id')
        .eq('agendamento_id', agendamento.id)
        .neq('status', 'finalizado')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (erroFila) throw erroFila;
      if (!item) throw new Error('Não encontrei o paciente na fila depois do check-in.');

      const r = await autoIniciarAtendimento(
        agendamento.id, item.id, agendamento.paciente_id, agendamento.medico_id,
      );
      if (!r.success) throw new Error(r.message);

      toast.success('Atendimento iniciado', { description: r.actions.join(' • ') });
      queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
    } catch (e: any) {
      toast.error('Não foi possível iniciar', { description: mensagemDeErro(e) });
    } finally {
      setOcupado(false);
    }
  };

  /**
   * Finalizar pela agenda.
   *
   * Este era o pior: gravava `finalizado` direto e a consulta NÃO GERAVA
   * COBRANÇA. O atendimento acontecia, sumia da agenda como concluído, e nunca
   * virava dinheiro. Agora passa pela finalização de verdade, que fatura e
   * fecha a fila junto.
   */
  const finalizarAtendimento = async () => {
    setOcupado(true);
    try {
      const { data: item } = await supabase
        .from('fila_atendimento')
        .select('id')
        .eq('agendamento_id', agendamento.id)
        .neq('status', 'finalizado')
        .limit(1)
        .maybeSingle();

      const r = await autoFinalizarAtendimento({
        agendamentoId: agendamento.id,
        filaId: item?.id,
        pacienteId: agendamento.paciente_id,
        pacienteNome: agendamento.pacientes?.nome ?? patientName ?? 'Paciente',
        medicoId: agendamento.medico_id,
        tipoConsulta: agendamento.tipo,
        clinicaId: profile?.clinica_id,
      });
      if (!r.success) throw new Error(r.message);

      toast.success('Atendimento finalizado', { description: r.actions.join(' • ') });
      queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
    } catch (e: any) {
      toast.error('Não foi possível finalizar', { description: mensagemDeErro(e) });
    } finally {
      setOcupado(false);
    }
  };
  const remove = async () => {
    if (!confirm('Remover esta consulta?')) return;
    const { error } = await (supabase.from('agendamentos').delete().eq('id', agendamento.id) as any);
    if (error) return toast.error('Erro ao remover', { description: mensagemDeErro(error) });
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
        'group rounded-md bg-card shadow-sm border border-border/60 hover:shadow-md hover:border-primary/40',
        'cursor-grab active:cursor-grabbing overflow-hidden transition-all',
        'px-1.5 py-1 text-xs',
        cancelled && 'opacity-60 line-through',
        done && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-1.5 min-w-0">
        <div
          className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shadow-sm"
          style={{ backgroundColor: color }}
          title={patientName}
        >
          {initials(patientName)}
        </div>
        <div className="flex-1 min-w-0 leading-tight">
          <div className="flex items-center gap-1 font-medium text-foreground truncate">
            <span className="tabular-nums">{agendamento.hora_inicio.slice(0, 5)}</span>
            {agendamento.hora_fim && duration >= 30 && (
              <span className="text-muted-foreground text-[10px]">–{agendamento.hora_fim.slice(0, 5)}</span>
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
              {STATUS_LABEL[agendamento.status] || agendamento.status}
            </div>
          )}
        </div>
      </div>
      </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onSelect={onClick}><Edit3 className="mr-2 h-4 w-4" /> Abrir / editar</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!agendamento.paciente_id}
          onSelect={() => navigate(`/pacientes?paciente=${agendamento.paciente_id}`)}>
          <User className="mr-2 h-4 w-4" /> Ficha do paciente
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!agendamento.paciente_id}
          onSelect={() => navigate(`/pacientes?paciente=${agendamento.paciente_id}&tab=financeiro`)}>
          <Receipt className="mr-2 h-4 w-4" /> Extrato financeiro
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => setStatus('confirmado')}><CheckCircle2 className="mr-2 h-4 w-4" /> Confirmar</ContextMenuItem>
        <ContextMenuItem onSelect={() => setStatus('aguardando')}>Marcar como aguardando</ContextMenuItem>
        <ContextMenuItem disabled={ocupado} onSelect={iniciarAtendimento}><PlayCircle className="mr-2 h-4 w-4" /> Iniciar atendimento</ContextMenuItem>
        <ContextMenuItem disabled={ocupado} onSelect={finalizarAtendimento}>Finalizar</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => setStatus('faltou')} className="text-warning"><Ban className="mr-2 h-4 w-4" /> Marcar faltou</ContextMenuItem>
        <ContextMenuItem onSelect={() => setStatus('cancelado')} className="text-destructive">Cancelar consulta</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={remove} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Remover</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
