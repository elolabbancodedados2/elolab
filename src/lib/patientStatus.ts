import { supabase } from '@/integrations/supabase/client';

export const PATIENT_STATUS_REASONS = [
  'solicitacao_titular',
  'cadastro_duplicado',
  'cadastro_incorreto',
  'transferencia_clinica',
  'retorno_ao_atendimento',
  'correcao_cadastro',
  'outro',
] as const;

export type PatientStatusReason = typeof PATIENT_STATUS_REASONS[number];

export const PATIENT_STATUS_REASON_LABELS: Record<PatientStatusReason, string> = {
  solicitacao_titular: 'Solicitação do titular',
  cadastro_duplicado: 'Cadastro duplicado',
  cadastro_incorreto: 'Cadastro incorreto',
  transferencia_clinica: 'Transferência para outra clínica',
  retorno_ao_atendimento: 'Retorno ao atendimento',
  correcao_cadastro: 'Correção cadastral concluída',
  outro: 'Outro motivo administrativo',
};

export function isValidPatientStatusReason(reason: string): reason is PatientStatusReason {
  return PATIENT_STATUS_REASONS.includes(reason as PatientStatusReason);
}

export async function setPatientActiveStatus(
  patientId: string,
  active: boolean,
  reason: PatientStatusReason,
): Promise<{ ativo: boolean; alterado: boolean }> {
  if (!patientId || !isValidPatientStatusReason(reason)) {
    throw new Error('Selecione um motivo administrativo válido.');
  }
  const { data, error } = await (supabase as any).rpc('alterar_status_paciente', {
    p_paciente_id: patientId,
    p_ativo: active,
    p_motivo: reason,
  });
  if (error) throw error;
  if (!data || typeof data.ativo !== 'boolean' || typeof data.alterado !== 'boolean') {
    throw new Error('O servidor não confirmou a alteração do status do paciente.');
  }
  return { ativo: data.ativo, alterado: data.alterado };
}
