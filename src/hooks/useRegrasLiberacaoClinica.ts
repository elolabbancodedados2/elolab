import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

export interface RegrasLiberacaoClinica {
  exigir_pagamento_previo: boolean | null;
  exigir_triagem: boolean | null;
}

/**
 * Regras da clínica que o banco aplica antes do início do atendimento
 * (triggers `triagem_antes_do_atendimento` e `pagamento_antes_do_atendimento`).
 *
 * Usa a mesma chave de cache da Fila, para Agenda, Recepção e Fila lerem a
 * mesma resposta. A tela só antecipa o motivo; a verdade continua no banco.
 */
export function useRegrasLiberacaoClinica() {
  const { profile } = useSupabaseAuth();
  const clinicaId = profile?.clinica_id;
  const query = useQuery<RegrasLiberacaoClinica | null>({
    queryKey: ['clinica-exige-pagamento', clinicaId],
    staleTime: 30_000,
    meta: { suppressGlobalErrorToast: true },
    enabled: Boolean(clinicaId),
    queryFn: async () => {
      if (!clinicaId) return null;
      const { data, error } = await (supabase as any)
        .from('clinicas').select('exigir_pagamento_previo, exigir_triagem')
        .eq('id', clinicaId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return {
    ...query,
    triagemObrigatoria: Boolean(query.data?.exigir_triagem),
    pagamentoObrigatorio: Boolean(query.data?.exigir_pagamento_previo),
  };
}
