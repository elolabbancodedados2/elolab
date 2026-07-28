 /**
  * LGPD Compliance Module
  * Lei Geral de Proteção de Dados (Brasil)
  * Direitos: acesso, portabilidade, exclusão, correção
  */

import { supabase } from '@/integrations/supabase/client';

/**
 * As tabelas lgpd_consent_log e lgpd_deletion_log existem no banco (migration
 * 20260414140000_add_lgpd_compliance_tables.sql) mas ainda não constam no
 * types.ts gerado. Conferi coluna a coluna contra a migration: os nomes usados
 * aqui estão corretos. Usamos este alias em vez de @ts-nocheck no arquivo
 * inteiro, para que o resto do módulo continue verificado pelo TypeScript.
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

  let totalDeleted = 0;

  try {
    // Log de deleção (compliance)
    await db.from('lgpd_deletion_log').insert({
      paciente_id: pacienteId,
      deleted_at: new Date().toISOString(),
      reason: reason || 'Right to be forgotten request',
      deleted_by: (await supabase.auth.getUser()).data.user?.id,
    });

    // Deletar registros (ordem importa: foreign keys)
    for (const table of tables) {
      try {
        const { data: count } = await db
          .from(table)
          .delete()
          .eq(table === 'pacientes' ? 'id' : 'paciente_id', pacienteId);

        totalDeleted += 1; // Count de sucesso, não records (API não retorna count)
      } catch (error) {
        console.warn(`Failed to delete from ${table}:`, error);
        // Continue com tabelas seguintes
      }
    }

    return {
      deletedRecords: totalDeleted,
      success: true,
    };
  } catch (error) {
    console.error('Error deleting patient data:', error);
    throw error;
  }
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
  try {
    await db.from('lgpd_consent_log').insert({
      paciente_id: pacienteId,
      consent_type: consentType,
      accepted,
      timestamp: new Date().toISOString(),
      ip_address: ipAddress,
      user_agent: navigator.userAgent,
    });
  } catch (error) {
    console.error('Error logging LGPD consent:', error);
    throw error;
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
