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
    agendado: 'hsl(var(--primary))',
    confirmado: 'hsl(var(--success))',
    aguardando: 'hsl(var(--warning))',
    aguardando_triagem: 'hsl(var(--warning))',
    em_triagem: 'hsl(var(--highlight))',
    fila_atendimento: 'hsl(var(--warning))',
    em_atendimento: 'hsl(var(--primary))',
    finalizado: 'hsl(var(--muted-foreground))',
    atendimento_finalizado: 'hsl(var(--muted-foreground))',
    aguardando_pagamento: 'hsl(var(--warning))',
    aguardando_pagamento_adicional: 'hsl(var(--destructive))',
    pago: 'hsl(var(--success))',
    cancelado: 'hsl(var(--destructive))',
    faltou: 'hsl(var(--warning))',
  },
};

export const PALETTE = [
  { label: 'Azul primário', value: 'hsl(var(--primary))' },
  { label: 'Azul-marinho', value: 'hsl(var(--sidebar-background))' },
  { label: 'Ciano EloLab', value: 'hsl(var(--highlight))' },
  { label: 'Sucesso', value: 'hsl(var(--success))' },
  { label: 'Aviso', value: 'hsl(var(--warning))' },
  { label: 'Erro', value: 'hsl(var(--destructive))' },
  { label: 'Neutro', value: 'hsl(var(--muted-foreground))' },
] as const;

const FALLBACK_COLOR = 'hsl(var(--primary))';

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
