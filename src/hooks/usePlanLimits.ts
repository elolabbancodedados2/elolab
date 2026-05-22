import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

export interface PlanLimits {
  plano_nome: string | null;
  max_medicos: number;
  max_recepcao: number;
  max_funcionarios_total: number;
  max_storage_mb: number;
  current: {
    medicos: number;
    funcionarios_total: number;
  };
  canAdd: {
    medico: boolean;
    funcionario: boolean;
  };
}

export function usePlanLimits() {
  const { clinicaId } = useSupabaseAuth();

  return useQuery<PlanLimits | null>({
    queryKey: ['plan-limits', clinicaId],
    enabled: !!clinicaId,
    queryFn: async () => {
      if (!clinicaId) return null;

      const { data: clinica } = await (supabase as any)
        .from('clinicas')
        .select('plano_id')
        .eq('id', clinicaId)
        .maybeSingle();

      let plano: any = null;
      if (clinica?.plano_id) {
        const { data } = await (supabase as any)
          .from('planos')
          .select('nome, max_medicos, max_recepcao, max_funcionarios_total, max_storage_mb')
          .eq('id', clinica.plano_id)
          .maybeSingle();
        plano = data;
      }

      // Defaults (sem plano = limites generosos)
      const max_medicos = plano?.max_medicos ?? 999;
      const max_recepcao = plano?.max_recepcao ?? 999;
      const max_funcionarios_total = plano?.max_funcionarios_total ?? 999;
      const max_storage_mb = plano?.max_storage_mb ?? 100000;

      const [{ count: funcCount }, { count: medCount }] = await Promise.all([
        (supabase as any).from('funcionarios').select('id', { count: 'exact', head: true }).eq('clinica_id', clinicaId),
        (supabase as any).from('medicos').select('id', { count: 'exact', head: true }).eq('clinica_id', clinicaId).eq('ativo', true),
      ]);

      const funcionarios_total = funcCount ?? 0;
      const medicos = medCount ?? 0;

      return {
        plano_nome: plano?.nome ?? null,
        max_medicos,
        max_recepcao,
        max_funcionarios_total,
        max_storage_mb,
        current: { medicos, funcionarios_total },
        canAdd: {
          medico: medicos < max_medicos && funcionarios_total < max_funcionarios_total,
          funcionario: funcionarios_total < max_funcionarios_total,
        },
      };
    },
  });
}