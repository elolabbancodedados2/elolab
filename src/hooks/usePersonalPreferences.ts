import { useEffect } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';

/** Aplica preferências visuais no shell inteiro, sempre consultando o tenant ativo. */
export function usePersonalPreferences() {
  const { user, profile } = useSupabaseAuth();

  useEffect(() => {
    if (!user?.id || !profile?.clinica_id) return;
    let active = true;
    void (supabase as any).from('user_preferences').select('density')
      .eq('user_id', user.id).eq('clinica_id', profile.clinica_id).maybeSingle()
      .then(({ data }: { data: { density?: string } | null }) => {
        if (active) document.documentElement.dataset.density = data?.density === 'compact' ? 'compact' : 'comfortable';
      });
    return () => { active = false; };
  }, [user?.id, profile?.clinica_id]);
}
