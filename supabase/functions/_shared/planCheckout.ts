// Regras puras do checkout transparente dos planos do EloLab.
//
// - Cartão: assinatura recorrente na API de Assinaturas (/preapproval) com
//   card_token_id e status "authorized". A API de Orders não faz recorrência.
// - Pix e boleto: pagamento único de um período (mensal ou anual) na API de
//   Orders (/v1/orders). Não renova sozinho; o cliente paga o próximo período.
//
// O valor sempre vem do registro do plano no banco, nunca do navegador.

export type PlanOrderMethod = 'pix' | 'boleto';

export type PlanOrderLocalStatus =
  | 'aguardando_pagamento'
  | 'em_processamento'
  | 'pago'
  | 'recusado'
  | 'cancelado'
  | 'expirado'
  | 'estornado';

export const PLAN_ORDER_OPEN_STATUSES: PlanOrderLocalStatus[] = ['aguardando_pagamento', 'em_processamento'];

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/** Valor monetário no formato exigido pela API de Orders ("399.00"). */
export function toAmountString(value: number): string {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Valor do plano inválido');
  return (Math.round(value * 100) / 100).toFixed(2);
}

/** Quantos meses de acesso um pagamento único libera, conforme a frequência do plano. */
export function periodMonthsFor(frequencia: string | null | undefined): number {
  switch ((frequencia || 'mensal').toLowerCase()) {
    case 'anual':
      return 12;
    case 'semestral':
      return 6;
    case 'trimestral':
      return 3;
    default:
      return 1;
  }
}

export function preapprovalFrequency(frequencia: string | null | undefined) {
  const months = periodMonthsFor(frequencia);
  return months === 12
    ? { frequency: 1, frequency_type: 'years' as const }
    : { frequency: months, frequency_type: 'months' as const };
}

/** Converte o status de uma order do Mercado Pago para o status local do pedido. */
export function mapOrderStatus(order: unknown): PlanOrderLocalStatus | null {
  const data = asObject(order);
  const status = asString(data.status);
  const detail = asString(data.status_detail);
  switch (status) {
    case 'processed':
      return detail === 'accredited' || detail === 'partially_refunded' ? 'pago' : 'em_processamento';
    case 'created':
    case 'action_required':
      return 'aguardando_pagamento';
    case 'processing':
      return 'em_processamento';
    case 'failed':
      return 'recusado';
    case 'canceled':
    case 'cancelled':
      return 'cancelado';
    case 'expired':
      return 'expirado';
    case 'refunded':
    case 'charged_back':
      return 'estornado';
    default:
      return null;
  }
}

export interface PaymentInstructions {
  method: PlanOrderMethod | null;
  ticketUrl: string | null;
  qrCode: string | null;
  qrCodeBase64: string | null;
  digitableLine: string | null;
  barcodeContent: string | null;
  expiresAt: string | null;
  mpPaymentId: string | null;
}

/** Extrai só o necessário para o cliente pagar; nada de dados de cartão. */
export function extractPaymentInstructions(order: unknown): PaymentInstructions {
  const payments = asObject(asObject(order).transactions).payments;
  const payment = asObject(Array.isArray(payments) ? payments[0] : null);
  const method = asObject(payment.payment_method);
  const methodId = asString(method.id);
  const ticketUrl = asString(method.ticket_url);
  return {
    method: methodId === 'pix' || methodId === 'boleto' ? methodId : null,
    ticketUrl: ticketUrl && /^https:\/\/([a-z0-9-]+\.)*mercadopago\.com(\.br)?\//i.test(ticketUrl) ? ticketUrl : null,
    qrCode: asString(method.qr_code),
    qrCodeBase64: asString(method.qr_code_base64),
    digitableLine: asString(method.digitable_line),
    barcodeContent: asString(method.barcode_content),
    expiresAt: asString(payment.date_of_expiration),
    mpPaymentId: asString(payment.id),
  };
}

// ─── Dados do pagador (boleto) ──────────────────────────────────────────────

const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

export function isValidCpf(value: string): boolean {
  const cpf = value.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function isValidCnpj(value: string): boolean {
  const cnpj = value.replace(/\D/g, '');
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(cnpj[i]) * w, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

export interface PayerInput {
  first_name?: unknown;
  last_name?: unknown;
  document?: unknown;
  zip_code?: unknown;
  street_name?: unknown;
  street_number?: unknown;
  neighborhood?: unknown;
  city?: unknown;
  state?: unknown;
}

export interface NormalizedPayer {
  first_name: string;
  last_name: string;
  identification: { type: 'CPF' | 'CNPJ'; number: string };
  address?: {
    zip_code: string;
    street_name: string;
    street_number: string;
    neighborhood: string;
    city: string;
    state: string;
  };
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

/** Valida os dados que a API de Orders exige para emitir boleto. */
export function normalizeOrderPayer(
  input: PayerInput,
  requireAddress = false,
): { payer: NormalizedPayer | null; errors: string[] } {
  const errors: string[] = [];
  const first = text(input.first_name, 60);
  const last = text(input.last_name, 60);
  const doc = typeof input.document === 'string' ? input.document.replace(/\D/g, '') : '';
  const zip = typeof input.zip_code === 'string' ? input.zip_code.replace(/\D/g, '') : '';
  const street = text(input.street_name, 120);
  const number = text(input.street_number, 20);
  const neighborhood = text(input.neighborhood, 80);
  const city = text(input.city, 80);
  const state = text(input.state, 2).toUpperCase();

  if (!first) errors.push('Informe o nome do pagador');
  if (!last) errors.push('Informe o sobrenome do pagador');
  const docType = doc.length === 14 ? 'CNPJ' : 'CPF';
  if (docType === 'CPF' ? !isValidCpf(doc) : !isValidCnpj(doc)) errors.push('CPF ou CNPJ inválido');
  if (requireAddress) {
    if (zip.length !== 8) errors.push('CEP inválido');
    if (!street) errors.push('Informe a rua');
    if (!number) errors.push('Informe o número do endereço ou S/N');
    if (!neighborhood) errors.push('Informe o bairro');
    if (!city) errors.push('Informe a cidade');
    if (!UFS.has(state)) errors.push('UF inválida');
  }

  if (errors.length) return { payer: null, errors };
  return {
    errors,
    payer: {
      first_name: first,
      last_name: last,
      identification: { type: docType, number: doc },
      ...(requireAddress
        ? { address: { zip_code: zip, street_name: street, street_number: number, neighborhood, city, state } }
        : {}),
    },
  };
}

/** Dados fiscais completos são necessários para emitir boleto. */
export function normalizeBoletoPayer(input: PayerInput) {
  return normalizeOrderPayer(input, true);
}

// ─── Payloads ───────────────────────────────────────────────────────────────

export interface PlanRecord {
  id: string;
  slug: string;
  nome: string;
  valor: number | string;
  frequencia: string | null;
}

export const STATEMENT_DESCRIPTOR = 'ELOLAB';

export function buildPlanOrderPayload(input: {
  pedidoId: string;
  plano: PlanRecord;
  method: PlanOrderMethod;
  payerEmail: string;
  payer: NormalizedPayer;
}) {
  const amount = toAmountString(Number(input.plano.valor));
  const months = periodMonthsFor(input.plano.frequencia);
  const paymentMethod = input.method === 'pix'
    ? { id: 'pix', type: 'bank_transfer' }
    : { id: 'boleto', type: 'ticket' };

  if (!input.payer) throw new Error('Dados do pagador são obrigatórios para a cobrança');
  return {
    type: 'online',
    processing_mode: 'automatic',
    total_amount: amount,
    external_reference: input.pedidoId,
    description: `EloLab ${input.plano.nome} - ${months === 12 ? '12 meses' : months === 1 ? '1 mês' : `${months} meses`} de acesso`,
    payer: {
      email: input.payerEmail,
      first_name: input.payer.first_name,
      last_name: input.payer.last_name,
      identification: input.payer.identification,
      ...(input.payer.address ? { address: input.payer.address } : {}),
    },
    items: [{
      external_code: input.plano.slug,
      title: `Assinatura EloLab ${input.plano.nome}`,
      description: `Acesso ao EloLab ${input.plano.nome} por ${months === 12 ? '12 meses' : months === 1 ? '1 mês' : `${months} meses`}`,
      category_id: 'software',
      quantity: 1,
      unit_price: amount,
    }],
    // Orders API rejeita additional_info.payer.registration_date. Os campos
    // suportados de comprador e produto vão nos objetos payer e items acima.
    // Nome exibido no extrato do cliente (reduz contestações; exigência de qualidade).
    config: { statement_descriptor: STATEMENT_DESCRIPTOR },
    transactions: {
      payments: [
        {
          amount,
          payment_method: paymentMethod,
          // Definir os prazos explicitamente: o sandbox retornou processing_error
          // ao boleto sem expiration_time; P3D gerou a linha digitável corretamente.
          expiration_time: input.method === 'pix' ? 'P1D' : 'P3D',
        },
      ],
    },
  };
}

export function buildCardSubscriptionPayload(input: {
  externalReference: string;
  plano: PlanRecord;
  payerEmail: string;
  cardTokenId: string;
  backUrl: string;
  notificationUrl: string;
  startDate?: Date | null;
}) {
  return {
    reason: `EloLab ${input.plano.nome}`,
    external_reference: input.externalReference,
    payer_email: input.payerEmail,
    card_token_id: input.cardTokenId,
    status: 'authorized',
    back_url: input.backUrl,
    notification_url: input.notificationUrl,
    auto_recurring: {
      ...preapprovalFrequency(input.plano.frequencia),
      transaction_amount: Number(toAmountString(Number(input.plano.valor))),
      currency_id: 'BRL',
      ...(input.startDate ? { start_date: input.startDate.toISOString() } : {}),
    },
  };
}

/** Mensagem segura para o cliente quando o Mercado Pago recusa a assinatura no cartão. */
export function describeCardSubscriptionError(status: number | null, body: unknown): {
  httpStatus: number;
  code: 'recusado' | 'dados_invalidos' | 'falha_comunicacao';
  message: string;
} {
  if (status === null || status >= 500 || status === 429) {
    return {
      httpStatus: 503,
      code: 'falha_comunicacao',
      message: 'Não foi possível falar com o Mercado Pago agora. Nenhuma cobrança foi confirmada; tente novamente em instantes.',
    };
  }
  const raw = JSON.stringify(body ?? '').toLowerCase();
  if (raw.includes('card_token') || raw.includes('token')) {
    return {
      httpStatus: 422,
      code: 'dados_invalidos',
      message: 'Os dados do cartão expiraram ou são inválidos. Confira e tente novamente.',
    };
  }
  return {
    httpStatus: 402,
    code: 'recusado',
    message: 'O cartão foi recusado. Verifique os dados ou use outro cartão ou forma de pagamento.',
  };
}

/**
 * Chave de idempotência do webhook. Orders não têm ID por notificação, e a
 * mesma order muda de status várias vezes; por isso a chave inclui o status.
 */
export function webhookEventKey(payload: unknown): string {
  const data = asObject(payload);
  const inner = asObject(data.data);
  const innerId = inner.id !== undefined && inner.id !== null ? String(inner.id) : '';
  if (data.type === 'order' || (typeof data.action === 'string' && data.action.startsWith('order.'))) {
    return `order:${innerId.toLowerCase()}:${asString(data.action) || ''}:${asString(inner.status) || ''}`;
  }
  return data.id !== undefined && data.id !== null ? String(data.id) : `${String(data.type)}-${innerId}`;
}

export function isOrderNotification(payload: unknown): boolean {
  const data = asObject(payload);
  return data.type === 'order' || (typeof data.action === 'string' && data.action.startsWith('order.'));
}
