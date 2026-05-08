 // @ts-nocheck
 /**
  * Referral Service
  * Gerenciamento de encaminhamentos com rastreamento de status
  */

import { supabase } from '@/integrations/supabase/client';

export interface Referral {
  id: string;
  pacienteId: string;
  pacienteName?: string;
  medicoSolicitanteId: string;
  medicoSolicitanteName?: string;
  medicoDestinoId?: string;
  medicoDestinoName?: string;
  especialidadeDestino: string;
  clinicaDestino?: string;
  motivo: string;
  descricaoClinica?: string;
  urgencia: 'rotina' | 'preferencial' | 'urgente';
  status: 'enviado' | 'recebido' | 'em_andamento' | 'concluido' | 'cancelado';
  dataSolicitacao: Date | string;
  dataRecebimento?: Date | string;
  dataConclusao?: Date | string;
  dataCancelamento?: Date | string;
  motivoCancelamento?: string;
  resultadoEncaminhamento?: string;
  observacoesRetorno?: string;
  arquivoResultado?: string;
}

/**
 * Criar novo encaminhamento
 */
export async function createReferral(referral: Omit<Referral, 'id' | 'status' | 'dataSolicitacao'>): Promise<Referral> {
  try {
    const { data, error } = await supabase
      .from('encaminhamentos')
      .insert({
        paciente_id: referral.pacienteId,
        medico_solicitante_id: referral.medicoSolicitanteId,
        medico_destino_id: referral.medicoDestinoId || null,
        especialidade_destino: referral.especialidadeDestino,
        clinica_destino: referral.clinicaDestino || null,
        motivo: referral.motivo,
        descricao_clinica: referral.descricaoClinica || null,
        urgencia: referral.urgencia,
        status: 'enviado',
      })
      .select()
      .single();

    if (error) throw error;

    return mapDatabaseReferral(data);
  } catch (error) {
    console.error('Error creating referral:', error);
    throw error;
  }
}

/**
 * Obter encaminhamentos de um paciente
 */
export async function getPatientReferrals(pacienteId: string): Promise<Referral[]> {
  try {
    const { data, error } = await supabase
      .from('encaminhamentos')
      .select(`
        *,
        pacientes(nome),
        medicos!medico_solicitante_id(nome),
        medicos_destino:medicos(nome)
      `)
      .eq('paciente_id', pacienteId)
      .order('data_solicitacao', { ascending: false });

    if (error) throw error;

    return (data || []).map(mapDatabaseReferral);
  } catch (error) {
    console.error('Error fetching patient referrals:', error);
    throw error;
  }
}

/**
 * Obter encaminhamentos pendentes de recebimento
 */
export async function getPendingReferrals(medicoDestinoId?: string): Promise<Referral[]> {
  try {
    let query = supabase
      .from('encaminhamentos')
      .select(`
        *,
        pacientes(nome),
        medicos!medico_solicitante_id(nome)
      `)
      .in('status', ['enviado', 'em_andamento']);

    if (medicoDestinoId) {
      query = query.eq('medico_destino_id', medicoDestinoId);
    }

    const { data, error } = await query.order('data_solicitacao', { ascending: false });

    if (error) throw error;

    return (data || []).map(mapDatabaseReferral);
  } catch (error) {
    console.error('Error fetching pending referrals:', error);
    throw error;
  }
}

/**
 * Atualizar status do encaminhamento
 */
export async function updateReferralStatus(
  referralId: string,
  novoStatus: Referral['status'],
  comentario?: string
): Promise<Referral> {
  try {
    const { data: referral } = await supabase
      .from('encaminhamentos')
      .select('status')
      .eq('id', referralId)
      .single();

    const statusAnterior = referral?.status;

    // Preparar dados de atualização
    const updateData: any = { status: novoStatus };

    if (novoStatus === 'recebido') {
      updateData.data_recebimento = new Date().toISOString();
    } else if (novoStatus === 'concluido') {
      updateData.data_conclusao = new Date().toISOString();
    } else if (novoStatus === 'cancelado') {
      updateData.data_cancelamento = new Date().toISOString();
      updateData.motivo_cancelamento = comentario;
    }

    // Atualizar status
    const { data, error } = await supabase
      .from('encaminhamentos')
      .update(updateData)
      .eq('id', referralId)
      .select()
      .single();

    if (error) throw error;

    // Registrar histórico
    if (statusAnterior) {
      const { error: histError } = await supabase
        .from('encaminhamento_status_history')
        .insert({
          encaminhamento_id: referralId,
          status_anterior: statusAnterior,
          status_novo: novoStatus,
          usuario_id: (await supabase.auth.getUser()).data.user?.id,
          comentario: comentario || null,
        });

      if (histError) console.error('Error recording status history:', histError);
    }

    return mapDatabaseReferral(data);
  } catch (error) {
    console.error('Error updating referral status:', error);
    throw error;
  }
}

/**
 * Adicionar resultado do encaminhamento
 */
export async function addReferralResult(
  referralId: string,
  resultado: string,
  observacoes?: string,
  arquivoUrl?: string
): Promise<Referral> {
  try {
    const { data, error } = await supabase
      .from('encaminhamentos')
      .update({
        resultado_encaminhamento: resultado,
        observacoes_retorno: observacoes || null,
        arquivo_resultado: arquivoUrl || null,
        status: 'concluido',
        data_conclusao: new Date().toISOString(),
      })
      .eq('id', referralId)
      .select()
      .single();

    if (error) throw error;

    return mapDatabaseReferral(data);
  } catch (error) {
    console.error('Error adding referral result:', error);
    throw error;
  }
}

/**
 * Obter histórico de status de um encaminhamento
 */
export async function getReferralStatusHistory(referralId: string) {
  try {
    const { data, error } = await supabase
      .from('encaminhamento_status_history')
      .select('*')
      .eq('encaminhamento_id', referralId)
      .order('data_mudanca', { ascending: false });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error fetching referral status history:', error);
    return [];
  }
}

/**
 * Obter estatísticas de encaminhamentos
 */
export async function getReferralStats(pacienteId?: string) {
  try {
    let query = supabase
      .from('encaminhamentos')
      .select('status, urgencia, especialidade_destino');

    if (pacienteId) {
      query = query.eq('paciente_id', pacienteId);
    }

    const { data, error } = await query;

    if (error) throw error;

    const stats = {
      total: data?.length || 0,
      porStatus: {
        enviado: 0,
        recebido: 0,
        em_andamento: 0,
        concluido: 0,
        cancelado: 0,
      },
      porUrgencia: {
        rotina: 0,
        preferencial: 0,
        urgente: 0,
      },
      porEspecialidade: {} as Record<string, number>,
    };

    data?.forEach(ref => {
      // Por status
      if (ref.status in stats.porStatus) {
        stats.porStatus[ref.status as keyof typeof stats.porStatus]++;
      }

      // Por urgência
      if (ref.urgencia in stats.porUrgencia) {
        stats.porUrgencia[ref.urgencia as keyof typeof stats.porUrgencia]++;
      }

      // Por especialidade
      stats.porEspecialidade[ref.especialidade_destino] =
        (stats.porEspecialidade[ref.especialidade_destino] || 0) + 1;
    });

    return stats;
  } catch (error) {
    console.error('Error fetching referral stats:', error);
    return null;
  }
}

/**
 * Mapear dados do banco para interface Referral
 */
function mapDatabaseReferral(data: any): Referral {
  return {
    id: data.id,
    pacienteId: data.paciente_id,
    pacienteName: data.pacientes?.nome,
    medicoSolicitanteId: data.medico_solicitante_id,
    medicoSolicitanteName: Array.isArray(data.medicos) ? data.medicos[0]?.nome : data.medicos?.nome,
    medicoDestinoId: data.medico_destino_id,
    especialidadeDestino: data.especialidade_destino,
    clinicaDestino: data.clinica_destino,
    motivo: data.motivo,
    descricaoClinica: data.descricao_clinica,
    urgencia: data.urgencia,
    status: data.status,
    dataSolicitacao: data.data_solicitacao,
    dataRecebimento: data.data_recebimento,
    dataConclusao: data.data_conclusao,
    dataCancelamento: data.data_cancelamento,
    motivoCancelamento: data.motivo_cancelamento,
    resultadoEncaminhamento: data.resultado_encaminhamento,
    observacoesRetorno: data.observacoes_retorno,
    arquivoResultado: data.arquivo_resultado,
  };
}

/**
 * Cancelar encaminhamento
 */
export async function cancelReferral(referralId: string, motivo: string): Promise<Referral> {
  return updateReferralStatus(referralId, 'cancelado', motivo);
}

/**
 * Marcar como recebido
 */
export async function markReferralAsReceived(referralId: string): Promise<Referral> {
  return updateReferralStatus(referralId, 'recebido');
}

/**
 * Marcar como em andamento
 */
export async function markReferralAsInProgress(referralId: string): Promise<Referral> {
  return updateReferralStatus(referralId, 'em_andamento');
}

/**
 * Completar encaminhamento
 */
export async function completeReferral(referralId: string, resultado: string): Promise<Referral> {
  return addReferralResult(referralId, resultado);
}
