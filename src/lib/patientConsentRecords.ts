import { supabase } from '@/integrations/supabase/client';

export async function loadPatientConsentRecords(clinicId: string, patientId: string) {
  const { data, error } = await supabase
    .from('consentimentos_lgpd')
    .select('id, tipo_consentimento, versao_termo, aceito, data_aceite, revogado, data_revogacao, motivo_revogacao')
    .eq('clinica_id', clinicId)
    .eq('paciente_id', patientId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
