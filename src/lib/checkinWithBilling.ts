import { supabase } from '@/integrations/supabase/client';
import { createAutoBillingDetailed, type AutoBillingOutcome, type AutoBillingParams } from '@/lib/autoBilling';
import { atomicCheckin, type OperationalTransitionResult } from '@/lib/operationalTransitions';

type PrioridadeFila = 'normal' | 'preferencial' | 'urgente';

export type CheckinWithBillingResult = OperationalTransitionResult & {
  billingOutcome?: AutoBillingOutcome;
};

/**
 * Check-in e cobrança são operações separadas. O resultado discriminado do
 * faturamento distingue consulta gratuita de cobrança já existente; em falha,
 * o banco só desfaz uma fila que ainda não avançou.
 */
export async function checkinComCobranca(
  cobranca: AutoBillingParams,
  prioridade: PrioridadeFila = 'normal',
): Promise<CheckinWithBillingResult> {
  if (!cobranca.clinicaId) {
    return { success: false, message: 'Não foi possível validar a clínica do atendimento. Atualize o perfil antes de fazer check-in.', actions: [] };
  }
  const checkin = await atomicCheckin(cobranca.agendamentoId, cobranca.clinicaId, prioridade);
  if (!checkin.success) return checkin;

  try {
    const billingOutcome = await createAutoBillingDetailed(cobranca);
    const { error: estadoError } = await (supabase as any).rpc('confirmar_estado_cobranca_checkin', {
      p_agendamento_id: cobranca.agendamentoId,
      p_clinica_id: cobranca.clinicaId,
      p_gratuito: billingOutcome === 'free',
    });
    if (estadoError) throw estadoError;
    return { ...checkin, billingOutcome };
  } catch (billingError) {
    const detalhe = billingError instanceof Error ? billingError.message : 'Erro desconhecido ao gerar a cobrança.';

    // A resposta de uma gravação pode se perder depois do commit. Confirme o
    // estado persistido antes de remover o paciente da fila.
    const { data: temCobrancaAtiva, error: erroVerificacao } = await (supabase as any).rpc(
      'tem_cobranca_ativa_do_agendamento',
      { p_agendamento_id: cobranca.agendamentoId, p_clinica_id: cobranca.clinicaId },
    );
    if (erroVerificacao) {
      return {
        ...checkin,
        success: false,
        message: `A cobrança não pôde ser confirmada. Atualize a fila e confira o financeiro antes de avançar. ${detalhe}`,
      };
    }

    if (temCobrancaAtiva === true) {
      const { error: confirmarError } = await (supabase as any).rpc('confirmar_estado_cobranca_checkin', {
        p_agendamento_id: cobranca.agendamentoId,
        p_clinica_id: cobranca.clinicaId,
        p_gratuito: false,
      });
      if (confirmarError) {
        return {
          ...checkin,
          success: false,
          message: `A cobrança existe, mas o estado do check-in ainda não foi confirmado. Atualize e tente retomar. ${confirmarError.message}`,
        };
      }
      return {
        ...checkin,
        success: true,
        billingOutcome: 'already_exists',
        message: 'Check-in realizado e cobrança confirmada no financeiro.',
      };
    }

    // Uma entrada que já existia pertence a outra tentativa; não a remova.
    if (checkin.actions.length === 0) {
      return {
        ...checkin,
        success: false,
        message: `A cobrança não foi confirmada: ${detalhe}. Atualize a fila e confira o financeiro antes de avançar.`,
      };
    }

    if (!checkin.filaId || !checkin.statusAnterior) {
      return {
        ...checkin,
        success: false,
        message: `A cobrança não foi confirmada e não foi possível verificar o estado original do check-in. Verifique este paciente antes de continuar. ${detalhe}`,
      };
    }

    const { data: rollback, error: erroRollback } = await (supabase as any).rpc('desfazer_checkin_sem_cobranca', {
      p_agendamento_id: cobranca.agendamentoId,
      p_fila_id: checkin.filaId,
      p_clinica_id: cobranca.clinicaId,
      p_status_anterior: checkin.statusAnterior,
    });
    if (erroRollback) {
      return {
        ...checkin,
        success: false,
        message: `A cobrança falhou e não foi possível desfazer o check-in com segurança. Verifique este paciente antes de continuar. ${detalhe}`,
      };
    }

    if (rollback?.motivo === 'cobranca_ativa') {
      return {
        ...checkin,
        success: true,
        billingOutcome: 'already_exists',
        message: 'Check-in realizado e cobrança confirmada no financeiro.',
      };
    }

    const mensagem = rollback?.desfeito
      ? ' A entrada na fila foi desfeita.'
      : ' O estado do check-in mudou durante a tentativa. Atualize a fila e confira a cobrança antes de continuar.';
    return {
      ...checkin,
      success: false,
      message: `O check-in não foi confirmado porque a cobrança falhou: ${detalhe}.${mensagem}`,
      actions: rollback?.desfeito ? [] : checkin.actions,
    };
  }
}
