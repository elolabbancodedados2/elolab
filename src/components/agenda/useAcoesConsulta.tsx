import { useState, type ComponentType, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2, PlayCircle, Ban, Trash2, Edit3, User, Receipt, Video, MessageCircle, CalendarPlus, Copy, RefreshCw,
} from '@/components/icons/elolabIcons';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { checkinComCobranca } from '@/lib/checkinWithBilling';
import { atomicStartAppointment as autoIniciarAtendimento } from '@/lib/operationalTransitions';
import { mensagemDeErro } from '@/lib/erros';
import { useRegrasLiberacaoClinica } from '@/hooks/useRegrasLiberacaoClinica';
import { aguardaTriagemAntesDoInicio } from '@/lib/liberacaoTriagem';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { linkWhatsApp } from '@/lib/whatsapp';
import { appointmentStartHasPassed, parseDateOnly, toDateOnly } from '@/lib/dateOnly';
import { podeRemarcarAgendamento } from '@/lib/appointmentStatus';
import { APPOINTMENT_CANCELLATION_REASONS, isAppointmentCancellationReason } from '@/lib/appointmentCancellation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const DIAS_RETORNO_PADRAO = 30;

export interface AcaoConsulta {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  disabled?: boolean;
  title?: string;
  hint?: string;
  tone?: 'warning' | 'destructive' | 'primary';
  /** Ações do mesmo grupo ficam juntas; muda de grupo, entra um separador. */
  grupo: number;
  onSelect: () => void;
}

interface Opcoes {
  onAbrir: () => void;
  onNovaConsulta?: (initial: any) => void;
  /** Abre a consulta já preparada para remarcar (cancela a original ao salvar). */
  onRemarcar?: (agendamento: any) => void;
}

const ATIVOS = ['agendado', 'confirmado', 'aguardando'];

/**
 * Ações de uma consulta na agenda: o mesmo conjunto alimenta o menu do botão
 * direito, o botão "⋯" do cartão e a folha de ações do celular.
 *
 * Iniciar e finalizar não gravam `status` direto: os dois têm consequência
 * além do campo e passam pelos fluxos de check-in e fila.
 */
export function useAcoesConsulta(agendamento: any, { onAbrir, onNovaConsulta, onRemarcar }: Opcoes) {
  const queryClient = useQueryClient();
  const { triagemObrigatoria } = useRegrasLiberacaoClinica();
  const aguardaTriagem = aguardaTriagemAntesDoInicio(agendamento, triagemObrigatoria);
  const { profile } = useSupabaseAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const roles = profile?.roles ?? [];
  const podeAbrirFicha = roles.some(role => ['admin', 'recepcao', 'enfermagem'].includes(role));
  const podeAbrirExtrato = podeAbrirFicha && roles.some(role => ['admin', 'recepcao'].includes(role));
  const somenteMedico = roles.includes('medico') && !roles.some(role => ['admin', 'recepcao', 'enfermagem'].includes(role));
  const [ocupado, setOcupado] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [confirmandoFalta, setConfirmandoFalta] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');

  const paciente = agendamento.pacientes;
  const patientName = paciente?.nome_social || paciente?.nome || 'Paciente';
  const horaInicio = String(agendamento.hora_inicio || '').slice(0, 5);
  const horaFim = agendamento.hora_fim ? String(agendamento.hora_fim).slice(0, 5) : '';
  const dataBr = typeof agendamento.data === 'string' ? agendamento.data.split('-').reverse().join('/') : '';
  const linkConfirmacao = linkWhatsApp(
    paciente?.telefone,
    `Olá, ${patientName.split(' ')[0]}! Podemos confirmar sua consulta em ${dataBr} às ${horaInicio}? Responda SIM para confirmar.`,
  );
  // Falta só depois do horário marcado: antes, um clique errado em consulta
  // futura liberava o horário e registrava falta para o paciente.
  const horarioJaPassou = typeof agendamento.data === 'string' && appointmentStartHasPassed(agendamento.data, horaInicio);

  const invalidarAgendaEFila = () => {
    void queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
    void queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
  };

  const basePreenchida = () => ({
    paciente_id: agendamento.paciente_id,
    medico_id: agendamento.medico_id || '',
    sala_id: agendamento.sala_id || '',
    hora_inicio: horaInicio,
    hora_fim: horaFim,
    status: 'agendado',
    observacoes: ['exame', 'exames'].includes(String(agendamento.tipo || '').toLocaleLowerCase('pt-BR')) ? agendamento.observacoes || '' : '',
  });

  const fazerCheckin = () => checkinComCobranca({
    agendamentoId: agendamento.id,
    pacienteId: agendamento.paciente_id,
    pacienteNome: agendamento.pacientes?.nome ?? patientName ?? 'Paciente',
    convenioId: agendamento.convenio_id || agendamento.pacientes?.convenio_id,
    tipoConsulta: agendamento.tipo,
    tipoExame: ['exame', 'exames'].includes(String(agendamento.tipo || '').toLocaleLowerCase('pt-BR'))
      ? agendamento.observacoes
      : null,
    clinicaId: profile?.clinica_id,
  }, 'normal', { deferBilling: somenteMedico });

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
        void queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
        if (!checkin.success) throw new Error(checkin.message);
        toast.success('Paciente encaminhado para a fila', {
          description: somenteMedico ? 'A recepção deve confirmar a cobrança antes do atendimento.' : checkin.actions.join(' • '),
        });
        invalidarAgendaEFila();
        return;
      }
      if (status === 'faltou') {
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
        toast.success('Falta registrada');
        invalidarAgendaEFila();
        setConfirmandoFalta(false);
        return;
      }
      let update = supabase.from('agendamentos').update({ status })
        .eq('id', agendamento.id)
        .eq('clinica_id', profile.clinica_id);
      update = agendamento.updated_at ? update.eq('updated_at', agendamento.updated_at) : update.is('updated_at', null);
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

  const iniciarAtendimento = async () => {
    setOcupado(true);
    try {
      const checkin = await fazerCheckin();
      void queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
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
      const r = await autoIniciarAtendimento(agendamento.id, item.id, agendamento.paciente_id, agendamento.medico_id);
      if (!r.success) throw new Error(r.message);
      toast.success('Atendimento iniciado', { description: r.actions.join(' • ') });
      invalidarAgendaEFila();
    } catch (e) {
      toast.error('Não foi possível iniciar', { description: mensagemDeErro(e) });
    } finally {
      setOcupado(false);
    }
  };

  const cancelar = async () => {
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
      setCancelando(false);
      setMotivoCancelamento('');
      toast.success('Consulta cancelada');
    } catch (error) {
      toast.error('Erro ao cancelar a consulta', { description: mensagemDeErro(error) });
    } finally {
      setOcupado(false);
    }
  };

  /** Sala de teleconsulta: cria na primeira vez; depois reaproveita a sala existente. */
  const abrirSala = async (modo: 'entrar' | 'link') => {
    setOcupado(true);
    try {
      const { data, error } = await supabase.functions.invoke('teleconsulta', {
        body: { action: 'create', agendamento_id: agendamento.id, modo },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const guestUrl = data.guest_token ? `${window.location.origin}/teleconsulta/${data.session_id}#${data.guest_token}` : null;
      if (modo === 'link' && guestUrl) {
        const whatsapp = linkWhatsApp(
          paciente?.telefone,
          `Olá, ${patientName.split(' ')[0]}! Este é o link da sua teleconsulta de ${dataBr} às ${horaInicio}: ${guestUrl}`,
        );
        if (whatsapp) window.open(whatsapp, '_blank', 'noopener,noreferrer');
        try {
          await navigator.clipboard.writeText(guestUrl);
          toast.success(whatsapp ? 'Link aberto no WhatsApp e copiado' : 'Link seguro copiado', {
            description: data.reutilizada ? 'Um novo link foi emitido; o anterior deixou de valer.' : 'Envie o link ao paciente por um canal privado.',
          });
        } catch {
          if (!whatsapp) window.prompt('Copie o link seguro e envie ao paciente por um canal privado:', guestUrl);
        }
        return;
      }
      if (guestUrl) {
        // Sala criada agora: o link do paciente só é mostrado uma vez.
        try {
          await navigator.clipboard.writeText(guestUrl);
          toast.success('Sala criada e link do paciente copiado');
        } catch {
          window.prompt('Copie o link seguro e envie ao paciente por um canal privado:', guestUrl);
        }
      }
      navigate(`/teleconsulta/${data.session_id}`);
    } catch (error) {
      toast.error('Não foi possível abrir a sala', { description: mensagemDeErro(error) });
    } finally {
      setOcupado(false);
    }
  };

  const status = agendamento.status;
  const teleconsulta = agendamento.tipo === 'telemedicina' && roles.some(role => ['admin', 'medico'].includes(role));
  const salaDisponivel = ['agendado', 'confirmado', 'aguardando'].includes(status);
  const acoes: AcaoConsulta[] = [
    { id: 'abrir', label: 'Abrir / editar', icon: Edit3, grupo: 0, onSelect: onAbrir },
    ...(onRemarcar && podeRemarcarAgendamento(status) && ATIVOS.includes(status) ? [{
      id: 'remarcar', label: 'Remarcar', icon: RefreshCw, grupo: 0, onSelect: () => onRemarcar(agendamento),
      hint: 'cancela a original',
    }] : []),
    ...(teleconsulta ? [
      { id: 'tele-entrar', label: 'Entrar na sala', icon: Video, grupo: 1, disabled: ocupado || !salaDisponivel, onSelect: () => { void abrirSala('entrar'); } },
      { id: 'tele-link', label: 'Enviar link ao paciente', icon: MessageCircle, grupo: 1, disabled: ocupado || !salaDisponivel, onSelect: () => { void abrirSala('link'); } },
    ] : []),
    ...(onNovaConsulta && agendamento.paciente_id ? [
      {
        id: 'retorno', label: `Agendar retorno (+${DIAS_RETORNO_PADRAO} dias)`, icon: CalendarPlus, tone: 'primary' as const, grupo: 2,
        onSelect: () => {
          const d = parseDateOnly(agendamento.data)!;
          d.setDate(d.getDate() + DIAS_RETORNO_PADRAO);
          onNovaConsulta({ ...basePreenchida(), data: toDateOnly(d), tipo: 'retorno' });
        },
      },
      { id: 'duplicar', label: 'Duplicar consulta', icon: Copy, grupo: 2, onSelect: () => onNovaConsulta({ ...basePreenchida(), data: agendamento.data, tipo: agendamento.tipo || 'consulta' }) },
    ] : []),
    ...(podeAbrirFicha ? [{ id: 'ficha', label: 'Ficha do paciente', icon: User, grupo: 3, disabled: !agendamento.paciente_id, onSelect: () => navigate(`/pacientes?paciente=${agendamento.paciente_id}`) }] : []),
    ...(podeAbrirExtrato ? [{ id: 'extrato', label: 'Extrato financeiro', icon: Receipt, grupo: 3, disabled: !agendamento.paciente_id, onSelect: () => navigate(`/pacientes?paciente=${agendamento.paciente_id}&tab=financeiro`) }] : []),
    { id: 'confirmar', label: 'Confirmar', icon: CheckCircle2, grupo: 4, disabled: ocupado || status !== 'agendado', onSelect: () => { void setStatus('confirmado'); } },
    ...(['agendado', 'confirmado'].includes(status) ? [{
      id: 'confirmar-whatsapp', label: 'Confirmar pelo WhatsApp', icon: MessageCircle, tone: 'primary' as const, grupo: 4,
      disabled: !linkConfirmacao, title: linkConfirmacao ? undefined : 'Paciente sem telefone cadastrado',
      onSelect: () => { if (linkConfirmacao) window.open(linkConfirmacao, '_blank', 'noopener,noreferrer'); },
    }] : []),
    { id: 'fila', label: 'Enviar para a fila', grupo: 4, disabled: ocupado || !agendamento.paciente_id || !ATIVOS.includes(status), onSelect: () => { void setStatus('aguardando'); } },
    {
      id: 'iniciar', label: 'Iniciar atendimento', icon: PlayCircle, grupo: 4,
      disabled: ocupado || aguardaTriagem || !agendamento.paciente_id || !ATIVOS.includes(status),
      title: aguardaTriagem ? 'A clínica exige triagem antes do atendimento' : undefined,
      hint: aguardaTriagem ? 'exige triagem' : undefined,
      onSelect: () => { void iniciarAtendimento(); },
    },
    ...(status === 'em_atendimento' ? [{
      id: 'finalizar', label: 'Finalizar', grupo: 4, disabled: ocupado,
      onSelect: () => navigate(`/atendimentos/${agendamento.id}/finalizar?origem=agenda`, { state: { returnTo: `${location.pathname}${location.search}` } }),
    }] : []),
    ...(['faltou', 'em_atendimento'].includes(status) ? [{
      id: 'corrigir', label: status === 'faltou' ? 'Desfazer falta' : 'Voltar para a fila (iniciado por engano)', grupo: 4, disabled: ocupado,
      onSelect: () => navigate(`/agenda/${agendamento.id}/corrigir-status`, { state: { returnTo: `${location.pathname}${location.search}` } }),
    }] : []),
    {
      id: 'faltou', label: 'Marcar faltou', icon: Ban, tone: 'warning', grupo: 5,
      disabled: ocupado || !ATIVOS.includes(status) || !horarioJaPassou,
      title: !horarioJaPassou ? 'Disponível depois do horário da consulta' : undefined,
      hint: !horarioJaPassou && ATIVOS.includes(status) ? 'após o horário' : undefined,
      onSelect: () => setConfirmandoFalta(true),
    },
    {
      id: 'cancelar', label: 'Cancelar consulta', icon: Trash2, tone: 'destructive', grupo: 6,
      disabled: ocupado || !['agendado', 'confirmado', 'aguardando', 'aguardando_triagem', 'em_triagem'].includes(status),
      onSelect: () => setCancelando(true),
    },
  ];

  const dialogos: ReactNode = (
    <>
      <ConfirmDialog
        open={confirmandoFalta}
        onOpenChange={(o) => { if (!o && !ocupado) setConfirmandoFalta(false); }}
        title="Registrar falta?"
        description={`${patientName} será marcado como ausente na consulta de ${dataBr} às ${horaInicio}. O horário volta a ficar livre e o paciente sai da fila.`}
        confirmLabel="Registrar falta"
        variant="destructive"
        onConfirm={() => { void setStatus('faltou'); }}
        isLoading={ocupado}
        closeOnConfirm={false}
      />
      <ConfirmDialog
        open={cancelando}
        onOpenChange={(o) => { if (!o) { setCancelando(false); setMotivoCancelamento(''); } }}
        title="Cancelar esta consulta?"
        description="O histórico do paciente é preservado; o horário volta a ficar disponível e o paciente sai da fila de atendimento."
        confirmLabel="Cancelar consulta"
        variant="destructive"
        onConfirm={cancelar}
        isLoading={ocupado}
        closeOnConfirm={false}
      >
        <div className="ml-13 mt-3 space-y-2">
          <label htmlFor={`motivo-cancelamento-${agendamento.id}`} className="text-sm font-medium">Motivo do cancelamento</label>
          <Select value={motivoCancelamento} onValueChange={setMotivoCancelamento}>
            <SelectTrigger id={`motivo-cancelamento-${agendamento.id}`} aria-label="Motivo do cancelamento" disabled={ocupado}>
              <SelectValue placeholder="Selecione um motivo" />
            </SelectTrigger>
            <SelectContent data-elo-font-preview="agenda">
              {APPOINTMENT_CANCELLATION_REASONS.map((reason) => (
                <SelectItem key={reason.value} value={reason.value}>{reason.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </ConfirmDialog>
    </>
  );

  return { acoes, dialogos, ocupado };
}
