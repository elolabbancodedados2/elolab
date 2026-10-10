// Sincroniza um pedido Pix/boleto dos planos com o estado real no Mercado Pago.
// Usado pelo webhook (topic "order") e pela consulta da tela de checkout. O
// status nunca vem do navegador: a order é sempre lida com o access token.

import type { MercadoPagoClient } from './mercadoPagoClient.ts';
import { extractPaymentInstructions, mapOrderStatus } from './planCheckout.ts';

type JsonObject = Record<string, unknown>;

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export interface LocalPlanOrder {
  id: string;
  user_id: string;
  valor: number | string;
  status: string;
  mp_order_id: string | null;
}

export type SyncPlanOrderResult =
  | { handled: false; reason: 'pedido_desconhecido' }
  | { handled: true; ignored: true; reason: string; status?: string }
  | { handled: true; ignored: false; status: string; applied: boolean; detail: JsonObject };

/** Guarda só o que serve para auditoria; remove token de cartão e dados do pagador. */
export function sanitizeOrderSnapshot(order: unknown): JsonObject {
  const data = (order && typeof order === 'object' ? order : {}) as JsonObject;
  const payments = ((data.transactions as JsonObject | undefined)?.payments as JsonObject[] | undefined) || [];
  return {
    id: data.id ?? null,
    status: data.status ?? null,
    status_detail: data.status_detail ?? null,
    total_amount: data.total_amount ?? null,
    total_paid_amount: data.total_paid_amount ?? null,
    external_reference: data.external_reference ?? null,
    last_updated_date: data.last_updated_date ?? null,
    payments: payments.map((payment) => {
      const method = (payment.payment_method || {}) as JsonObject;
      return {
        id: payment.id ?? null,
        status: payment.status ?? null,
        status_detail: payment.status_detail ?? null,
        amount: payment.amount ?? null,
        paid_amount: payment.paid_amount ?? null,
        payment_method: { id: method.id ?? null, type: method.type ?? null },
      };
    }),
  };
}

/** Valor pago precisa cobrir o valor cobrado; senão o pagamento não libera acesso. */
export function paidAmountMatches(order: unknown, expected: number | string): boolean {
  const data = (order && typeof order === 'object' ? order : {}) as JsonObject;
  const paid = Number(data.total_paid_amount ?? data.total_amount);
  return Number.isFinite(paid) && paid + 0.005 >= Number(expected);
}

export async function applyGatewayOrder(
  supabase: SupabaseLike,
  local: LocalPlanOrder,
  order: unknown,
): Promise<SyncPlanOrderResult> {
  const data = (order && typeof order === 'object' ? order : {}) as JsonObject;
  if (local.mp_order_id && data.id && String(data.id) !== local.mp_order_id) {
    return { handled: true, ignored: true, reason: 'order_divergente' };
  }

  let status = mapOrderStatus(order);
  if (!status) return { handled: true, ignored: true, reason: `status_desconhecido:${String(data.status)}` };

  let statusDetail = typeof data.status_detail === 'string' ? data.status_detail : null;
  if (status === 'pago' && !paidAmountMatches(order, local.valor)) {
    // Não libera acesso com valor menor que o cobrado; fica para conferência.
    status = 'em_processamento';
    statusDetail = 'valor_divergente';
  }

  const instructions = extractPaymentInstructions(order);
  const { data: result, error } = await supabase.rpc('aplicar_status_pedido_plano', {
    p_pedido_id: local.id,
    p_status: status,
    p_status_detail: statusDetail,
    p_mp_payment_id: instructions.mpPaymentId,
    p_snapshot: sanitizeOrderSnapshot(order),
  });
  if (error) throw new Error(`Falha ao aplicar status do pedido: ${error.message}`);

  const detail = (result || {}) as JsonObject;
  if (status === 'pago') {
    const { error: provisionError } = await supabase.rpc('provision_clinic_after_subscription', { p_user_id: local.user_id });
    if (provisionError) throw new Error(`Pagamento confirmado, mas a clínica não foi provisionada: ${provisionError.message}`);
  }
  return { handled: true, ignored: false, status, applied: detail.aplicado === true, detail };
}

/** Busca a order no Mercado Pago e aplica no pedido local correspondente. */
export async function syncPlanOrderFromGateway(
  supabase: SupabaseLike,
  client: MercadoPagoClient,
  mpOrderId: string,
): Promise<SyncPlanOrderResult> {
  const { data: local, error } = await supabase
    .from('platform_plan_orders')
    .select('id, user_id, valor, status, mp_order_id')
    .eq('mp_order_id', mpOrderId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar pedido local: ${error.message}`);
  if (!local) return { handled: false, reason: 'pedido_desconhecido' };

  const order = await client.request({ method: 'GET', path: `/v1/orders/${encodeURIComponent(mpOrderId)}` });
  return applyGatewayOrder(supabase, local as LocalPlanOrder, order);
}
