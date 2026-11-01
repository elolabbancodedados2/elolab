import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

export type ClinicOnboardingStepKey = 'team' | 'schedule' | 'services' | 'whatsapp' | 'appointment';
export type ClinicOnboardingStep = { key: ClinicOnboardingStepKey; complete: boolean; count: number };
export type ClinicOnboardingOverview = {
  completed_steps: number;
  total_steps: number;
  progress: number;
  completed_at: string | null;
  steps: ClinicOnboardingStep[];
};

/**
 * Progresso de implantação calculado no banco (`clinic_onboarding_overview`).
 * É a fonte única para a tela de primeiros passos e para o Início, para que
 * os dois mostrem os mesmos números.
 */
export function useClinicOnboardingOverview(options: { staleTime?: number; suppressGlobalErrorToast?: boolean } = {}) {
  const { user, profile } = useSupabaseAuth();
  return useQuery({
    queryKey: ['clinic-onboarding', user?.id ?? null, profile?.clinica_id ?? null],
    enabled: !!user && !!profile?.clinica_id,
    meta: options.suppressGlobalErrorToast ? { suppressGlobalErrorToast: true } : undefined,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('clinic_onboarding_overview');
      if (error) throw error;
      return data as unknown as ClinicOnboardingOverview;
    },
    staleTime: options.staleTime ?? 0,
  });
}
