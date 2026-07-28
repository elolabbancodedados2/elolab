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
    agendado: '#3b82f6',
    confirmado: '#10b981',
    aguardando: '#f59e0b',
    em_atendimento: '#6366f1',
    finalizado: '#94a3b8',
    cancelado: '#ef4444',
    faltou: '#f97316',
  },
};

export const PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
  '#06b6d4', '#f97316', '#84cc16', '#14b8a6', '#6366f1', '#94a3b8',
];

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
      case 'status': return scheme.map[ag.status] || DEFAULT_SCHEME.map[ag.status] || '#3b82f6';
      case 'tipo': return scheme.map[ag.tipo] || '#3b82f6';
      case 'medico': return scheme.map[ag.medico_id] || '#3b82f6';
      case 'convenio': return scheme.map[ag.convenio_id || 'particular'] || '#3b82f6';
    }
  };

  return { scheme, setScheme, colorFor };
}
