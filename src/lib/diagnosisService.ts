 // @ts-nocheck
 /**
  * Diagnosis Service
  * Funções para gerenciar diagnósticos CID-10 do paciente e prontuário
  */

import { supabase } from '@/integrations/supabase/client';
import type { DiagnosisEntry } from '@/components/CID10DiagnosisSelector';

/**
 * Adicionar diagnósticos a um prontuário
 */
export async function addProntuarioDiagnoses(
  prontuarioId: string,
  diagnoses: DiagnosisEntry[]
): Promise<void> {
  if (!diagnoses || diagnoses.length === 0) return;

  try {
    // Preparar dados para inserção
    const diagnosisRecords = diagnoses.map(d => ({
      prontuario_id: prontuarioId,
      codigo_cid: d.codigo,
      descricao: d.descricao,
      tipo: d.tipo,
      confirmado: d.confirmado || false,
    }));

    const { error } = await supabase
      .from('prontuario_diagnosticos')
      .insert(diagnosisRecords);

    if (error) throw error;
  } catch (error) {
    console.error('Error adding prontuario diagnoses:', error);
    throw error;
  }
}

/**
 * Obter diagnósticos de um prontuário
 */
export async function getProntuarioDiagnoses(prontuarioId: string): Promise<DiagnosisEntry[]> {
  try {
    const { data, error } = await supabase
      .from('prontuario_diagnosticos')
      .select('codigo_cid, descricao, tipo, confirmado')
      .eq('prontuario_id', prontuarioId)
      .order('tipo', { ascending: true });

    if (error) throw error;

    return (data || []).map(d => ({
      codigo: d.codigo_cid,
      descricao: d.descricao,
      tipo: d.tipo as 'principal' | 'secundario' | 'diferencial',
      confirmado: d.confirmado,
    }));
  } catch (error) {
    console.error('Error fetching prontuario diagnoses:', error);
    throw error;
  }
}

/**
 * Atualizar diagnósticos de um prontuário
 */
export async function updateProntuarioDiagnoses(
  prontuarioId: string,
  diagnoses: DiagnosisEntry[]
): Promise<void> {
  try {
    // Deletar diagnósticos antigos
    const { error: deleteError } = await supabase
      .from('prontuario_diagnosticos')
      .delete()
      .eq('prontuario_id', prontuarioId);

    if (deleteError) throw deleteError;

    // Adicionar novos diagnósticos
    if (diagnoses.length > 0) {
      await addProntuarioDiagnoses(prontuarioId, diagnoses);
    }
  } catch (error) {
    console.error('Error updating prontuario diagnoses:', error);
    throw error;
  }
}

/**
 * Adicionar comorbidades ao paciente
 */
export async function addPatientComorbidities(
  pacienteId: string,
  comorbidities: DiagnosisEntry[]
): Promise<void> {
  if (!comorbidities || comorbidities.length === 0) return;

  try {
    const comorbidityRecords = comorbidities.map(c => ({
      paciente_id: pacienteId,
      codigo_cid: c.codigo,
      descricao: c.descricao,
      data_diagnostico: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
      ativo: true,
    }));

    const { error } = await supabase
      .from('paciente_comorbidades')
      .insert(comorbidityRecords);

    if (error) throw error;
  } catch (error) {
    console.error('Error adding patient comorbidities:', error);
    throw error;
  }
}

/**
 * Obter comorbidades de um paciente
 */
export async function getPatientComorbidities(pacienteId: string): Promise<DiagnosisEntry[]> {
  try {
    const { data, error } = await supabase
      .from('paciente_comorbidades')
      .select('codigo_cid, descricao')
      .eq('paciente_id', pacienteId)
      .eq('ativo', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(c => ({
      codigo: c.codigo_cid,
      descricao: c.descricao,
      tipo: 'secundario' as const,
      confirmado: true,
    }));
  } catch (error) {
    console.error('Error fetching patient comorbidities:', error);
    throw error;
  }
}

/**
 * Atualizar comorbidades do paciente
 */
export async function updatePatientComorbidities(
  pacienteId: string,
  comorbidities: DiagnosisEntry[]
): Promise<void> {
  try {
    // Marcar todos como inativos
    const { error: updateError } = await supabase
      .from('paciente_comorbidades')
      .update({ ativo: false })
      .eq('paciente_id', pacienteId);

    if (updateError) throw updateError;

    // Adicionar novos
    if (comorbidities.length > 0) {
      await addPatientComorbidities(pacienteId, comorbidities);
    }
  } catch (error) {
    console.error('Error updating patient comorbidities:', error);
    throw error;
  }
}

/**
 * Validar diagnóstico contra comorbidades do paciente
 * Retorna alertas se houver interações importantes
 */
export async function validateDiagnosisAgainstComorbidities(
  pacienteId: string,
  newDiagnosis: string
): Promise<string[]> {
  const alerts: string[] = [];

  try {
    const comorbidities = await getPatientComorbidities(pacienteId);

    // Verificar combinações perigosas
    const dangerousCombinations: Record<string, string[]> = {
      'E11': ['N18', 'I10', 'I50'], // Diabetes tipo 2 + Insuf. renal, HAS, IC
      'I10': ['N18', 'I50', 'I63'], // HAS + Insuf. renal, IC, AVE
      'I21': ['I63', 'I70'], // IAM + AVE, Aterosclerose
      'N18': ['E11', 'I10'], // Insuf. renal + Diabetes, HAS
    };

    const combinations = dangerousCombinations[newDiagnosis];
    if (combinations) {
      for (const comorbidity of comorbidities) {
        if (combinations.includes(comorbidity.codigo)) {
          alerts.push(
            `⚠️ Combinação clínica importante: ${newDiagnosis} com ${comorbidity.codigo} - Revisar abordagem terapêutica`
          );
        }
      }
    }
  } catch (error) {
    console.error('Error validating diagnosis:', error);
  }

  return alerts;
}

/**
 * Obter resumo de diagnósticos do paciente
 */
export async function getPatientDiagnosisSummary(pacienteId: string) {
  try {
    const { data: diagnoses, error: diagError } = await supabase
      .from('prontuario_diagnosticos')
      .select('codigo_cid, tipo, confirmado')
      .eq('prontuario_id', (
        await supabase
          .from('prontuarios')
          .select('id')
          .eq('paciente_id', pacienteId)
          .order('data', { ascending: false })
          .limit(1)
      ).data?.[0]?.id || '');

    const { data: comorbidities, error: comError } = await supabase
      .from('paciente_comorbidades')
      .select('codigo_cid, descricao')
      .eq('paciente_id', pacienteId)
      .eq('ativo', true);

    if (diagError || comError) throw diagError || comError;

    return {
      lastDiagnoses: diagnoses || [],
      activeComorbidities: comorbidities || [],
      principalDiagnosis: (diagnoses || []).find(d => d.tipo === 'principal'),
    };
  } catch (error) {
    console.error('Error getting diagnosis summary:', error);
    return {
      lastDiagnoses: [],
      activeComorbidities: [],
      principalDiagnosis: null,
    };
  }
}
