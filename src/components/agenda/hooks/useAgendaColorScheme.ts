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
  { label: 'Azul-marinho', value: 'hsl(var(--brand-dark))' },
  { label: 'Ciano EloLab', value: 'hsl(var(--highlight))' },
  { label: 'Sucesso', value: 'hsl(var(--success))' },
  { label: 'Aviso', value: 'hsl(var(--warning))' },
  { label: 'Erro', value: 'hsl(var(--destructive))' },
  { label: 'Neutro', value: 'hsl(var(--muted-foreground))' },
] as const;

const FALLBACK_COLOR = 'hsl(var(--primary))';

const KEY = 'agenda_color_scheme';

export function useAgendaColorScheme() {
  const { user, profile } = useSupabaseAuth();
  const userId = user?.id ?? profile?.id;
  const [scheme, setSchemeState] = useState<ColorScheme>(DEFAULT_SCHEME);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadRevision, setLoadRevision] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!userId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setLoadError(null);
      try {
        const { data, error } = await (supabase.from('configuracoes_clinica' as any)
          .select('valor').eq('user_id', userId).eq('chave', KEY).maybeSingle() as any);
        if (error) throw error;
        if (!active) return;
        if (data?.valor) {
          const value = data.valor as ColorScheme;
          setSchemeState({
            criterion: value.criterion || DEFAULT_SCHEME.criterion,
            map: { ...DEFAULT_SCHEME.map, ...(value.map || {}) },
          });
        } else {
          setSchemeState(DEFAULT_SCHEME);
        }
      } catch {
        if (active) setLoadError('Não foi possível carregar as cores salvas. Tente novamente.');
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [userId, loadRevision]);

  const setScheme = async (next: ColorScheme) => {
    if (!userId) throw new Error('Não foi possível identificar o usuário atual.');
    const { error } = await (supabase.from('configuracoes_clinica' as any).upsert({
      user_id: userId,
      chave: KEY,
      valor: next as any,
    }, { onConflict: 'user_id,chave' }) as any);
    if (error) throw error;
    setSchemeState(next);
  };

  const colorFor = (ag: any) => {
    switch (scheme.criterion) {
      case 'status': return scheme.map[ag.status] || DEFAULT_SCHEME.map[ag.status] || FALLBACK_COLOR;
      case 'tipo': return scheme.map[ag.tipo] || FALLBACK_COLOR;
      case 'medico': return scheme.map[ag.medico_id] || FALLBACK_COLOR;
      case 'convenio': return scheme.map[ag.convenio_id || 'particular'] || FALLBACK_COLOR;
    }
  };

  return { scheme, setScheme, colorFor, isLoading, loadError, reload: () => setLoadRevision(revision => revision + 1) };
}
