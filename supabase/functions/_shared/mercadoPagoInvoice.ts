type JsonObject = Record<string, unknown>;

export interface PlatformInvoiceRow {
  assinatura_mp_id: string;
  user_id: string | null;
  mp_authorized_payment_id: string;
  mp_preapproval_id: string;
  mp_payment_id: string | null;
  invoice_status: string;
  payment_status: string | null;
  payment_status_detail: string | null;
  amount: number | null;
  currency_id: string | null;
  invoice_type: string | null;
  date_created: string | null;
  last_modified: string | null;
  debit_date: string | null;
  retry_attempt: number | null;
  updated_at: string;
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function asId(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asAmount(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function asInteger(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const integer = Number(value);
  return Number.isInteger(integer) && integer >= 0 ? integer : null;
}

function asTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

/** Maps only invoice fields needed for billing history; never persists card data. */
export function mapAuthorizedPaymentInvoice(input: {
  authorizedPayment: JsonObject;
  assinaturaMpId: string;
  userId: string | null;
  now?: string;
}): PlatformInvoiceRow {
  const authorizedPayment = input.authorizedPayment;
  const invoiceId = asId(authorizedPayment.id);
  const preapprovalId = asId(authorizedPayment.preapproval_id);
  if (!invoiceId || !preapprovalId) {
    throw new Error('Fatura sem identificador ou assinatura Mercado Pago');
  }

  const payment = asObject(authorizedPayment.payment);
  return {
    assinatura_mp_id: input.assinaturaMpId,
    user_id: input.userId,
    mp_authorized_payment_id: invoiceId,
    mp_preapproval_id: preapprovalId,
    mp_payment_id: asId(payment.id),
    invoice_status: asString(authorizedPayment.status) || 'unknown',
    payment_status: asString(payment.status),
    payment_status_detail: asString(payment.status_detail),
    amount: asAmount(authorizedPayment.transaction_amount),
    currency_id: asString(authorizedPayment.currency_id),
    invoice_type: asString(authorizedPayment.type),
    date_created: asTimestamp(authorizedPayment.date_created),
    last_modified: asTimestamp(authorizedPayment.last_modified),
    debit_date: asTimestamp(authorizedPayment.debit_date),
    retry_attempt: asInteger(authorizedPayment.retry_attempt),
    updated_at: input.now || new Date().toISOString(),
  };
}
