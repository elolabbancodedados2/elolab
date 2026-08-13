import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from 'sonner';

export interface Plano {
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

export interface AssinaturaPlano {
  plano_slug: string;
  plano_nome: string;
  status: string;
  em_trial: boolean;
  trial_fim: string | null;
}

export function usePlanos() {
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
  });
}

export function useUserPlan() {
  const { user } = useSupabaseAuth();

  const { data: assinatura, isLoading } = useQuery({
    queryKey: ['user_plan', user?.id],
    queryFn: async () => {
      if (!user) return null;
      // First try active/trial plan
      const { data: activePlan, error: activeError } = await supabase.rpc('get_user_plan' as any, {
        _user_id: user.id,
      });
      if (activeError) {
        console.error('Erro ao buscar plano:', activeError);
      }
      const active = (activePlan as unknown as AssinaturaPlano[])?.[0] || null;
      if (active) return active;

      // If no active plan, check for expired/cancelled
      const { data: expiredData } = await supabase
        .from('assinaturas_plano' as any)
        .select('plano_slug, status, em_trial, trial_fim, planos!inner(nome)')
        .eq('user_id', user.id)
        .in('status', ['expirada', 'cancelada'])
        .order('updated_at', { ascending: false })
        .limit(1);

      if (expiredData && (expiredData as any[]).length > 0) {
        const exp = (expiredData as any[])[0];
        return {
          plano_slug: exp.plano_slug,
          plano_nome: exp.planos?.nome || exp.plano_slug,
          status: exp.status,
          em_trial: exp.em_trial,
          trial_fim: exp.trial_fim,
        } as AssinaturaPlano;
      }

      return null;
    },
    enabled: !!user,
  });

  const hasFeature = (feature: string): boolean => {
    if (!assinatura) return false;
    if (assinatura.plano_slug === 'elolab-ultra') return true;
    if (assinatura.plano_slug === 'elolab-max') {
      return feature !== 'agente_ia' && feature !== 'chatbot_whatsapp';
    }
    return false;
  };

  const isUltra = assinatura?.plano_slug === 'elolab-ultra';
  const isMax = assinatura?.plano_slug === 'elolab-max';
  const hasActivePlan = !!assinatura && (assinatura.status === 'ativa' || assinatura.status === 'trial');
  const isTrial = assinatura?.em_trial === true && assinatura?.status === 'trial';
  const trialEnd = assinatura?.trial_fim ? new Date(assinatura.trial_fim) : null;

  const trialDaysLeft = trialEnd
    ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return {
    plan: assinatura,
    isLoading,
    hasFeature,
    isUltra,
    isMax,
    hasActivePlan,
    isTrial,
    trialEnd,
    trialDaysLeft,
    planName: assinatura?.plano_nome || null,
    planSlug: assinatura?.plano_slug || null,
  };
}

export function useStartTrial() {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (planoSlug: string) => {
      if (!user) throw new Error('Usuário não autenticado');
      const { data, error } = await supabase.rpc('start_free_trial' as any, {
        _user_id: user.id,
        _plano_slug: planoSlug,
      });
      if (error) throw error;
      const result = data as unknown as { success: boolean; error?: string; plano_nome?: string; trial_end?: string };
      if (!result.success) throw new Error(result.error || 'Erro ao iniciar trial');
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user_plan'] });
      toast.success(`Teste grátis ativado! ${data.plano_nome} por 3 dias.`);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao iniciar período de teste');
    },
  });
}

export interface TrialWithPaymentData {
  plano_slug: string;
  plano_nome: string;
  plano_valor: number;
  trial_dias: number;
  payment_method: 'credit_card' | 'pix_recurring';
  payer_email: string;
  payer_name: string;
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
      window.location.href = data.checkout_url;
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao abrir o checkout da assinatura');
    },
  });
}

export function useStartTrialWithPayment() {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: TrialWithPaymentData) => {
      if (!user?.email) throw new Error('Usuário não autenticado');

      const { data: response, error } = await supabase.functions.invoke('mercadopago-checkout', {
        body: {
          action: 'create_subscription',
          plano_slug: data.plano_slug,
          trial_dias: data.trial_dias,
        },
      });

      if (error) throw error;
      if (response?.error) throw new Error(response.error);
      if (!response?.checkout_url) throw new Error('O Mercado Pago não retornou o checkout da assinatura');
      return response as unknown as {
        success: boolean;
        checkout_url: string;
        preapproval_id: string;
        trial_id: string;
        trial_end: string;
        charge_date: string;
        message: string;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user_plan'] });
      window.location.href = data.checkout_url;
      toast.success(data.message || 'Período de teste iniciado com sucesso!');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao iniciar período de teste');
    },
  });
}
