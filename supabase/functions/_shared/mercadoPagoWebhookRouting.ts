export type MercadoPagoPaymentResource = 'payment' | 'authorized_payment';

export interface MercadoPagoWebhookEvent {
  type?: string | null;
  action?: string | null;
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
