import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook that returns the medico record linked to the current logged-in user.
 * Returns null if the user has no securely linked medico record.
 */
export function useCurrentMedico() {
  const { user, profile, hasRole, isAdmin } = useSupabaseAuth();
  const currentMedicoQuery = useQuery({
    queryKey: queryKeys.medicoAtual(profile?.clinica_id, user?.id),
    enabled: !!user && !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('buscar_medico_atual');
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
  const currentMedico = currentMedicoQuery.data ?? null;

  const isMedicoOnly = useMemo(() => {
    if (!profile) return false;
    // Clinicians without operational or admin roles use their own schedule.
    // Reception and nursing keep the clinic-wide clinical schedule.
    return hasRole('medico') && !isAdmin() && !hasRole('recepcao') && !hasRole('enfermagem');
  }, [profile, hasRole, isAdmin]);

  return {
    currentMedico,
    medicoId: currentMedico?.id || null,
    isMedicoOnly,
    isLoading: currentMedicoQuery.isLoading,
    error: currentMedicoQuery.error,
    refetch: currentMedicoQuery.refetch,
  };
}
