import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

export type ColorCriterion = 'status' | 'convenio' | 'tipo' | 'medico';

export interface ColorScheme {
  criterion: ColorCriterion;
  map: Record<string, string>;
}

const DEFAULT_SCHEME: ColorScheme = {
  criterion: 'status',
  map: {
    agendado: '#1080CA',
    confirmado: '#10b981',
    aguardando: '#f59e0b',
    em_atendimento: '#2ED5E7',
    finalizado: '#8a8f99',
    cancelado: '#ef4444',
    faltou: '#f97316',
  },
};

export const PALETTE = [
  '#1080CA', '#2ED5E7', '#10b981', '#f59e0b', '#ef4444', '#111111',
  '#06b6d4', '#f97316', '#84cc16', '#14b8a6', '#6366f1', '#8a8f99',
];

const FALLBACK_COLOR = '#1080CA';

const KEY = 'agenda_color_scheme';

export function useAgendaColorScheme() {
  const { profile } = useSupabaseAuth() as any;
  const [scheme, setSchemeState] = useState<ColorScheme>(DEFAULT_SCHEME);

  useEffect(() => {
    if (!profile?.user_id) return;
    (async () => {
      const { data } = await (supabase.from('configuracoes_clinica' as any)
        .select('valor').eq('user_id', profile.user_id).eq('chave', KEY).maybeSingle() as any);
      if (data?.valor) {
        try {
          const v = data.valor as ColorScheme;
          setSchemeState({
            criterion: v.criterion || DEFAULT_SCHEME.criterion,
            map: { ...DEFAULT_SCHEME.map, ...(v.map || {}) },
          });
        } catch {
          // preferência salva em formato inválido — mantém o esquema padrão
        }
      }
    })();
  }, [profile?.user_id]);

  const setScheme = async (next: ColorScheme) => {
    setSchemeState(next);
    if (!profile?.user_id) return;
    await (supabase.from('configuracoes_clinica' as any).upsert({
      user_id: profile.user_id,
      chave: KEY,
      valor: next as any,
    }, { onConflict: 'user_id,chave' }) as any);
  };

  const colorFor = (ag: any) => {
    switch (scheme.criterion) {
      case 'status': return scheme.map[ag.status] || DEFAULT_SCHEME.map[ag.status] || FALLBACK_COLOR;
      case 'tipo': return scheme.map[ag.tipo] || FALLBACK_COLOR;
      case 'medico': return scheme.map[ag.medico_id] || FALLBACK_COLOR;
      case 'convenio': return scheme.map[ag.convenio_id || 'particular'] || FALLBACK_COLOR;
    }
  };

  return { scheme, setScheme, colorFor };
}
