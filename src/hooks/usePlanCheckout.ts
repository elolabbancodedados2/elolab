import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type PlanOrderStatus =
  | 'criando'
  | 'aguardando_pagamento'
  | 'em_processamento'
  | 'pago'
  | 'recusado'
  | 'cancelado'
  | 'expirado'
  | 'estornado'
  | 'erro';

export interface PlanOrder {
  id: string;
  plano_slug: string;
  metodo: 'pix' | 'boleto';
  valor: number;
  periodo_meses: number;
  status: PlanOrderStatus;
  status_detail: string | null;
  ticket_url: string | null;
  qr_code: string | null;
  qr_code_base64: string | null;
  digitable_line: string | null;
  barcode_content: string | null;
  expira_em: string | null;
  pago_em: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  created_at: string;
}

export interface CheckoutPlan {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  valor: number;
  frequencia: string;
  trial_dias: number;
  features: string[];
  periodo_meses: number;
}

export interface BillingStatus {
  public_key: string | null;
  sandbox: boolean;
  plano: CheckoutPlan | null;
  assinatura: {
    plano_slug: string;
    status: string;
    em_trial: boolean;
    trial_fim: string | null;
    data_fim: string | null;
    modalidade: 'recorrente' | 'pre_pago' | null;
  } | null;
  pedido_aberto: PlanOrder | null;
}

export interface OrderPayer {
  first_name: string;
  last_name: string;
  document: string;
  zip_code?: string;
  street_name?: string;
  street_number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

export type BoletoPayer = OrderPayer;

export const OPEN_ORDER_STATUSES: PlanOrderStatus[] = ['criando', 'aguardando_pagamento', 'em_processamento'];

/** Erro com a mensagem que a Edge Function devolveu (inclusive em 4xx/5xx). */
async function invokeCheckout<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('mercadopago-checkout', { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      const payload = await context.json().catch(() => null);
      if (payload?.error) throw new Error(payload.error);
    }
    throw new Error('Não foi possível falar com o servidor de pagamentos. Tente novamente.');
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function useBillingStatus(planoSlug?: string, enabled = true) {
  return useQuery({
    queryKey: ['billing_status', planoSlug ?? null],
    queryFn: () => invokeCheckout<BillingStatus>({ action: 'billing_status', plano_slug: planoSlug }),
    staleTime: 30_000,
    enabled,
  });
}

export function useCreateCardSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { plano_slug: string; card_token_id: string; trial_dias: number; device_id?: string }) =>
      invokeCheckout<{ status: 'aprovado' | 'em_analise' | 'recusado'; proxima_cobranca: string | null; em_trial: boolean }>({
        action: 'create_card_subscription',
        ...input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_plan'] });
      queryClient.invalidateQueries({ queryKey: ['billing_status'] });
    },
  });
}

export function useCreatePlanOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { plano_slug: string; metodo: 'pix' | 'boleto'; pagador?: OrderPayer; device_id?: string }) =>
      invokeCheckout<{ pedido: PlanOrder }>({ action: 'create_plan_order', ...input }).then((r) => r.pedido),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['billing_status'] }),
  });
}

/** Consulta o pedido a cada 5 s enquanto ele estiver aguardando pagamento. */
export function usePlanOrder(pedidoId: string | null) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['plan_order', pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { pedido } = await invokeCheckout<{ pedido: PlanOrder }>({ action: 'get_plan_order', pedido_id: pedidoId });
      if (pedido.status === 'pago') {
        queryClient.invalidateQueries({ queryKey: ['user_plan'] });
        queryClient.invalidateQueries({ queryKey: ['billing_status'] });
      }
      return pedido;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return !status || OPEN_ORDER_STATUSES.includes(status) ? 5000 : false;
    },
    refetchIntervalInBackground: false,
  });
}

export function useCancelPlanOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pedidoId: string) =>
      invokeCheckout<{ pedido: PlanOrder }>({ action: 'cancel_plan_order', pedido_id: pedidoId }).then((r) => r.pedido),
    onSuccess: (pedido) => {
      queryClient.setQueryData(['plan_order', pedido.id], pedido);
      queryClient.invalidateQueries({ queryKey: ['billing_status'] });
    },
  });
}
