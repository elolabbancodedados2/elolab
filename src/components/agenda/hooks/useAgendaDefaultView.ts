import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from 'sonner';
import type { AgendaView } from '../AgendaPage';

const KEY = 'agenda_default_view';

export function useAgendaDefaultView() {
  const { user, profile } = useSupabaseAuth();
  const userId = user?.id ?? profile?.id;
  const [defaultView, setDefaultViewState] = useState<AgendaView | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) { setLoaded(true); return; }
    (async () => {
      const { data } = await (supabase.from('configuracoes_clinica' as any)
        .select('valor').eq('user_id', userId).eq('chave', KEY).maybeSingle() as any);
      const v = (data?.valor as any)?.view as AgendaView | undefined;
      if (v === 'daily' || v === 'weekly' || v === 'monthly') setDefaultViewState(v);
      setLoaded(true);
    })();
  }, [userId]);

  const setDefaultView = async (view: AgendaView) => {
    if (!userId) {
      toast.error('Não foi possível salvar: usuário não identificado');
      return;
    }
    const label = view === 'daily' ? 'Dia' : view === 'weekly' ? 'Semana' : 'Mês';
    const prev = defaultView;
    setDefaultViewState(view);
    const { error } = await (supabase.from('configuracoes_clinica' as any).upsert({
      user_id: userId,
      chave: KEY,
      valor: { view } as any,
    }, { onConflict: 'user_id,chave' }) as any);
    if (error) {
      setDefaultViewState(prev);
      toast.error('Erro ao salvar visão padrão');
    } else {
      toast.success(`Visão padrão definida: ${label}`);
    }
  };

  return { defaultView, setDefaultView, loaded };
}
