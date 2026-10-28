import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { mapearUsoPlano, type PlanLimits } from '@/lib/planUsage';

export type { PlanLimits } from '@/lib/planUsage';

/** Limites e uso do plano contados pelo servidor, com a mesma regra que valida convites. */
export function usePlanLimits() {
  const { clinicaId } = useSupabaseAuth();

  return useQuery<PlanLimits | null>({
    queryKey: ['plan-limits', clinicaId],
    enabled: !!clinicaId,
    queryFn: async () => {
      if (!clinicaId) return null;
      const { data, error } = await supabase.rpc('uso_plano_clinica');
      if (error) throw error;
      return mapearUsoPlano(data as Parameters<typeof mapearUsoPlano>[0]);
    },
  });
}
