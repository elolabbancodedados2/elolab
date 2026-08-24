import { supabase } from '@/integrations/supabase/client';

export interface OperationalTransitionResult {
  success: boolean;
  message: string;
  actions: string[];
}

export async function atomicCheckin(
  agendamentoId: string,
  _clinicaId?: string | null,
): Promise<OperationalTransitionResult> {
  try {
    const { data, error } = await (supabase as any).rpc('realizar_checkin', {
      p_agendamento_id: agendamentoId,
    });
    if (error) throw error;
    if (data?.repetido) {
      return { success: true, message: 'Paciente já está na fila', actions: [] };
    }
    return {
      success: true,
      message: 'Check-in realizado',
      actions: ['Paciente adicionado à fila', 'Status do agendamento → Aguardando'],
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Não foi possível realizar o check-in.',
      actions: [],
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
