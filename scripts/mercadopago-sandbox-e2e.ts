// Validação de ponta a ponta do checkout dos planos no SANDBOX do Mercado Pago.
//
//   npx deno run --allow-net --allow-read --allow-env scripts/mercadopago-sandbox-e2e.ts
//
// Lê as credenciais de supabase/functions/.env.local (fora do git) e recusa
// rodar se o access token não pertencer a um usuário de teste. Usa os mesmos
// módulos das Edge Functions; o banco é substituído por um registro em memória
// que segue as regras de aplicar_status_pedido_plano(). Tudo que é criado no
// gateway é cancelado no final, exceto a order APRO aprovada, cujo ID é
// impresso para medir a qualidade da integração no painel do Mercado Pago.

import { createMercadoPagoClient, MercadoPagoApiError } from '../supabase/functions/_shared/mercadoPagoClient.ts';
import {
  buildCardSubscriptionPayload,
  buildPlanOrderPayload,
  describeCardSubscriptionError,
  extractPaymentInstructions,
  mapOrderStatus,
  normalizeBoletoPayer,
  normalizeOrderPayer,
  webhookEventKey,
} from '../supabase/functions/_shared/planCheckout.ts';
import { createOrderWithMercadoPagoSdk } from '../supabase/functions/_shared/mercadoPagoOrdersSdk.ts';
import { applyGatewayOrder } from '../supabase/functions/_shared/platformPlanOrders.ts';
import { isValidMercadoPagoSignature, signMercadoPagoNotification } from '../supabase/functions/_shared/mercadoPagoSignature.ts';

const envText = await Deno.readTextFile(new URL('../supabase/functions/.env.local', import.meta.url));
const env = Object.fromEntries(
  envText.split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const token = env.MERCADOPAGO_ACCESS_TOKEN;
const publicKey = env.MERCADOPAGO_PUBLIC_KEY;
const testPayerEmail = env.MERCADOPAGO_TEST_PAYER_EMAIL || '';
const testDeviceId = Deno.env.get('MP_TEST_DEVICE_ID') || undefined;
if (!token || !publicKey) throw new Error('Configure MERCADOPAGO_ACCESS_TOKEN e MERCADOPAGO_PUBLIC_KEY em supabase/functions/.env.local');

const client = createMercadoPagoClient({ accessToken: token });
const results: { cenario: string; ok: boolean; detalhe: string }[] = [];
const cleanup: (() => Promise<unknown>)[] = [];
const check = (cenario: string, ok: boolean, detalhe: string) => {
  results.push({ cenario, ok, detalhe });
  console.log(`${ok ? 'OK  ' : 'FALHOU'} ${cenario} — ${detalhe}`);
};

// ─── Trava de segurança: só usuário de teste ────────────────────────────────
const me = await client.request<{ id: number; tags?: string[]; site_id?: string }>({ method: 'GET', path: '/users/me' });
if (!me.tags?.includes('test_user')) {
  console.error('Abortado: o access token NÃO é de um usuário de teste. Nada foi enviado ao Mercado Pago.');
  Deno.exit(2);
}
console.log(`Usuário de teste confirmado (site ${me.site_id}).\n`);

const plano = { id: 'plano-e2e', slug: 'elolab-max', nome: 'EloLab Max (teste)', valor: 10, frequencia: 'mensal' };
const pedidoBase = { user_id: 'user-e2e', valor: 10, status: 'criando' };

/** Banco em memória com as regras da função SQL aplicar_status_pedido_plano. */
function memoria(pedido: { id: string; mp_order_id: string | null }) {
  const row = { ...pedidoBase, ...pedido, liberacoes: 0 };
  return {
    row,
    supabase: {
      rpc: (_: string, args: Record<string, unknown>) => {
        if (row.status === 'pago') return Promise.resolve({ data: { aplicado: false, motivo: 'ja_pago' }, error: null });
        if (args.p_status === 'pago') row.liberacoes++;
        row.status = String(args.p_status);
        return Promise.resolve({ data: { aplicado: true, status: args.p_status }, error: null });
      },
    },
  };
}

async function cardToken(holder: string) {
  const res = await fetch(`https://api.mercadopago.com/v1/card_tokens?public_key=${publicKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      card_number: '5480832801033311', security_code: '123', expiration_month: 11, expiration_year: 2030,
      cardholder: { name: holder, identification: { type: 'CPF', number: '12345678909' } },
    }),
  });
  const body = await res.json();
  if (!body.id) throw new Error(`Token de cartão não gerado: ${res.status}`);
  return String(body.id);
}

try {
  // ─── Pix ──────────────────────────────────────────────────────────────────
  {
    const pedidoId = crypto.randomUUID();
    const idem = crypto.randomUUID();
    const payer = normalizeOrderPayer({
      first_name: 'Teste', last_name: 'EloLab', document: '123.456.789-09', zip_code: '06233-903',
      street_name: 'Av. das Nações Unidas', street_number: '3003', neighborhood: 'Bonfim', city: 'Osasco', state: 'SP',
    }, true).payer!;
    const payload = buildPlanOrderPayload({
      pedidoId, plano, method: 'pix', payerEmail: testPayerEmail || 'test_user_e2e@testuser.com', payer,
    });
    const order = await client.request<Record<string, unknown>>({ method: 'POST', path: '/v1/orders', body: payload, idempotencyKey: idem });
    cleanup.push(() => client.request({ method: 'POST', path: `/v1/orders/${order.id}/cancel` }).catch(() => null));
    const instr = extractPaymentInstructions(order);
    check('Pix: pedido criado com QR e copia e cola', !!instr.qrCode && !!instr.qrCodeBase64, `order ${order.id}, status ${order.status}`);
    check('Pix: pendência mapeada', mapOrderStatus(order) === 'aguardando_pagamento', String(mapOrderStatus(order)));

    const repetido = await client.request<Record<string, unknown>>({ method: 'POST', path: '/v1/orders', body: payload, idempotencyKey: idem });
    check('Pix: reenvio com a mesma chave não duplica a cobrança', repetido.id === order.id, `segunda resposta ${repetido.id}`);

    const db = memoria({ id: pedidoId, mp_order_id: String(order.id) });
    await applyGatewayOrder(db.supabase, db.row, await client.request({ method: 'GET', path: `/v1/orders/${order.id}` }));
    check('Pix: aguardando pagamento não libera acesso', db.row.liberacoes === 0 && db.row.status === 'aguardando_pagamento', db.row.status);

    await client.request({ method: 'POST', path: `/v1/orders/${order.id}/cancel` });
    const cancelada = await client.request({ method: 'GET', path: `/v1/orders/${order.id}` });
    await applyGatewayOrder(db.supabase, db.row, cancelada);
    check('Pix: cancelamento refletido no pedido', db.row.status === 'cancelado', db.row.status);
  }

  // ─── Boleto ───────────────────────────────────────────────────────────────
  {
    const pedidoId = crypto.randomUUID();
    const { payer } = normalizeBoletoPayer({
      first_name: 'Teste', last_name: 'EloLab', document: '123.456.789-09', zip_code: '06233-903',
      street_name: 'Av. das Nações Unidas', street_number: '3003', neighborhood: 'Bonfim', city: 'Osasco', state: 'SP',
    });
    const payload = buildPlanOrderPayload({
      pedidoId, plano, method: 'boleto', payerEmail: testPayerEmail || 'test_user_e2e@testuser.com', payer: payer!,
    });
    const order = await client.request<Record<string, unknown>>({ method: 'POST', path: '/v1/orders', body: payload, idempotencyKey: crypto.randomUUID() });
    cleanup.push(() => client.request({ method: 'POST', path: `/v1/orders/${order.id}/cancel` }).catch(() => null));
    const instr = extractPaymentInstructions(order);
    check('Boleto: linha digitável e link gerados', !!instr.digitableLine && !!instr.ticketUrl, `vence ${instr.expiresAt}`);
    check('Boleto: pendência mapeada', mapOrderStatus(order) === 'aguardando_pagamento', String(order.status));
  }

  // ─── Aprovação e recusa de uma order (cartão de teste APRO/OTHE) ─────────
  // Pix não é pago automaticamente no sandbox; uma order de cartão de teste
  // gera respostas reais "processed" e "failed" para validar a liberação.
  {
    const pedidoId = crypto.randomUUID();
    const body = {
      type: 'online', processing_mode: 'automatic', total_amount: '10.00', external_reference: pedidoId,
      description: 'Assinatura EloLab Max (teste)',
      items: [{
        external_code: 'elolab-max', title: 'Assinatura EloLab Max (teste)',
        description: 'Acesso ao EloLab Max por 1 mês', category_id: 'software', quantity: 1, unit_price: '10.00',
      }],
      config: { statement_descriptor: 'ELOLAB' },
      transactions: { payments: [{ amount: '10.00', payment_method: { id: 'master', type: 'credit_card', token: await cardToken('APRO'), installments: 1 } }] },
      payer: {
        email: testPayerEmail || 'test_user_e2e@testuser.com', first_name: 'Teste', last_name: 'EloLab',
        identification: { type: 'CPF', number: '12345678909' },
        address: { zip_code: '06233903', street_name: 'Av. das Nações Unidas', street_number: '3003', neighborhood: 'Bonfim', city: 'Osasco', state: 'SP' },
      },
    };
    const aprovada = await createOrderWithMercadoPagoSdk(token, body, crypto.randomUUID(), testDeviceId);
    const db = memoria({ id: pedidoId, mp_order_id: String(aprovada.id) });
    const real = await client.request({ method: 'GET', path: `/v1/orders/${aprovada.id}` });
    await applyGatewayOrder(db.supabase, db.row, real);
    await applyGatewayOrder(db.supabase, db.row, real); // webhook repetido
    check('Aprovação: libera o período', db.row.status === 'pago', `order ${aprovada.id}, status ${db.row.status}`);
    check('Webhook repetido: libera uma única vez', db.row.liberacoes === 1, `liberações ${db.row.liberacoes}`);

    const recusadaBody = { ...body, external_reference: crypto.randomUUID() };
    recusadaBody.transactions = { payments: [{ ...body.transactions.payments[0], payment_method: { ...body.transactions.payments[0].payment_method, token: await cardToken('OTHE') } }] };
    try {
      await client.request({ method: 'POST', path: '/v1/orders', body: recusadaBody, idempotencyKey: crypto.randomUUID() });
      check('Recusa: order recusada', false, 'Mercado Pago aprovou um cartão OTHE');
    } catch (error) {
      const data = error instanceof MercadoPagoApiError ? (error.body as Record<string, unknown>)?.data : null;
      check('Recusa: order recusada não libera acesso', mapOrderStatus(data) === 'recusado', `HTTP ${(error as MercadoPagoApiError).status}`);
    }
  }

  // ─── Assinatura recorrente no cartão (/preapproval) ──────────────────────
  if (!testPayerEmail) {
    check('Cartão recorrente', false, 'PULADO: defina MERCADOPAGO_TEST_PAYER_EMAIL (e-mail da conta compradora de teste)');
  } else {
    for (const [holder, esperado] of [['APRO', 'authorized'], ['OTHE', 'recusado'], ['CONT', 'pending|authorized|recusado']] as const) {
      const payload = buildCardSubscriptionPayload({
        externalReference: crypto.randomUUID(), plano, payerEmail: testPayerEmail, cardTokenId: await cardToken(holder),
        backUrl: 'https://app.elolab.com.br/planos', notificationUrl: 'https://example.invalid/webhook',
      });
      try {
        const pre = await createMercadoPagoClient({ accessToken: token, maxAttempts: 1 })
          .request<Record<string, unknown>>({ method: 'POST', path: '/preapproval', body: payload });
        cleanup.push(() => client.request({ method: 'PUT', path: `/preapproval/${pre.id}`, body: { status: 'cancelled' } }).catch(() => null));
        check(`Cartão ${holder}: assinatura`, esperado.split('|').includes(String(pre.status)), `status ${pre.status}`);
        if (holder === 'APRO') {
          const cancel = await client.request<Record<string, unknown>>({ method: 'PUT', path: `/preapproval/${pre.id}`, body: { status: 'cancelled' } });
          check('Cartão: cancelamento da assinatura', cancel.status === 'cancelled' || cancel.status === 'canceled', String(cancel.status));
        }
      } catch (error) {
        const e = error as MercadoPagoApiError;
        const described = describeCardSubscriptionError(e.status ?? null, e.body);
        check(`Cartão ${holder}: assinatura`, esperado.split('|').includes(described.code), `HTTP ${e.status} → ${described.code} (${e.message})`);
      }
    }
  }

  // ─── Webhook: assinatura e repetição ──────────────────────────────────────
  {
    const secret = crypto.randomUUID();
    const notification = { action: 'order.processed', type: 'order', data: { id: 'ORDTST01M4DT6P9V3883175DZHN5R7HT', status: 'processed' } };
    const header = await signMercadoPagoNotification(secret, notification.data.id, 'req-e2e', String(Date.now()));
    const valida = await isValidMercadoPagoSignature({ xSignature: header, xRequestId: 'req-e2e', dataId: notification.data.id, secret });
    const forjada = await isValidMercadoPagoSignature({ xSignature: header, xRequestId: 'req-e2e', dataId: 'ORDOUTRA', secret });
    check('Webhook: assinatura válida aceita e forjada recusada', valida && !forjada, `válida=${valida} forjada=${forjada}`);
    check('Webhook: entrega repetida tem a mesma chave de idempotência', webhookEventKey(notification) === webhookEventKey(structuredClone(notification)), webhookEventKey(notification));
  }

  // ─── Falha de comunicação ─────────────────────────────────────────────────
  {
    const offline = createMercadoPagoClient({
      accessToken: token,
      fetchImpl: () => Promise.reject(new TypeError('rede indisponível (simulada)')),
      sleep: () => Promise.resolve(),
    });
    try {
      await offline.request({ method: 'POST', path: '/v1/orders', body: {}, idempotencyKey: crypto.randomUUID() });
      check('Falha de comunicação', false, 'não lançou erro');
    } catch (error) {
      const e = error as MercadoPagoApiError;
      check('Falha de comunicação: erro tratado como recuperável', e.isCommunicationFailure, e.message);
    }
  }
} finally {
  for (const fn of cleanup) await fn();
}

const falhas = results.filter((r) => !r.ok);
console.log(`\n${results.length - falhas.length}/${results.length} cenários OK.`);
if (falhas.length) Deno.exit(1);
