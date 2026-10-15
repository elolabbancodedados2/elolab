export type MercadoPagoPaymentResource = 'payment' | 'authorized_payment';

export interface MercadoPagoWebhookEvent {
  type?: string | null;
  action?: string | null;
  data?: { id?: string | number | null } | null;
}

/** External signatures use the query resource ID; only authenticated internal retries may fall back to the logged payload. */
export function resolveMercadoPagoWebhookDataId(
  queryDataId: string | null,
  bodyDataId: string | number | null | undefined,
  trustedInternal: boolean,
): string {
  if (queryDataId !== null) return queryDataId;
  return trustedInternal && bodyDataId != null ? String(bodyDataId) : '';
}

/** Returns the seller only when both webhook IDs match the signed resource ID. */
export function oauthRevocationTarget(
  event: MercadoPagoWebhookEvent & { user_id?: string | number | null },
  signedDataId: string | null,
): string | null {
  if (event.type !== 'mp-connect' || event.action !== 'application.deauthorized' || !signedDataId) return null;
  const sellerId = event.user_id == null ? '' : String(event.user_id);
  const resourceId = event.data?.id == null ? '' : String(event.data.id);
  return sellerId === signedDataId && resourceId === signedDataId ? sellerId : null;
}

/**
 * A signed webhook proves only the resource ID, not the action or seller in its
 * body. Require a separate authoritative confirmation bound to the seller.
 */
export function oauthRevocationSellerId(
  event: MercadoPagoWebhookEvent & { user_id?: string | number | null },
  signedDataId: string | null,
  authoritativelyConfirmedSellerId: string | null = null,
): string | null {
  const target = oauthRevocationTarget(event, signedDataId);
  return target && authoritativelyConfirmedSellerId === target ? target : null;
}

/** Resolve o recurso de API correto para cada evento de pagamento do Mercado Pago. */
export function mercadoPagoPaymentResource(
  event: MercadoPagoWebhookEvent,
): MercadoPagoPaymentResource | null {
  if (
    event.type === 'payment' ||
    event.action === 'payment.created' ||
    event.action === 'payment.updated'
  ) {
    return 'payment';
  }

  if (
    event.type === 'subscription_authorized_payment' ||
    event.action?.includes('authorized_payment')
  ) {
    return 'authorized_payment';
  }

  return null;
}
