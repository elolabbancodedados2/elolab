 /**
  * LGPD Compliance Module
  * Lei Geral de Proteção de Dados (Brasil)
  * Direitos: acesso, portabilidade, exclusão, correção
  */

import { supabase } from '@/integrations/supabase/client';

/**
 * As tabelas lgpd_* ainda não constam no types.ts gerado. Usamos este alias em
 * vez de @ts-nocheck no arquivo inteiro, para que o resto do módulo continue
 * verificado pelo TypeScript.
 *
 * Elas passaram a existir em 20260729140000_tabelas_lgpd_de_verdade.sql. Antes
 * dessa migration não existiam, e como o supabase-js não lança em erro de API,
 * cada gravação daqui falhava em silêncio. A migration antiga citada no
 * comentário anterior (20260414140000) nunca foi aplicada.
 */
const db = supabase as any;

export interface PatientDataExport {
  profile: any;
  paciente: any;
  agendamentos: any[];
  prontuarios: any[];
  prescricoes: any[];
  exames: any[];
  triagens: any[];
  attachments: any[];
  audit_log: any[];
  consent_log: any[];
}

/**
 * Exportar todos os dados de um paciente (direito à portabilidade)
 */
export async function exportPatientData(pacienteId: string): Promise<PatientDataExport> {
  const tables = [
    'pacientes',
    'agendamentos',
    'prontuarios',
    'prescricoes',
    'exames',
    'triagens',
    'anexos_prontuario',
  ];

  const data: any = {};

  try {
    // Paciente base
    const { data: paciente } = await supabase
      .from('pacientes')
      .select('*')
      .eq('id', pacienteId)
      .single();

    data.paciente = paciente;

    // Todos os registros relacionados
    for (const table of tables) {
      const { data: records } = await db
        .from(table)
        .select('*')
        .eq('paciente_id', pacienteId);

      data[table] = records || [];
    }

    // Audit log do paciente
    const { data: auditLog } = await supabase
      .from('audit_log')
      .select('*')
      .eq('record_id', pacienteId);

    data.audit_log = auditLog || [];

    // Consentimentos LGPD
    const { data: consentLog } = await db
      .from('lgpd_consent_log')
      .select('*')
      .eq('paciente_id', pacienteId);

    data.consent_log = consentLog || [];

    return data;
  } catch (error) {
    console.error('Error exporting patient data:', error);
    throw error;
  }
}

/**
 * Direito ao esquecimento (Right to be forgotten)
 * Deletar todos os dados de um paciente
 * ⚠️ IRREVERSÍVEL - Requer confirmação
 */
export async function deletePatientData(
  pacienteId: string,
  reason?: string
): Promise<{ deletedRecords: number; success: boolean }> {
  const tables = [
    'anexos_prontuario',
    'prescricoes',
    'exames',
    'triagens',
    'prontuarios',
    'agendamentos',
    'pacientes', // Delete paciente por último (FK constraints)
  ];

  // O registro vem ANTES de apagar, e um erro aqui interrompe tudo: apagar os
  // dados de um paciente sem deixar registro de quem pediu, quando e por quê é
  // pior do que não apagar — é justamente o que a LGPD exige comprovar.
  const { error: erroLog } = await db.from('lgpd_deletion_log').insert({
    paciente_id: pacienteId,
    deleted_at: new Date().toISOString(),
    reason: reason || 'Right to be forgotten request',
    deleted_by: (await supabase.auth.getUser()).data.user?.id,
  });

  if (erroLog) {
    throw new Error(
      `Não foi possível registrar a exclusão, então nada foi apagado: ${erroLog.message}`
    );
  }

  // Ordem importa por causa das chaves estrangeiras.
  //
  // `.select('id')` é o que faz o PostgREST devolver as linhas removidas — sem
  // ele a resposta vem vazia e não há como saber se algo foi apagado. A versão
  // anterior contava tabelas percorridas, não registros, e devolvia
  // success: true mesmo quando o RLS barrava tudo: a tela dizia ao paciente que
  // seus dados foram apagados sem que nada tivesse saído do banco.
  let totalDeleted = 0;
  const falhas: string[] = [];

  for (const table of tables) {
    const { data: removidos, error } = await db
      .from(table)
      .delete()
      .eq(table === 'pacientes' ? 'id' : 'paciente_id', pacienteId)
      .select('id');

    if (error) {
      falhas.push(`${table}: ${error.message}`);
      continue;
    }
    totalDeleted += removidos?.length ?? 0;
  }

  if (falhas.length) {
    throw new Error(
      `Exclusão incompleta — ${totalDeleted} registro(s) apagado(s) antes da falha. ` +
        `Tabelas com erro: ${falhas.join('; ')}`
    );
  }

  return { deletedRecords: totalDeleted, success: true };
}

/**
 * Registrar consentimento LGPD
 */
export async function logLGPDConsent(
  pacienteId: string,
  consentType: 'data_processing' | 'marketing' | 'third_party' | 'revocation',
  accepted: boolean,
  ipAddress?: string
): Promise<void> {
  // O try/catch anterior não pegava nada: o supabase-js devolve { error } em vez
  // de lançar, então o consentimento sumia sem ninguém saber.
  const { error } = await db.from('lgpd_consent_log').insert({
    paciente_id: pacienteId,
    consent_type: consentType,
    accepted,
    timestamp: new Date().toISOString(),
    ip_address: ipAddress,
    user_agent: navigator.userAgent,
  });

  if (error) {
    throw new Error(`Não foi possível registrar o consentimento: ${error.message}`);
  }
}

/**
 * Obter histórico de consentimentos
 */
export async function getConsentHistory(pacienteId: string) {
  try {
    const { data } = await db
      .from('lgpd_consent_log')
      .select('*')
      .eq('paciente_id', pacienteId)
      .order('timestamp', { ascending: false });

    return data || [];
  } catch (error) {
    console.error('Error fetching consent history:', error);
    throw error;
  }
}

/**
 * Revogar consentimento de processamento de dados
 */
export async function revokeDataProcessingConsent(pacienteId: string): Promise<void> {
  await logLGPDConsent(pacienteId, 'revocation', false);
}

/**
 * Check se paciente revogou consentimento
 */
export async function hasRevokedConsent(pacienteId: string): Promise<boolean> {
  const history = await getConsentHistory(pacienteId);

  // Última revogação é mais recente que última aceitação?
  const lastRevocation = history.find(h => h.consent_type === 'revocation' && !h.accepted);
  const lastAcceptance = history.find(h => h.consent_type === 'data_processing' && h.accepted);

  if (!lastRevocation) return false;
  if (!lastAcceptance) return true;

  return new Date(lastRevocation.timestamp) > new Date(lastAcceptance.timestamp);
}

/**
 * Corrigir dados pessoais do paciente
 */
export async function correctPatientData(
  pacienteId: string,
  updates: Record<string, any>
): Promise<void> {
  try {
    // Log de correção para auditoria
    const { data: user } = await supabase.auth.getUser();

    // Este insert falhava silenciosamente e a correção não era auditada:
    // `details` não existe em audit_log (a coluna é `changes`) e 'DATA_CORRECTION'
    // viola o CHECK action IN ('create','update','delete'). Correção de dado de
    // paciente sem registro de auditoria é falha de conformidade LGPD.
    const { error: auditError } = await supabase.from('audit_log').insert({
      action: 'update',
      collection: 'pacientes',
      record_id: pacienteId,
      user_id: user.user?.id,
      changes: {
        motivo: 'DATA_CORRECTION',
        alteracoes: updates,
        timestamp: new Date().toISOString(),
      },
    });

    if (auditError) throw auditError;

    // Aplicar correção
    await db
      .from('pacientes')
      .update(updates)
      .eq('id', pacienteId);
  } catch (error) {
    console.error('Error correcting patient data:', error);
    throw error;
  }
}

/**
 * Gerar relatório de conformidade LGPD
 */
export async function generateLGPDComplianceReport(clinicaId: string) {
  try {
    const { data: deletionLogs } = await db
      .from('lgpd_deletion_log')
      .select('*')
      .order('deleted_at', { ascending: false });

    const { data: consentLogs } = await db
      .from('lgpd_consent_log')
      .select('*')
      .order('timestamp', { ascending: false });

    return {
      totalDeletionRequests: deletionLogs?.length || 0,
      totalConsentRecords: consentLogs?.length || 0,
      deletionRequests: deletionLogs || [],
      consentRecords: consentLogs || [],
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error generating LGPD report:', error);
    throw error;
  }
}
