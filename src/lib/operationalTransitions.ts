import { supabase } from '@/integrations/supabase/client';

export interface OperationalTransitionResult {
  success: boolean;
  message: string;
  actions: string[];
  filaId?: string;
  statusAnterior?: string;
}

export async function atomicCheckin(
  agendamentoId: string,
  clinicaId: string,
  prioridade: 'normal' | 'preferencial' | 'urgente' = 'normal',
): Promise<OperationalTransitionResult> {
  try {
    const { data, error } = await (supabase as any).rpc('realizar_checkin', {
      p_agendamento_id: agendamentoId,
      p_prioridade: prioridade,
    });
    if (error) throw error;
    if (data?.repetido) {
      return {
        success: true,
        message: 'Paciente já está na fila',
        actions: [],
        filaId: data.fila_id,
        statusAnterior: data.status_anterior,
      };
    }
    return {
      success: true,
      message: 'Check-in realizado',
      actions: ['Paciente adicionado à fila', 'Status do agendamento → Aguardando'],
      filaId: data?.fila_id,
      statusAnterior: data?.status_anterior,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Não foi possível realizar o check-in.',
      actions: [],
    };
  }
}

export interface NoShowTransitionResult {
  success: boolean;
  message: string;
  cobrancaCancelada?: boolean;
  haviaCobranca?: boolean;
}

export async function atomicMarkNoShow(
  agendamentoId: string,
  clinicaId: string,
): Promise<NoShowTransitionResult> {
  try {
    const { data, error } = await (supabase as any).rpc('marcar_atendimento_nao_realizado', {
      p_agendamento_id: agendamentoId,
      p_clinica_id: clinicaId,
    });
    if (error) throw error;
    if (!data?.desfeito) {
      const message = data?.motivo === 'pagamento_registrado'
        ? 'Há pagamento registrado. Estorne ou reconcilie o valor antes de marcar como não realizado.'
        : 'O atendimento mudou desde que a lista foi carregada. Atualize a tela e tente novamente.';
      return { success: false, message };
    }
    return {
      success: true,
      message: data.cobranca_cancelada
        ? 'Atendimento cancelado e cobrança pendente cancelada.'
        : data.havia_cobranca
          ? 'Atendimento cancelado. A cobrança já estava cancelada ou estornada.'
          : 'Atendimento cancelado sem cobrança registrada.',
      cobrancaCancelada: Boolean(data.cobranca_cancelada),
      haviaCobranca: Boolean(data.havia_cobranca),
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Não foi possível marcar o atendimento como não realizado.',
    };
  }
}

export async function atomicStartAppointment(
  agendamentoId: string,
  filaId: string,
  _pacienteId?: string,
  _medicoId?: string,
): Promise<OperationalTransitionResult> {
  try {
    const { data, error } = await (supabase as any).rpc('iniciar_atendimento_atomico', {
      p_agendamento_id: agendamentoId,
      p_fila_id: filaId,
    });
    if (error) throw error;
    return {
      success: true,
      message: data?.repetido ? 'Atendimento já iniciado' : 'Atendimento iniciado',
      actions: data?.repetido ? [] : ['Agenda e fila → Em atendimento'],
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Não foi possível iniciar o atendimento.',
      actions: [],
    };
  }
}

export async function atomicConcludeQueue(
  agendamentoId: string,
  filaId: string,
): Promise<OperationalTransitionResult> {
  try {
    const { data, error } = await (supabase as any).rpc('concluir_fila_atomico', {
      p_agendamento_id: agendamentoId,
      p_fila_id: filaId,
    });
    if (error) throw error;
    if (data !== true) {
      return { success: false, message: 'O atendimento mudou. Atualize a recepção e tente novamente.', actions: [] };
    }
    return { success: true, message: 'Atendimento concluído', actions: ['Fila concluída'] };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Não foi possível concluir o atendimento.',
      actions: [],
    };
  }
}
