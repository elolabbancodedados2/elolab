import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import type { AgendaView } from '../AgendaPage';

const KEY = 'agenda_default_view';

export function useAgendaDefaultView() {
  const { profile } = useSupabaseAuth() as any;
  const [defaultView, setDefaultViewState] = useState<AgendaView | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile?.user_id) { setLoaded(true); return; }
    (async () => {
      const { data } = await (supabase.from('configuracoes_clinica' as any)
        .select('valor').eq('user_id', profile.user_id).eq('chave', KEY).maybeSingle() as any);
      const v = (data?.valor as any)?.view as AgendaView | undefined;
      if (v === 'daily' || v === 'weekly' || v === 'monthly') setDefaultViewState(v);
      setLoaded(true);
    })();
  }, [profile?.user_id]);

  const setDefaultView = async (view: AgendaView) => {
    setDefaultViewState(view);
    if (!profile?.user_id) return;
    await (supabase.from('configuracoes_clinica' as any).upsert({
      user_id: profile.user_id,
      chave: KEY,
      valor: { view } as any,
    }, { onConflict: 'user_id,chave' }) as any);
  };

  return { defaultView, setDefaultView, loaded };
}