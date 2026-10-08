import { describe, expect, it } from 'vitest';
import {
  buildCardSubscriptionPayload,
  buildPlanOrderPayload,
  describeCardSubscriptionError,
  extractPaymentInstructions,
  isOrderNotification,
  isValidCnpj,
  isValidCpf,
  mapOrderStatus,
  normalizeBoletoPayer,
  normalizeOrderPayer,
  periodMonthsFor,
  toAmountString,
  webhookEventKey,
} from '../../../supabase/functions/_shared/planCheckout';
import {
  orderAprovada,
  orderBoletoAguardando,
  orderCancelada,
  orderEmProcessamento,
  orderEstornada,
  orderExpirada,
  orderPixAguardando,
  orderRecusadaResposta,
} from './fixtures/mercadoPagoOrders';

const plano = { id: 'plano-1', slug: 'elolab-max', nome: 'EloLab Max', valor: 399, frequencia: 'mensal' };
const dataCadastro = '2026-01-15T12:00:00.000Z';
const pagadorPix = normalizeOrderPayer({
  first_name: 'Ana', last_name: 'Souza', document: '123.456.789-09', zip_code: '06233-903',
  street_name: 'Av. das Nações Unidas', street_number: '3003', neighborhood: 'Bonfim', city: 'Osasco', state: 'SP',
}, true).payer!;

describe('status das orders do Mercado Pago', () => {
  it('mapeia aprovação, recusa, pendência, cancelamento, expiração e estorno', () => {
    expect(mapOrderStatus(orderAprovada)).toBe('pago');
    expect(mapOrderStatus(orderRecusadaResposta.data)).toBe('recusado');
    expect(mapOrderStatus(orderPixAguardando)).toBe('aguardando_pagamento');
    expect(mapOrderStatus(orderBoletoAguardando)).toBe('aguardando_pagamento');
    expect(mapOrderStatus(orderEmProcessamento)).toBe('em_processamento');
    expect(mapOrderStatus(orderCancelada)).toBe('cancelado');
    expect(mapOrderStatus(orderExpirada)).toBe('expirado');
    expect(mapOrderStatus(orderEstornada)).toBe('estornado');
  });

  it('não trata como pago um processed sem crédito confirmado e ignora status desconhecido', () => {
    expect(mapOrderStatus({ status: 'processed', status_detail: 'waiting_capture' })).toBe('em_processamento');
    expect(mapOrderStatus({ status: 'algo_novo' })).toBeNull();
    expect(mapOrderStatus(null)).toBeNull();
  });
});

describe('instruções de pagamento', () => {
  it('extrai QR code e copia e cola do Pix', () => {
    const pix = extractPaymentInstructions(orderPixAguardando);
    expect(pix.method).toBe('pix');
    expect(pix.qrCode).toMatch(/^000201/);
    expect(pix.qrCodeBase64).toBeTruthy();
    expect(pix.expiresAt).toBe('2026-10-09T13:10:32.620+00:00');
    expect(pix.ticketUrl).toMatch(/^https:\/\/www\.mercadopago\.com\.br\//);
  });

  it('extrai linha digitável e link do boleto', () => {
    const boleto = extractPaymentInstructions(orderBoletoAguardando);
    expect(boleto.method).toBe('boleto');
    expect(boleto.digitableLine).toHaveLength(47);
    expect(boleto.ticketUrl).toContain('/ticket');
  });

  it('descarta link de pagamento fora do domínio do Mercado Pago', () => {
    const forjada = structuredClone(orderPixAguardando);
    forjada.transactions.payments[0].payment_method.ticket_url = 'https://mercadopago.com.br.evil.test/ticket';
    expect(extractPaymentInstructions(forjada).ticketUrl).toBeNull();
  });
});

describe('payloads montados no servidor', () => {
  it('Pix envia identificação do comprador e dados do plano aceitos pela Orders API', () => {
    const payload = buildPlanOrderPayload({ pedidoId: 'pedido-1', plano, method: 'pix', payerEmail: 'a@b.com', payer: pagadorPix });
    expect(payload.total_amount).toBe('399.00');
    expect(payload.external_reference).toBe('pedido-1');
    expect(payload.processing_mode).toBe('automatic');
    expect(payload.payer).toEqual({
      email: 'a@b.com', first_name: 'Ana', last_name: 'Souza', identification: { type: 'CPF', number: '12345678909' },
      address: { zip_code: '06233903', street_name: 'Av. das Nações Unidas', street_number: '3003', neighborhood: 'Bonfim', city: 'Osasco', state: 'SP' },
    });
    expect(payload.items).toEqual([{
      external_code: 'elolab-max', title: 'Assinatura EloLab EloLab Max',
      description: 'Acesso ao EloLab EloLab Max por 1 mês', category_id: 'software', quantity: 1, unit_price: '399.00',
    }]);
    expect(payload).not.toHaveProperty('additional_info');
    expect(payload.config).toEqual({ statement_descriptor: 'ELOLAB' });
    expect(payload.transactions.payments[0]).toEqual({
      amount: '399.00',
      payment_method: { id: 'pix', type: 'bank_transfer' },
      expiration_time: 'P1D',
    });
  });

  it('boleto exige dados do pagador', () => {
    expect(() => buildPlanOrderPayload({ pedidoId: 'p', plano, method: 'boleto', payerEmail: 'a@b.com', payer: null as never })).toThrow();
    const { payer } = normalizeBoletoPayer({
      first_name: 'Ana', last_name: 'Souza', document: '123.456.789-09', zip_code: '06233-903',
      street_name: 'Av. das Nações Unidas', street_number: '3003', neighborhood: 'Bonfim', city: 'Osasco', state: 'sp',
    });
    const payload = buildPlanOrderPayload({ pedidoId: 'p', plano, method: 'boleto', payerEmail: 'a@b.com', payer: payer! });
    expect(payload.payer.identification).toEqual({ type: 'CPF', number: '12345678909' });
    expect(payload.payer.address?.state).toBe('SP');
    expect(payload.transactions.payments[0].payment_method).toEqual({ id: 'boleto', type: 'ticket' });
    expect(payload.transactions.payments[0].expiration_time).toBe('P3D');
  });

  it('plano anual libera 12 meses e a assinatura no cartão usa frequência anual', () => {
    const anual = { ...plano, valor: '3990.5', frequencia: 'anual' };
    expect(periodMonthsFor('anual')).toBe(12);
    expect(buildPlanOrderPayload({ pedidoId: 'p', plano: anual, method: 'pix', payerEmail: 'a@b.com', payer: pagadorPix }).total_amount).toBe('3990.50');
    const card = buildCardSubscriptionPayload({
      externalReference: 'ref', plano: anual, payerEmail: 'a@b.com', cardTokenId: 'tok',
      backUrl: 'https://app', notificationUrl: 'https://hook', startDate: new Date('2026-11-01T00:00:00Z'),
    });
    expect(card.status).toBe('authorized');
    expect(card.card_token_id).toBe('tok');
    expect(card.auto_recurring).toEqual({
      frequency: 1, frequency_type: 'years', transaction_amount: 3990.5, currency_id: 'BRL', start_date: '2026-11-01T00:00:00.000Z',
    });
  });

  it('recusa valor de plano inválido', () => {
    expect(() => toAmountString(0)).toThrow();
    expect(() => toAmountString(Number.NaN)).toThrow();
  });
});

describe('dados do pagador do boleto', () => {
  it('valida CPF, CNPJ, CEP e UF', () => {
    expect(isValidCpf('123.456.789-09')).toBe(true);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false);
    const { payer, errors } = normalizeBoletoPayer({ first_name: 'A', document: '1', zip_code: '1', state: 'XX' });
    expect(payer).toBeNull();
    expect(errors).toEqual(expect.arrayContaining(['CPF ou CNPJ inválido', 'CEP inválido', 'UF inválida', 'Informe o sobrenome do pagador']));
  });

  it('normalização básica aceita identidade sem exigir endereço quando não solicitado', () => {
    const { payer, errors } = normalizeOrderPayer({ first_name: ' Ana ', last_name: ' Souza ', document: '123.456.789-09' });
    expect(errors).toEqual([]);
    expect(payer).toEqual({ first_name: 'Ana', last_name: 'Souza', identification: { type: 'CPF', number: '12345678909' } });
  });
});

describe('erros da assinatura no cartão', () => {
  it('distingue recusa, token inválido e falha de comunicação', () => {
    expect(describeCardSubscriptionError(400, { message: 'CC_VAL_433 Credit card validation has failed' }).code).toBe('recusado');
    expect(describeCardSubscriptionError(400, { message: 'Card token service not found' }).code).toBe('dados_invalidos');
    const falha = describeCardSubscriptionError(null, null);
    expect(falha.code).toBe('falha_comunicacao');
    expect(falha.httpStatus).toBe(503);
    expect(describeCardSubscriptionError(502, null).code).toBe('falha_comunicacao');
  });
});

describe('idempotência das notificações', () => {
  it('mesma notificação repetida gera a mesma chave; mudança de status gera outra', () => {
    const aguardando = { action: 'order.action_required', type: 'order', data: { id: 'ORD1', status: 'action_required' } };
    const pago = { action: 'order.processed', type: 'order', data: { id: 'ORD1', status: 'processed' } };
    expect(webhookEventKey(aguardando)).toBe(webhookEventKey(structuredClone(aguardando)));
    expect(webhookEventKey(aguardando)).not.toBe(webhookEventKey(pago));
    expect(isOrderNotification(pago)).toBe(true);
  });

  it('mantém a chave antiga para pagamentos e assinaturas', () => {
    expect(webhookEventKey({ id: 12345, type: 'payment', data: { id: '99' } })).toBe('12345');
    expect(webhookEventKey({ type: 'subscription_preapproval', data: { id: 'pre-1' } })).toBe('subscription_preapproval-pre-1');
    expect(isOrderNotification({ type: 'payment' })).toBe(false);
  });
});
