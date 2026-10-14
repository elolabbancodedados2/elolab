import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { applyUIPreferences, resolveStartPage } from '@/lib/uiPreferences';

/** Aplica preferências visuais no shell inteiro, sempre consultando o tenant ativo. */
export function usePersonalPreferences() {
  const { user, profile } = useSupabaseAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user?.id || !profile?.clinica_id) return;
    let active = true;
    void (supabase as any).from('user_preferences').select('density,high_contrast,text_size,start_page,date_format')
      .eq('user_id', user.id).eq('clinica_id', profile.clinica_id).maybeSingle()
      .then(({ data }: { data: { density?: 'comfortable' | 'compact'; high_contrast?: boolean; text_size?: 'normal' | 'large'; date_format?: 'DD/MM/YYYY' | 'YYYY-MM-DD'; start_page?: '/dashboard' | '/agenda' | '/tarefas' | '/notificacoes' } | null }) => {
        if (!active) return;
        applyUIPreferences(data ?? {});
        if (pathname !== '/dashboard') return;
        const sessionKey = `elolab-start-page-applied:${user.id}:${profile.clinica_id}:${[...(profile.roles ?? [])].sort().join(',')}`;
        try {
          if (sessionStorage.getItem(sessionKey)) return;
          sessionStorage.setItem(sessionKey, 'true');
        } catch {
          // The preference still applies when session storage is unavailable.
        }
        const startPage = resolveStartPage(data?.start_page, profile.roles ?? []);
        if (startPage !== pathname) navigate(startPage, { replace: true });
      });
    return () => { active = false; };
  }, [navigate, pathname, user?.id, profile?.clinica_id, profile?.roles]);
}
