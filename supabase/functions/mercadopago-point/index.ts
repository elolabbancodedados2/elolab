import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsPadrao } from '../_shared/cors.ts';
import { accessTokenMercadoPagoClinica } from '../_shared/mercadoPagoClinicToken.ts';
import { syncMercadoPagoPointOrder } from '../_shared/mercadoPagoPointOrders.ts';

const MP_API = 'https://api.mercadopago.com';
const CAN_OPERATE = new Set(['admin', 'financeiro', 'recepcao']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function mpRequest(
  token: string,
  path: string,
  method = 'GET',
  payload?: unknown,
  idempotencyKey?: string,
  extraHeaders: Record<string, string> = {},
) {
  const response = await fetch(`${MP_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
      ...extraHeaders,
    },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(12_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Mercado Pago respondeu HTTP ${response.status}.`);
  return data;
}

Deno.serve(async (req) => {
  const cors = corsPadrao(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405, cors);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'Serviço indisponível.' }, 503, cors);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Faça login para continuar.' }, 401, cors);
    const service = createClient(url, serviceKey);
    const [{ data: profile }, { data: role }] = await Promise.all([
      service.from('profiles').select('clinica_id').eq('id', user.id).maybeSingle(),
      service.from('user_roles').select('role').eq('user_id', user.id).in('role', [...CAN_OPERATE]).maybeSingle(),
    ]);
    const clinicId = profile?.clinica_id as string | undefined;
    if (!clinicId || !role) return json({ error: 'Seu perfil não pode operar o Mercado Pago desta clínica.' }, 403, cors);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '');
    const accessToken = await accessTokenMercadoPagoClinica(service, clinicId);
    if (!accessToken) return json({ connected: false, error: 'A clínica ainda não conectou sua conta Mercado Pago.' }, 409, cors);

    if (action === 'list_terminals') {
      const result = await mpRequest(accessToken, '/terminals/v1/list?limit=50&offset=0');
      const terminals = Array.isArray(result?.data?.terminals) ? result.data.terminals : [];
      return json({ connected: true, terminals: terminals.map((t: any) => ({
        id: String(t.id ?? ''),
        pos_id: t.pos_id == null ? null : String(t.pos_id),
        store_id: t.store_id == null ? null : String(t.store_id),
        external_pos_id: typeof t.external_pos_id === 'string' ? t.external_pos_id : null,
        operating_mode: typeof t.operating_mode === 'string' ? t.operating_mode : 'UNDEFINED',
      })) }, 200, cors);
    }

    if (action === 'list_orders') {
      const { data, error } = await service.from('mercadopago_point_orders')
        .select('id,lancamento_id,mp_order_id,terminal_id,valor,status,status_detail,mp_payment_id,payment_method,payment_sync_status,payment_sync_error,expires_at,paid_at,created_at')
        .eq('clinica_id', clinicId).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return json({ connected: true, orders: data ?? [] }, 200, cors);
    }

    if (action === 'sync_order') {
      const mpOrderId = String(body.mp_order_id ?? '');
      if (!mpOrderId || mpOrderId.length > 80) return json({ error: 'Order inválida.' }, 400, cors);
      const sync = await syncMercadoPagoPointOrder(service, mpOrderId);
      if (!sync.found) return json({ error: 'Order Point não encontrada nesta clínica.' }, 404, cors);
      const { data: order, error } = await service.from('mercadopago_point_orders')
        .select('id,lancamento_id,mp_order_id,terminal_id,valor,status,status_detail,mp_payment_id,payment_method,payment_sync_status,payment_sync_error,expires_at,paid_at,created_at')
        .eq('mp_order_id', mpOrderId).eq('clinica_id', clinicId).single();
      if (error) throw error;
      return json({ connected: true, order, reconciliation: sync.reconciliation }, 200, cors);
    }

    if (action === 'create_order') {
      const lancamentoId = String(body.lancamento_id ?? '');
      const terminalId = String(body.terminal_id ?? '');
      const requestId = String(body.request_id ?? '');
      if (!UUID.test(lancamentoId) || !UUID.test(requestId) || !terminalId || terminalId.length > 120) {
        return json({ error: 'Cobrança, terminal ou solicitação inválida.' }, 400, cors);
      }

      const dateParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(new Date());
      const dateValues = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));
      const clinicDate = `${dateValues.year}-${dateValues.month}-${dateValues.day}`;
      const { data: cashbox, error: cashError } = await service.from('caixa_diario').select('id')
        .eq('clinica_id', clinicId).eq('data', clinicDate).eq('aberto', true).maybeSingle();
      if (cashError) throw cashError;
      if (!cashbox) return json({ error: 'Abra o caixa do dia antes de iniciar a cobrança no terminal.' }, 409, cors);

      const { data: bill, error: billError } = await service.from('lancamentos')
        .select('id,clinica_id,valor,valor_pago,desconto,acrescimo,status')
        .eq('id', lancamentoId).eq('clinica_id', clinicId).maybeSingle();
      if (billError) throw billError;
      if (!bill || ['cancelado', 'estornado'].includes(String(bill.status))) {
        return json({ error: 'Cobrança não encontrada ou não pode mais ser paga.' }, 404, cors);
      }
      const { data: existingPayments, error: paymentsError } = await service.from('pagamentos')
        .select('valor').eq('clinica_id', clinicId).eq('lancamento_id', lancamentoId).is('estornado_em', null);
      if (paymentsError) throw paymentsError;
      const paidSoFar = (existingPayments ?? []).reduce((total: number, item: { valor: number | string }) => total + Number(item.valor), 0);
      const amount = Math.round((Number(bill.valor) - Number(bill.desconto ?? 0) + Number(bill.acrescimo ?? 0) - paidSoFar) * 100) / 100;
      if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'Esta cobrança não possui saldo pendente.' }, 409, cors);

      const availableTerminals = await mpRequest(accessToken, '/terminals/v1/list?limit=50&offset=0');
      const terminalExists = Array.isArray(availableTerminals?.data?.terminals)
        && availableTerminals.data.terminals.some((item: any) => String(item.id ?? '') === terminalId);
      if (!terminalExists) return json({ error: 'O terminal selecionado não pertence à conta Mercado Pago desta clínica.' }, 403, cors);

      const { data: inFlight, error: inFlightError } = await service.from('mercadopago_point_orders')
        .select('id,request_id,status,mp_order_id,external_reference,idempotency_key,terminal_id,valor,expires_at')
        .eq('clinica_id', clinicId).eq('lancamento_id', lancamentoId)
        .in('status', ['creating', 'created', 'at_terminal', 'action_required'])
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (inFlightError) throw inFlightError;

      type LocalPointOrder = {
        id: string;
        request_id: string;
        mp_order_id: string | null;
        status: string;
        external_reference: string;
        idempotency_key: string;
        terminal_id: string;
        valor: number | string;
        expires_at: string | null;
      };
      let localOrder = inFlight as LocalPointOrder | null;
      if (localOrder?.request_id === requestId && localOrder.mp_order_id) {
        return json({ order: localOrder }, 200, cors);
      }
      if (localOrder?.mp_order_id && localOrder.expires_at && Date.parse(localOrder.expires_at) <= Date.now()) {
        // A expiração local não prova que o terminal encerrou a order. Consulte
        // o Mercado Pago antes de liberar uma nova cobrança para esta fatura.
        await syncMercadoPagoPointOrder(service, localOrder.mp_order_id);
        const { data: refreshed, error: refreshError } = await service.from('mercadopago_point_orders')
          .select('id,request_id,status,mp_order_id,external_reference,idempotency_key,terminal_id,valor,expires_at')
          .eq('id', localOrder.id).eq('clinica_id', clinicId).maybeSingle();
        if (refreshError) throw refreshError;
        localOrder = refreshed as LocalPointOrder | null;
      }

      if (localOrder && localOrder.status !== 'creating' && localOrder.status !== 'expired'
        && localOrder.status !== 'failed' && localOrder.status !== 'canceled') {
        return json({ error: 'Já existe uma cobrança aguardando no terminal.', existing_order: localOrder }, 409, cors);
      }

      if (!localOrder) {
        const { data: existingOrder, error: localError } = await service.from('mercadopago_point_orders')
          .select('id,request_id,mp_order_id,status,external_reference,idempotency_key,terminal_id,valor,expires_at')
          .eq('clinica_id', clinicId).eq('request_id', requestId).maybeSingle();
        if (localError) throw localError;
        localOrder = existingOrder as LocalPointOrder | null;
      }
      if (localOrder?.mp_order_id) return json({ order: localOrder }, 200, cors);
      if (!localOrder) {
        const id = crypto.randomUUID();
        const { data: inserted, error } = await service.from('mercadopago_point_orders').insert({
          id,
          clinica_id: clinicId,
          lancamento_id: lancamentoId,
          created_by: user.id,
          request_id: requestId,
          idempotency_key: crypto.randomUUID(),
          external_reference: `elolab-point-${id}`,
          terminal_id: terminalId,
          valor: amount,
          status: 'creating',
          expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        }).select('id,external_reference,idempotency_key,terminal_id,valor').single();
        if (error?.code === '23505') {
          return json({ error: 'Já existe uma cobrança em andamento para esta fatura. Atualize os pedidos antes de repetir.' }, 409, cors);
        }
        if (error || !inserted) throw error ?? new Error('Falha ao preparar cobrança local.');
        localOrder = {
          id: String(inserted.id),
          request_id: requestId,
          mp_order_id: null,
          status: 'creating',
          external_reference: String(inserted.external_reference),
          idempotency_key: String(inserted.idempotency_key),
          terminal_id: terminalId,
          valor: amount,
          expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        };
      }
      if (!localOrder) throw new Error('Falha ao preparar cobrança local.');

      try {
        const created = await mpRequest(accessToken, '/v1/orders', 'POST', {
          type: 'point',
          external_reference: localOrder.external_reference,
          expiration_time: 'PT15M',
          transactions: { payments: [{ amount: Number(localOrder.valor).toFixed(2) }] },
          config: { point: { terminal_id: localOrder.terminal_id } },
          description: 'Cobrança EloLab',
        }, localOrder.idempotency_key);
        const { error: saveError } = await service.from('mercadopago_point_orders').update({
          mp_order_id: String(created.id),
          status: String(created.status ?? 'created'),
          status_detail: String(created.status_detail ?? ''),
          updated_at: new Date().toISOString(),
        }).eq('id', localOrder.id);
        if (saveError) throw saveError;
        return json({ order: { id: localOrder.id, mp_order_id: String(created.id), status: created.status, valor: localOrder.valor } }, 201, cors);
      } catch (error) {
        // Mantém a solicitação e a chave idempotente para uma repetição segura.
        await service.from('mercadopago_point_orders').update({
          status_detail: error instanceof Error ? error.message.slice(0, 250) : 'Falha ao criar no gateway',
          updated_at: new Date().toISOString(),
        }).eq('id', localOrder.id);
        throw error;
      }
    }

    if (action === 'cancel_order') {
      const localId = String(body.order_id ?? '');
      if (!UUID.test(localId)) return json({ error: 'Pedido inválido.' }, 400, cors);
      const { data: localOrder, error } = await service.from('mercadopago_point_orders')
        .select('id,mp_order_id,idempotency_key,status,status_detail').eq('id', localId).eq('clinica_id', clinicId).maybeSingle();
      if (error) throw error;
      if (!localOrder?.mp_order_id) return json({ error: 'Pedido não encontrado.' }, 404, cors);
      if (!['created', 'at_terminal'].includes(localOrder.status)) {
        return json({ error: 'Este pedido não pode ser cancelado neste status.' }, 409, cors);
      }
      if (localOrder.status === 'at_terminal' && localOrder.status_detail === 'cancel_requested') {
        return json({ order: { id: localId, status: 'at_terminal', cancel_requested: true } }, 202, cors);
      }
      const cancellationRequestedAtTerminal = localOrder.status === 'at_terminal';
      const cancelled = await mpRequest(
        accessToken,
        `/v1/orders/${encodeURIComponent(localOrder.mp_order_id)}/cancel`,
        'POST',
        {},
        crypto.randomUUID(),
        cancellationRequestedAtTerminal ? { 'x-allow-cancelable-status': 'at_terminal' } : {},
      );
      // Mercado Pago aceita o cancelamento em at_terminal de forma assíncrona.
      // O webhook confirmará o estado final; não marque como cancelado antes.
      const { error: updateError } = await service.from('mercadopago_point_orders').update({
        status: cancellationRequestedAtTerminal ? 'at_terminal' : String(cancelled.status ?? 'canceled'),
        status_detail: cancellationRequestedAtTerminal ? 'cancel_requested' : String(cancelled.status_detail ?? 'canceled'),
        updated_at: new Date().toISOString(),
      }).eq('id', localId).eq('clinica_id', clinicId);
      if (updateError) throw updateError;
      return json({
        order: {
          id: localId,
          status: cancellationRequestedAtTerminal ? 'at_terminal' : cancelled.status ?? 'canceled',
          cancel_requested: cancellationRequestedAtTerminal,
        },
      }, cancellationRequestedAtTerminal ? 202 : 200, cors);
    }

    return json({ error: 'Ação inválida.' }, 400, cors);
  } catch (error) {
    console.error('[mercadopago-point]', error instanceof Error ? error.message : 'erro');
    return json({ error: error instanceof Error ? error.message : 'Não foi possível concluir a operação.' }, 500, cors);
  }
});
