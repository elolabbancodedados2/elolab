import { supabase } from '@/integrations/supabase/client';

export async function revokePatientPortalLinks(patientId: string): Promise<number> {
  const { data, error } = await (supabase as any).rpc('revogar_links_portal_paciente', {
    p_paciente_id: patientId,
  });
  if (error) throw error;

  const revokedCount = Number(data ?? 0);
  if (!Number.isSafeInteger(revokedCount) || revokedCount < 0) {
    throw new Error('O servidor retornou uma confirmação inválida de revogação.');
  }
  return revokedCount;
}
