// Respostas reais de GET/POST /v1/orders capturadas no sandbox do Mercado Pago
// em 08/10/2026 (usuário de teste), reduzidas aos campos usados pelo EloLab.

export const orderPixAguardando = {
  id: 'ORDTST01M4DT62TD322543P910D29BN5',
  type: 'online',
  processing_mode: 'automatic',
  external_reference: '6f1d3b52-8d55-4a8e-9a77-0c1b2f6e0a11',
  total_amount: '399.00',
  country_code: 'BRA',
  status: 'action_required',
  status_detail: 'waiting_transfer',
  transactions: {
    payments: [
      {
        id: 'PAY01M4DT62TZYYC6AGNBZEBKEDYC',
        amount: '399.00',
        status: 'action_required',
        status_detail: 'waiting_transfer',
        date_of_expiration: '2026-10-09T13:10:32.620+00:00',
        payment_method: {
          id: 'pix',
          type: 'bank_transfer',
          ticket_url: 'https://www.mercadopago.com.br/sandbox/payments/00000000000/ticket?caller_id=1&hash=abc',
          qr_code: '00020126580014br.gov.bcb.pix0136b76aa9c2-2ec4-4110-954e-ebfe34f05b61520400005303986',
          qr_code_base64: 'iVBORw0KGgoAAAANSUhEUgAABWQAAAVkAQAAAAB79i',
        },
      },
    ],
  },
};

export const orderBoletoAguardando = {
  id: 'ORDTST01M4DT649SX8Y1SNX2T4FJ3ZP6',
  type: 'online',
  processing_mode: 'automatic',
  external_reference: '0b9d7b8e-63b2-4b0c-8a0f-2f4b8e7d1c22',
  total_amount: '399.00',
  status: 'action_required',
  status_detail: 'waiting_payment',
  transactions: {
    payments: [
      {
        id: 'PAY01M4DT64A81Y6WG2ND9G96SVGF',
        amount: '399.00',
        status: 'action_required',
        status_detail: 'waiting_payment',
        date_of_expiration: '2026-10-14T02:59:59.000+00:00',
        payment_method: {
          id: 'boleto',
          type: 'ticket',
          ticket_url: 'https://www.mercadopago.com.br/payments/86797024510/ticket?caller_id=1&hash=def',
          barcode_content: '23793380296060054351030006333303799140000020000',
          digitable_line: '23793380296060054351030006333303799140000020000',
        },
      },
    ],
  },
};

export const orderAprovada = {
  id: 'ORDTST01M4DT6P9V3883175DZHN5R7HT',
  type: 'online',
  processing_mode: 'automatic',
  external_reference: '6f1d3b52-8d55-4a8e-9a77-0c1b2f6e0a11',
  total_amount: '399.00',
  total_paid_amount: '399.00',
  status: 'processed',
  status_detail: 'accredited',
  last_updated_date: '2026-10-08T13:10:53.78Z',
  transactions: {
    payments: [
      {
        id: 'PAY01M4DT6P9V3883175DZHN5R7HT',
        amount: '399.00',
        paid_amount: '399.00',
        status: 'processed',
        status_detail: 'accredited',
        payment_method: { id: 'pix', type: 'bank_transfer', token: 'nao-deve-ser-salvo' },
      },
    ],
  },
};

/** POST /v1/orders recusado: HTTP 402 com a order em `data`. */
export const orderRecusadaResposta = {
  errors: [{ code: 'failed', message: 'The following transactions failed', details: ['PAY01M4DT6RVPN3J4W2FH98PS4KJF: rejected_by_issuer'] }],
  data: {
    id: 'ORDTST01M4DT6RV654N3NQRHJHYJGFJN',
    external_reference: 'probe-card-OTHE',
    total_amount: '399.00',
    status: 'failed',
    status_detail: 'failed',
    transactions: { payments: [{ id: 'PAY01M4DT6RVPN3J4W2FH98PS4KJF', status: 'failed', status_detail: 'rejected_by_issuer' }] },
  },
};

export const orderEmProcessamento = { ...orderAprovada, status: 'processing', status_detail: 'in_process', total_paid_amount: '0.00' };
export const orderCancelada = { ...orderPixAguardando, status: 'canceled', status_detail: 'canceled' };
export const orderExpirada = { ...orderPixAguardando, status: 'expired', status_detail: 'expired' };
export const orderEstornada = { ...orderAprovada, status: 'refunded', status_detail: 'refunded' };
