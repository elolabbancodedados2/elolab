import { useMemo } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useMedicos } from '@/hooks/useSupabaseData';

/**
 * Hook that returns the medico record linked to the current logged-in user.
 * Returns null if the user is not a doctor or has no linked medico record.
 */
export function useCurrentMedico() {
  const { user, profile, hasRole, isAdmin } = useSupabaseAuth();
  const { data: medicos = [] } = useMedicos();

  const currentMedico = useMemo(() => {
    if (!user) return null;
    const byUser = medicos.find(m => m.user_id === user.id);
    if (byUser) return byUser;
    // Convites antigos podem ter criado a ficha antes de vincular user_id.
    // O e-mail é um segundo vínculo dentro da clínica já filtrada pelo hook.
    return medicos.find(m => m.email?.trim().toLowerCase() === user.email?.trim().toLowerCase()) || null;
  }, [user, medicos]);

  const isMedicoOnly = useMemo(() => {
    if (!profile) return false;
    // User is medico but NOT admin
    return hasRole('medico') && !isAdmin();
  }, [profile, hasRole, isAdmin]);

  return {
    currentMedico,
    medicoId: currentMedico?.id || null,
    isMedicoOnly,
  };
}
