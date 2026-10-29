import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { CheckCircle2, PlayCircle, Ban, Trash2, Edit3, User, Receipt, Video, MessageCircle, CalendarPlus, Copy } from 'lucide-react';
import { linkWhatsApp } from '@/lib/whatsapp';
import { parseDateOnly, toDateOnly } from '@/lib/dateOnly';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { autoFinalizarAtendimento } from '@/lib/workflowAutomation';
import { checkinComCobranca } from '@/lib/checkinWithBilling';
import { atomicStartAppointment as autoIniciarAtendimento } from '@/lib/operationalTransitions';
import { mensagemDeErro } from '@/lib/erros';
import { useQueryClient } from '@tanstack/react-query';
import { FinalizarAtendimentoDialog } from '@/components/fila/FinalizarAtendimentoDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { podeRemarcarAgendamento } from '@/lib/appointmentStatus';
import { APPOINTMENT_CANCELLATION_REASONS, isAppointmentCancellationReason } from '@/lib/appointmentCancellation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  agendamento: any;
  color: string;
  slotHeight: number;
  minutesToPx: (m: number) => number;
  onClick: () => void;
  convenioName?: string;
  /** Abre o formulário de nova consulta já preenchido (retorno, duplicar). */
  onNovaConsulta?: (initial: any) => void;
}

const DIAS_RETORNO_PADRAO = 30;

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

export function AppointmentCard({ agendamento, color, minutesToPx, onClick, convenioName, onNovaConsulta }: Props) {
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const navigate = useNavigate();
  const roles = profile?.roles ?? [];
  const podeAbrirFicha = roles.some(role => ['admin', 'recepcao', 'enfermagem'].includes(role));
  const podeAbrirExtrato = podeAbrirFicha && roles.some(role => ['admin', 'recepcao'].includes(role));
  const movable = podeRemarcarAgendamento(agendamento.status);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `ag:${agendamento.id}`,
    data: { agendamento },
    disabled: !movable,
  });

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
  const dataBr = typeof agendamento.data === 'string' ? agendamento.data.split('-').reverse().join('/') : '';
  const linkConfirmacao = linkWhatsApp(
    paciente?.telefone,
    `Olá, ${patientName.split(' ')[0]}! Podemos confirmar sua consulta em ${dataBr} às ${horaInicio}? Responda SIM para confirmar.`,
  );
  const basePreenchida = () => ({
    paciente_id: agendamento.paciente_id,
    medico_id: agendamento.medico_id || '',
    sala_id: agendamento.sala_id || '',
    hora_inicio: horaInicio,
    hora_fim: horaFim || '',
    status: 'agendado',
    observacoes: ['exame', 'exames'].includes(String(agendamento.tipo || '').toLocaleLowerCase('pt-BR')) ? agendamento.observacoes || '' : '',
  });
  const agendarRetorno = () => {
    const d = parseDateOnly(agendamento.data)!;
    d.setDate(d.getDate() + DIAS_RETORNO_PADRAO);
    onNovaConsulta?.({ ...basePreenchida(), data: toDateOnly(d), tipo: 'retorno' });
  };
  const duplicarConsulta = () => onNovaConsulta?.({ ...basePreenchida(), data: agendamento.data, tipo: agendamento.tipo || 'consulta' });

  const accessibleName = [
    `Consulta de ${patientName}`,
    horaFim ? `${horaInicio} às ${horaFim}` : `às ${horaInicio}`,
    tipoLabel,
    convenioName,
    statusLabel,
  ].filter(Boolean).join(', ');

  const style: React.CSSProperties = {
    position: 'absolute',
    top: minutesToPx(start - toMinutes('06:00')),
    height: minutesToPx(duration) - 4,
    left: 3,
    right: 3,
    borderLeft: `4px solid ${color}`,
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
  /** Finalização esperando a resposta sobre o retorno (mesma pergunta da Fila). */
  const [finalizandoCard, setFinalizandoCard] = useState(false);
  /** Confirmação antes de cancelar/remover a consulta. */
  const [cancelandoCard, setCancelandoCard] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');

  const invalidarAgendaEFila = () => {
    void queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
    void queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
  };
  const invalidarFinanceiro = () => {
    void queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
  };

  const fazerCheckin = () => checkinComCobranca({
    agendamentoId: agendamento.id,
    pacienteId: agendamento.paciente_id,
    pacienteNome: agendamento.pacientes?.nome ?? patientName ?? 'Paciente',
    convenioId: agendamento.pacientes?.convenio_id,
    tipoConsulta: agendamento.tipo,
    tipoExame: ['exame', 'exames'].includes(String(agendamento.tipo || '').toLocaleLowerCase('pt-BR'))
      ? agendamento.observacoes
      : null,
    clinicaId: profile?.clinica_id,
  }, 'normal', {
    deferBilling: Boolean(profile?.roles?.includes('medico') && !profile.roles.some(role =>
      ['admin', 'recepcao', 'enfermagem'].includes(role),
    )),
  });

  const alterarStatusComFila = async (status: 'cancelado' | 'faltou') => {
    if (!profile?.clinica_id) throw new Error('Não foi possível identificar a clínica. Atualize a sessão e tente novamente.');
    const { data, error } = await (supabase as any).rpc('alterar_status_agendamento_com_fila', {
      p_agendamento_id: agendamento.id,
      p_clinica_id: profile.clinica_id,
      p_status: status,
      p_updated_at: agendamento.updated_at ?? null,
    });
    if (error) throw error;
    const resultado = Array.isArray(data) ? data[0] : data;
    if (!resultado?.atualizado) {
      invalidarAgendaEFila();
      throw new Error('A consulta mudou ou foi finalizada desde que a agenda foi carregada. Confira o status antes de tentar novamente.');
    }
  };

  const setStatus = async (status: 'confirmado' | 'aguardando' | 'faltou') => {
    if (ocupado) return;
    if (!profile?.clinica_id) {
      toast.error('Não foi possível identificar a clínica. Atualize a sessão e tente novamente.');
      return;
    }
    setOcupado(true);
    try {
      if (status === 'aguardando') {
        const checkin = await fazerCheckin();
        invalidarFinanceiro();
        if (!checkin.success) throw new Error(checkin.message);
        toast.success('Paciente encaminhado para a fila', {
          description: profile?.roles?.includes('medico') && !profile.roles.some(role =>
            ['admin', 'recepcao', 'enfermagem'].includes(role),
          )
            ? 'A recepção deve confirmar a cobrança antes do atendimento.'
            : checkin.actions.join(' • '),
        });
        invalidarAgendaEFila();
        return;
      }
      if (status === 'faltou') {
        await alterarStatusComFila(status);
        toast.success('Falta registrada');
        invalidarAgendaEFila();
        return;
      }
      let update = supabase.from('agendamentos').update({ status })
        .eq('id', agendamento.id)
        .eq('clinica_id', profile.clinica_id);
      update = agendamento.updated_at
        ? update.eq('updated_at', agendamento.updated_at)
        : update.is('updated_at', null);
      const { data, error } = await (update.select('id').maybeSingle() as any);
      if (error) throw error;
      if (!data) {
        invalidarAgendaEFila();
        toast.error('A consulta mudou desde que a agenda foi carregada.', { description: 'Atualizei os dados. Confira o status antes de tentar novamente.' });
        return;
      }

      toast.success('Status atualizado');
      invalidarAgendaEFila();
    } catch (error) {
      toast.error('Erro ao atualizar a consulta', { description: mensagemDeErro(error) });
    } finally {
      setOcupado(false);
    }
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
      const checkin = await fazerCheckin();
      invalidarFinanceiro();
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
  const finalizarAtendimento = async (diasRetorno: number | null) => {
    setOcupado(true);
    let finalizado = false;
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
        // Retorno perguntado aqui também: antes só a Fila perguntava, e toda
        // finalização pela Agenda nascia sem retorno marcado.
        agendarRetorno: diasRetorno !== null,
        diasRetorno: diasRetorno ?? undefined,
      });
      if (!r.success) throw new Error(r.message);

      toast.success('Atendimento finalizado', { description: r.actions.join(' • ') });
      queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      finalizado = true;
    } catch (e: any) {
      toast.error('Não foi possível finalizar', { description: mensagemDeErro(e) });
    } finally {
      setOcupado(false);
    }
    return finalizado;
  };
  const remove = async () => {
    if (ocupado) return;
    if (!isAppointmentCancellationReason(motivoCancelamento)) {
      toast.error('Selecione o motivo do cancelamento');
      return;
    }
    if (!profile?.clinica_id) {
      toast.error('Não foi possível identificar a clínica. Atualize a sessão e tente novamente.');
      return;
    }
    setOcupado(true);
    // Cancela e remove a fila junto — a confirmação é o ConfirmDialog abaixo
    // (antes era window.confirm nativo, fora do padrão do app).
    try {
      const { data, error } = await (supabase as any).rpc('cancelar_agendamento_com_motivo', {
        p_agendamento_id: agendamento.id,
        p_clinica_id: profile.clinica_id,
        p_updated_at: agendamento.updated_at ?? null,
        p_motivo_cancelamento: motivoCancelamento,
      });
      if (error) throw error;
      const resultado = Array.isArray(data) ? data[0] : data;
      if (!resultado?.atualizado) throw new Error('A consulta mudou ou foi finalizada desde que a agenda foi carregada. Confira o status antes de tentar novamente.');
      invalidarAgendaEFila();
      setCancelandoCard(false);
      setMotivoCancelamento('');
      toast.success('Consulta cancelada');
    } catch (error) {
      toast.error('Erro ao cancelar a consulta', { description: mensagemDeErro(error) });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
      <div
        ref={setNodeRef}
        style={style}
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
        'group rounded-lg bg-card shadow-xs border border-border/60 hover:shadow-md hover:border-primary/40',
        'cursor-grab active:cursor-grabbing overflow-hidden transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        compact ? 'px-1.5 py-0 text-[11px] leading-none' : 'px-1.5 py-1 text-xs',
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
            {String(agendamento.observacoes || '').includes('[agendamento online]') && agendamento.status === 'agendado' && (
              <span className="ml-1 shrink-0 rounded bg-info/15 px-1 text-[9px] font-semibold uppercase text-info" title="Marcado pelo paciente no link online — confirme com ele">
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
      <ContextMenuContent className="w-56">
        <ContextMenuItem onSelect={onClick}><Edit3 className="mr-2 h-4 w-4" /> Abrir / editar</ContextMenuItem>
        {agendamento.tipo === 'telemedicina' && roles.some(role => ['admin', 'medico'].includes(role)) && <ContextMenuItem
          disabled={ocupado || !['agendado', 'confirmado', 'aguardando'].includes(agendamento.status)}
          onSelect={async () => {
            setOcupado(true);
            try {
              const { data, error } = await supabase.functions.invoke('teleconsulta', { body: { action: 'create', agendamento_id: agendamento.id } });
              if (error) throw error;
              const guestUrl = `${window.location.origin}/teleconsulta/${data.session_id}#${data.guest_token}`;
              try {
                await navigator.clipboard.writeText(guestUrl);
                toast.success('Link seguro copiado', { description: 'Envie o link ao paciente por um canal privado.' });
              } catch {
                window.prompt('Copie o link seguro e envie ao paciente por um canal privado:', guestUrl);
                toast.info('O link da sala está pronto para compartilhar.');
              }
              navigate(`/teleconsulta/${data.session_id}`);
            } catch (error) {
              toast.error('Não foi possível criar a sala', { description: mensagemDeErro(error) });
            } finally { setOcupado(false); }
          }}>
          <Video className="mr-2 h-4 w-4" /> Criar sala e copiar link
        </ContextMenuItem>}
        {onNovaConsulta && agendamento.paciente_id && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={agendarRetorno}><CalendarPlus className="mr-2 h-4 w-4 text-primary" /> Agendar retorno (+{DIAS_RETORNO_PADRAO} dias)</ContextMenuItem>
            <ContextMenuItem onSelect={duplicarConsulta}><Copy className="mr-2 h-4 w-4" /> Duplicar consulta</ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        {podeAbrirFicha && <ContextMenuItem
          disabled={!agendamento.paciente_id}
          onSelect={() => navigate(`/pacientes?paciente=${agendamento.paciente_id}`)}>
          <User className="mr-2 h-4 w-4" /> Ficha do paciente
        </ContextMenuItem>}
        {podeAbrirExtrato && <ContextMenuItem
          disabled={!agendamento.paciente_id}
          onSelect={() => navigate(`/pacientes?paciente=${agendamento.paciente_id}&tab=financeiro`)}>
          <Receipt className="mr-2 h-4 w-4" /> Extrato financeiro
        </ContextMenuItem>}
        <ContextMenuSeparator />
        <ContextMenuItem disabled={ocupado || agendamento.status !== 'agendado'} onSelect={() => setStatus('confirmado')}><CheckCircle2 className="mr-2 h-4 w-4" /> Confirmar</ContextMenuItem>
        {['agendado', 'confirmado'].includes(agendamento.status) && (
          <ContextMenuItem
            disabled={!linkConfirmacao}
            title={linkConfirmacao ? undefined : 'Paciente sem telefone cadastrado'}
            onSelect={() => { if (linkConfirmacao) window.open(linkConfirmacao, '_blank', 'noopener,noreferrer'); }}
          >
            <MessageCircle className="mr-2 h-4 w-4 text-primary" /> Confirmar pelo WhatsApp
          </ContextMenuItem>
        )}
        <ContextMenuItem disabled={ocupado || !agendamento.paciente_id || !['agendado', 'confirmado', 'aguardando'].includes(agendamento.status)} onSelect={() => setStatus('aguardando')}>Enviar para a fila</ContextMenuItem>
        <ContextMenuItem disabled={ocupado || !agendamento.paciente_id || !['agendado', 'confirmado', 'aguardando'].includes(agendamento.status)} onSelect={iniciarAtendimento}><PlayCircle className="mr-2 h-4 w-4" /> Iniciar atendimento</ContextMenuItem>
        {agendamento.status === 'em_atendimento' && (
          <ContextMenuItem disabled={ocupado} onSelect={() => setFinalizandoCard(true)}>Finalizar</ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem disabled={ocupado || !['agendado', 'confirmado', 'aguardando'].includes(agendamento.status)} onSelect={() => setStatus('faltou')} className="text-warning-foreground"><Ban className="mr-2 h-4 w-4" /> Marcar faltou</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={ocupado || !['agendado', 'confirmado', 'aguardando', 'aguardando_triagem', 'em_triagem'].includes(agendamento.status)} onSelect={() => setCancelandoCard(true)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Cancelar consulta</ContextMenuItem>
      </ContextMenuContent>
      <FinalizarAtendimentoDialog
        open={finalizandoCard}
        pacienteNome={patientName}
        onClose={() => setFinalizandoCard(false)}
        onConfirm={finalizarAtendimento}
      />
      <ConfirmDialog
        open={cancelandoCard}
        onOpenChange={(o) => { if (!o) { setCancelandoCard(false); setMotivoCancelamento(''); } }}
        title="Cancelar esta consulta?"
        description="O histórico do paciente é preservado; o horário volta a ficar disponível e o paciente sai da fila de atendimento."
        confirmLabel="Cancelar consulta"
        variant="destructive"
        onConfirm={remove}
        isLoading={ocupado}
        closeOnConfirm={false}
      >
        <div className="ml-13 mt-3 space-y-2">
          <label htmlFor={`motivo-cancelamento-${agendamento.id}`} className="text-sm font-medium">Motivo do cancelamento</label>
          <Select value={motivoCancelamento} onValueChange={setMotivoCancelamento}>
            <SelectTrigger id={`motivo-cancelamento-${agendamento.id}`} aria-label="Motivo do cancelamento" disabled={ocupado}>
              <SelectValue placeholder="Selecione um motivo" />
            </SelectTrigger>
            <SelectContent>
              {APPOINTMENT_CANCELLATION_REASONS.map((reason) => (
                <SelectItem key={reason.value} value={reason.value}>{reason.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </ConfirmDialog>
    </ContextMenu>
  );
}
