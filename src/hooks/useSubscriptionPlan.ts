import { friendlyErrorMessage } from '@/components/ErrorState';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from 'sonner';
import { redirecionarParaCheckout } from '@/lib/safeUrl';
import { canAccessPlanFeature } from '@/lib/planFeatures';
import { normalizarAssinaturaPlano } from '@/lib/subscriptionPlan';

interface Plano {
  id: string;
  nome: string;
  slug: string;
  descricao: string;
  valor: number;
  frequencia: string;
  features: string[];
  ativo: boolean;
  destaque: boolean;
  ordem: number;
  trial_dias: number;
}

export function usePlanos(enabled = true) {
  return useQuery({
    queryKey: ['planos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('planos' as any)
        .select('*')
        .eq('ativo', true)
        .order('ordem');
      if (error) throw error;
      return data as unknown as Plano[];
    },
    enabled,
  });
}

export function useUserPlan() {
  const { user, isPlatformAdmin } = useSupabaseAuth();

  const assinaturaQuery = useQuery({
    queryKey: ['user_plan', user?.id],
    queryFn: async () => {
      if (!user) return null;
      // Read only this user's row through RLS. The old SECURITY DEFINER RPC
      // returned active plans only and omitted trial/term fields, so trial
      // accounts could look unsubscribed and lose the correct feature state.
      const { data, error } = await (supabase as any)
        .from('assinaturas_plano' as any)
        .select('plano_slug, status, em_trial, trial_fim, data_fim, cobranca_modalidade, planos!inner(nome)')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return normalizarAssinaturaPlano(data?.[0]);
    },
    // Platform admins have product access independent of a customer plan.
    // Do not surface a legacy/stale customer row as their subscription.
    enabled: !!user && !isPlatformAdmin,
  });
  const assinatura = isPlatformAdmin ? null : assinaturaQuery.data;

  const hasFeature = (feature: string): boolean => {
    return canAccessPlanFeature(assinatura, feature, isPlatformAdmin);
  };

  const isUltra = assinatura?.plano_slug === 'elolab-ultra';
  const isPro = assinatura?.plano_slug === 'elolab-max';
  const hasActivePlan = !!assinatura && (assinatura.status === 'ativa' || assinatura.status === 'trial');
  const isTrial = assinatura?.em_trial === true && assinatura?.status === 'trial';
  const trialEnd = assinatura?.trial_fim ? new Date(assinatura.trial_fim) : null;

  const trialDaysLeft = trialEnd
    ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return {
    plan: assinatura,
    isExempt: isPlatformAdmin,
    isLoading: !isPlatformAdmin && assinaturaQuery.isLoading,
    isError: !isPlatformAdmin && assinaturaQuery.isError,
    error: isPlatformAdmin ? null : assinaturaQuery.error,
    refetch: assinaturaQuery.refetch,
    hasFeature,
    isUltra,
    isPro,
    hasActivePlan,
    isTrial,
    trialEnd,
    trialDaysLeft,
    planName: isPlatformAdmin ? 'Acesso da plataforma' : assinatura?.plano_nome || null,
    planSlug: assinatura?.plano_slug || null,
  };
}

export interface PlatformSubscriptionData {
  plano_slug: string;
  trial_dias?: number;
}

/** Abre o checkout de uma assinatura recorrente da plataforma. */
export function useCreatePlatformSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PlatformSubscriptionData) => {
      const { data: response, error } = await supabase.functions.invoke('mercadopago-checkout', {
        body: {
          action: 'create_subscription',
          plano_slug: data.plano_slug,
          trial_dias: data.trial_dias || 0,
        },
      });
      if (error) throw error;
      if (response?.error) throw new Error(response.error);
      if (!response?.checkout_url) throw new Error('O Mercado Pago não retornou o checkout da assinatura');
      return response as { checkout_url: string; preapproval_id: string; assinatura_id: string; message: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user_plan'] });
      redirecionarParaCheckout(data.checkout_url);
    },
    onError: (err: any) => {
      toast.error(friendlyErrorMessage(err, 'Não foi possível abrir o checkout da assinatura.'));
    },
  });
}
