import { accessTokenMercadoPagoClinica } from './mercadoPagoClinicToken.ts';

const API_BASE = 'https://api.mercadopago.com';
const KNOWN_STATUSES = new Set([
  'created', 'at_terminal', 'action_required', 'processed', 'failed', 'canceled', 'expired', 'refunded',
]);

function paymentMethodFor(order: Record<string, any>): string {
  const payment = order.transactions?.payments?.find((item: Record<string, any>) =>
    item.status === 'processed' && item.status_detail === 'accredited'
  );
  const method = payment?.payment_method ?? {};
  if (method.type === 'debit_card') return 'debito';
  if (method.type === 'credit_card') return 'credito';
  if (method.id === 'pix' || method.type === 'bank_transfer') return 'pix';
  if (method.type === 'account_money') return 'transferencia';
  return 'transferencia';
}

/**
 * Atualiza um pedido Point da clínica após confirmar a order com o token OAuth
 * dela. Pagamentos aprovados só entram no resumo financeiro pelo RPC atômico.
 */
export async function syncMercadoPagoPointOrder(
  service: any,
  orderId: string,
  expectedSellerId?: string | number | null,
) {
  const { data: local, error: localError } = await service.from('mercadopago_point_orders')
    .select('id,clinica_id,lancamento_id,mp_order_id,external_reference,terminal_id,valor,status,payment_sync_status')
    .eq('mp_order_id', orderId)
    .maybeSingle();
  if (localError) throw localError;
  if (!local) return { found: false };

  const { data: integration, error: integrationError } = await service.from('integracoes_clinica')
    .select('config,status')
    .eq('clinica_id', local.clinica_id)
    .eq('provedor', 'mercado_pago')
    .is('referencia_id', null)
    .maybeSingle();
  if (integrationError) throw integrationError;
  const sellerId = String(integration?.config?.mp_user_id ?? '');
  if (integration?.status !== 'conectado' || !sellerId) throw new Error('A conexão Mercado Pago desta clínica não está ativa.');
  if (expectedSellerId != null && String(expectedSellerId) !== sellerId) {
    throw new Error('A notificação não pertence à conta Mercado Pago conectada nesta clínica.');
  }

  const accessToken = await accessTokenMercadoPagoClinica(service, local.clinica_id);
  if (!accessToken) throw new Error('A conta Mercado Pago da clínica foi desconectada.');
  const response = await fetch(`${API_BASE}/v1/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  const gatewayOrder = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Não foi possível confirmar a order Point (HTTP ${response.status}).`);
  if (
    String(gatewayOrder.id ?? '') !== orderId ||
    gatewayOrder.type !== 'point' ||
    String(gatewayOrder.external_reference ?? '') !== local.external_reference
  ) throw new Error('A order retornada pelo Mercado Pago não corresponde à cobrança da clínica.');

  const status = String(gatewayOrder.status ?? '');
  if (!KNOWN_STATUSES.has(status)) throw new Error(`Status Point não reconhecido: ${status || 'vazio'}.`);
  const payments = Array.isArray(gatewayOrder.transactions?.payments) ? gatewayOrder.transactions.payments : [];
  const payment = payments.find((item: Record<string, any>) =>
    item.status === 'processed' && item.status_detail === 'accredited' && item.id
  );
  const updates: Record<string, unknown> = {
    status,
    status_detail: typeof gatewayOrder.status_detail === 'string' ? gatewayOrder.status_detail : null,
    updated_at: new Date().toISOString(),
  };

  if (status === 'processed') {
    if (!payment) throw new Error('A order está processada, mas não contém pagamento acreditado para conciliar.');
    const paidAmount = Number(gatewayOrder.total_paid_amount ?? payment.paid_amount ?? payment.amount);
    if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - Number(local.valor)) > 0.009) {
      throw new Error('O valor pago no terminal diverge do valor da cobrança local.');
    }
    if (gatewayOrder.currency_id && gatewayOrder.currency_id !== 'BRL') {
      throw new Error('A moeda do pagamento Point não é BRL.');
    }
    updates.mp_payment_id = String(payment.id);
    updates.payment_method = paymentMethodFor(gatewayOrder);
    updates.paid_at = typeof payment.date_created === 'string' ? payment.date_created : new Date().toISOString();
  }

  const { error: updateError } = await service.from('mercadopago_point_orders')
    .update(updates).eq('id', local.id).eq('clinica_id', local.clinica_id);
  if (updateError) throw updateError;

  let reconciliation: Record<string, unknown> | null = null;
  if (status === 'processed' && local.payment_sync_status !== 'registrado') {
    const { data, error } = await service.rpc('registrar_pagamento_mercadopago_point', {
      p_point_order_id: local.id,
    });
    if (error) throw error;
    reconciliation = data as Record<string, unknown>;
  }
  if (status === 'refunded' && local.payment_sync_status !== 'estornado') {
    const { data, error } = await service.rpc('estornar_pagamento_mercadopago_point', {
      p_point_order_id: local.id,
    });
    if (error) throw error;
    reconciliation = data as Record<string, unknown>;
  }
  return { found: true, status, reconciliation };
}
