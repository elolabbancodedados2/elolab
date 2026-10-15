import { billingStatus, cancelPlanSubscription, createCardSubscription, createPlanOrder, trialDaysForPlan } from './planCheckoutActions.ts';
import { MercadoPagoApiError } from '../_shared/mercadoPagoClient.ts';

function checkoutSupabase(planTrialDays: number) {
  const plan = {
    id: 'synthetic-plan', slug: 'elolab-max', nome: 'EloLab Max', descricao: null,
    valor: 99, frequencia: 'mensal', ativo: true, trial_dias: planTrialDays, features: [],
  };

  return {
    from(table: string) {
      const result = table === 'planos'
        ? plan
        : table === 'profiles'
          ? { clinica_id: 'synthetic-clinic' }
          : table === 'user_roles'
            ? []
            : null;
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: result, error: null }),
        then: (resolve: (value: { data: unknown; error: null }) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve({ data: result, error: null }).then(resolve, reject),
      };
      return builder;
    },
  };
}

Deno.test('trialDaysForPlan accepts only positive safe integer durations', () => {
  if (trialDaysForPlan({ trial_dias: 5 }) !== 5) throw new Error('Configured trial days must be preserved.');
  for (const trial_dias of [0, null, -1, 2.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    if (trialDaysForPlan({ trial_dias }) !== 0) throw new Error('Invalid trial duration must disable the offer.');
  }
});

Deno.test('createCardSubscription rejects a trial duration different from the plan catalog', async () => {
  const response = await createCardSubscription(
    { plano_slug: 'elolab-max', card_token_id: 'synthetic-card-token-123', trial_dias: 3, trial_consent: true },
    {
      supabase: checkoutSupabase(5),
      user: {
        id: 'synthetic-user',
        email: 'qa@example.test',
        user_metadata: { checkout_flow: 'saas_subscription', checkout_plan_slug: 'elolab-max' },
      },
      mpToken: '',
      headers: {},
    },
  );

  if (response.status !== 400) throw new Error(`Expected HTTP 400 for mismatched trial days, got ${response.status}.`);
});

function scriptedSupabase(options: {
  planSlug?: string;
  currentPlan?: Record<string, unknown> | null;
  openOrder?: Record<string, unknown> | null;
  trialClaim?: Record<string, unknown> | null;
  gatewaySubscription?: Record<string, unknown> | null;
  pendingGateway?: Record<string, unknown> | null;
  updatedGateway?: Record<string, unknown> | null;
  updatedPlan?: Record<string, unknown> | null;
}) {
  const calls: Array<{ table: string; operation: string; filters: Record<string, unknown>; values?: unknown }> = [];
  return {
    calls,
    from(table: string) {
      let operation = 'select';
      const filters: Record<string, unknown> = {};
      let values: unknown;
      const entry = () => ({ table, operation, filters: { ...filters }, values });
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = (key: string, value: unknown) => { filters[key] = value; return builder; };
      builder.ilike = (key: string, value: unknown) => { filters[key] = value; return builder; };
      builder.is = (key: string, value: unknown) => { filters[key] = value; return builder; };
      builder.gt = (key: string, value: unknown) => { filters[key] = value; return builder; };
      builder.in = (key: string, value: unknown) => { filters[key] = value; return builder; };
      builder.filter = (key: string, _operator: string, value: unknown) => { filters[key] = value; return builder; };
      builder.order = () => builder;
      builder.limit = () => builder;
      builder.insert = (row: unknown) => { operation = 'insert'; values = row; return builder; };
      builder.update = (row: unknown) => { operation = 'update'; values = row; return builder; };
      builder.delete = () => { operation = 'delete'; return builder; };
      builder.maybeSingle = async () => {
        calls.push(entry());
        if (table === 'planos') return { data: { id: 'plan', slug: options.planSlug ?? 'elolab-max', nome: 'Max', valor: 99, trial_dias: 5, ativo: true }, error: null };
        if (table === 'profiles') return { data: { clinica_id: null }, error: null };
        if (table === 'assinaturas_plano') return { data: operation === 'update' ? options.updatedPlan ?? null : options.currentPlan ?? null, error: null };
        if (table === 'platform_plan_orders') return { data: options.openOrder ?? null, error: null };
        if (table === 'platform_plan_trial_claims') {
          if (operation === 'insert' && options.trialClaim) return { data: null, error: { code: '23505' } };
          return { data: options.trialClaim ?? null, error: null };
        }
        if (table === 'assinaturas_mercadopago') {
          if (operation === 'insert') return { data: { id: 'new-gateway-row', detalhes: (values as Record<string, unknown>)?.detalhes }, error: null };
          return { data: operation === 'update' ? options.updatedGateway ?? null : options.gatewaySubscription ?? null, error: null };
        }
        return { data: null, error: null };
      };
      builder.single = builder.maybeSingle;
      builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        calls.push(entry());
        return Promise.resolve({
          data: table === 'assinaturas_mercadopago'
            ? operation === 'select' && options.pendingGateway ? [options.pendingGateway] : []
            : [],
          error: null,
        }).then(resolve, reject);
      };
      return builder;
    },
  };
}

Deno.test('pending buyer can choose another active plan before payment', async () => {
  const response = await billingStatus(
    { plano_slug: 'elolab-ultra' },
    {
      supabase: scriptedSupabase({ planSlug: 'elolab-ultra' }),
      user: {
        id: 'synthetic-user',
        email: 'qa@example.test',
        user_metadata: { checkout_flow: 'saas_subscription', checkout_plan_slug: 'elolab-max' },
      },
      mpToken: '',
      headers: {},
    },
  );
  if (response.status !== 200) throw new Error(`Expected HTTP 200 for a valid plan change, got ${response.status}.`);
  const payload = await response.json() as { plano?: { slug?: string } };
  if (payload.plano?.slug !== 'elolab-ultra') {
    throw new Error('The checkout must return the newly selected active plan.');
  }
});

Deno.test('card checkout rejects a second payment method while Pix order is open', async () => {
  let gatewayCalled = false;
  const response = await createCardSubscription(
    { plano_slug: 'elolab-ultra', card_token_id: 'synthetic-card-token-123' },
    {
      supabase: scriptedSupabase({
        planSlug: 'elolab-ultra',
        openOrder: { id: 'open-pix-order', plano_slug: 'elolab-max', status: 'aguardando_pagamento' },
      }),
      user: {
        id: 'synthetic-user',
        email: 'qa@example.test',
        user_metadata: { checkout_flow: 'saas_subscription', checkout_plan_slug: 'elolab-max' },
      },
      mpToken: '',
      headers: {},
    },
    async () => { gatewayCalled = true; return { id: 'synthetic-gateway-subscription', status: 'authorized' }; },
  );

  if (response.status !== 409 || gatewayCalled) {
    throw new Error(`Expected HTTP 409 without a gateway call, got status ${response.status} and gatewayCalled=${gatewayCalled}.`);
  }
});

Deno.test('forged signup metadata cannot bypass a server-owned prior-trial claim', async () => {
  const supabase = scriptedSupabase({ trialClaim: { user_id: 'synthetic-user' } });
  const response = await createCardSubscription(
    { plano_slug: 'elolab-max', card_token_id: 'synthetic-card-token-123', trial_dias: 5, trial_consent: true },
    {
      supabase,
      user: {
        id: 'synthetic-user',
        email: 'qa@example.test',
        user_metadata: { checkout_flow: 'saas_subscription', checkout_plan_slug: 'elolab-max' },
      },
      mpToken: '',
      headers: {},
    },
  );

  if (response.status !== 409) throw new Error(`Expected HTTP 409 for forged metadata with prior trial, got ${response.status}.`);
  if (supabase.calls.some((call) => call.table === 'assinaturas_mercadopago' && call.operation === 'insert')) {
    throw new Error('The Mercado Pago subscription must not be created for an account with trial history.');
  }
});

Deno.test('prior trial history rejects a second trial after the plan was cancelled', async () => {
  const supabase = scriptedSupabase({ trialClaim: { user_id: 'synthetic-user' } });
  const response = await createCardSubscription(
    { plano_slug: 'elolab-max', card_token_id: 'synthetic-card-token-123', trial_dias: 5, trial_consent: true },
    {
      supabase,
      user: { id: 'synthetic-user', email: 'qa@example.test', user_metadata: { checkout_flow: 'saas_subscription', checkout_plan_slug: 'elolab-max' } },
      mpToken: '',
      headers: {},
    },
  );
  if (response.status !== 409) throw new Error(`Expected HTTP 409 for a previously used trial, got ${response.status}.`);
});

Deno.test('trial requires an explicit recurring-charge consent in the request', async () => {
  const response = await createCardSubscription(
    { plano_slug: 'elolab-max', card_token_id: 'synthetic-card-token-123', trial_dias: 5 },
    {
      supabase: scriptedSupabase({}),
      user: { id: 'synthetic-user', email: 'qa@example.test', user_metadata: { checkout_flow: 'saas_subscription', checkout_plan_slug: 'elolab-max' } },
      mpToken: '',
      headers: {},
    },
  );
  if (response.status !== 400) throw new Error(`Expected HTTP 400 without explicit consent, got ${response.status}.`);
});

Deno.test('definitive card rejection releases an unstarted trial reservation', async () => {
  const supabase = scriptedSupabase({});
  const response = await createCardSubscription(
    { plano_slug: 'elolab-max', card_token_id: 'synthetic-card-token-123', trial_dias: 5, trial_consent: true },
    {
      supabase,
      user: { id: 'synthetic-user', email: 'qa@example.test', user_metadata: { checkout_flow: 'saas_subscription', checkout_plan_slug: 'elolab-max' } },
      mpToken: '',
      headers: {},
    },
    async () => { throw new MercadoPagoApiError('synthetic card declined', 402, { message: 'card declined' }, false); },
  );

  if (response.status !== 402) throw new Error(`Expected HTTP 402 for a declined synthetic card, got ${response.status}.`);
  const release = supabase.calls.find((call) => call.table === 'platform_plan_trial_claims' && call.operation === 'delete');
  if (release?.filters.user_id !== 'synthetic-user' || release.filters.status !== 'reserved') {
    throw new Error('A definitive decline must release only this user’s unstarted trial reservation.');
  }
});

Deno.test('ambiguous gateway communication failure keeps the trial reservation', async () => {
  const supabase = scriptedSupabase({});
  const response = await createCardSubscription(
    { plano_slug: 'elolab-max', card_token_id: 'synthetic-card-token-123', trial_dias: 5, trial_consent: true },
    {
      supabase,
      user: { id: 'synthetic-user', email: 'qa@example.test', user_metadata: { checkout_flow: 'saas_subscription', checkout_plan_slug: 'elolab-max' } },
      mpToken: '',
      headers: {},
    },
    async () => { throw new MercadoPagoApiError('synthetic network timeout', null, null, true); },
  );

  if (response.status !== 503) throw new Error(`Expected HTTP 503 for an ambiguous gateway failure, got ${response.status}.`);
  if (supabase.calls.some((call) => call.table === 'platform_plan_trial_claims' && call.operation === 'delete')) {
    throw new Error('An ambiguous gateway result must retain the reservation to prevent a duplicate trial.');
  }
});

Deno.test('cancellation selects the active plan subscription instead of a newer pending checkout', async () => {
  const supabase = scriptedSupabase({
    currentPlan: { mp_assinatura_id: 'active-local-id' },
    gatewaySubscription: { id: 'active-local-id', mp_preapproval_id: 'active-mp-id' },
    pendingGateway: { id: 'newer-pending-id', mp_preapproval_id: 'newer-pending-mp-id', status: 'pendente' },
    updatedGateway: { id: 'active-local-id' },
    updatedPlan: { id: 'plan-row' },
  });
  let cancelledId = '';
  const response = await cancelPlanSubscription(
    {},
    { supabase, user: { id: 'synthetic-user' }, mpToken: '', headers: {} },
    async (id) => { cancelledId = id; },
  );
  if (response.status !== 200 || cancelledId !== 'active-mp-id') {
    throw new Error(`Expected active MP subscription to be cancelled, got status ${response.status} and id ${cancelledId}.`);
  }
  const lookup = supabase.calls.find((call) => call.table === 'assinaturas_mercadopago' && call.operation === 'select');
  if (lookup?.filters.id !== 'active-local-id') throw new Error('Cancellation must query the exact local row linked to the active plan.');
  const gatewayUpdate = supabase.calls.find((call) => call.table === 'assinaturas_mercadopago' && call.operation === 'update');
  const planUpdate = supabase.calls.find((call) => call.table === 'assinaturas_plano' && call.operation === 'update');
  if ((gatewayUpdate?.values as Record<string, unknown> | undefined)?.status !== 'cancelada') {
    throw new Error('Successful gateway cancellation must immediately mark the local gateway subscription as cancelled.');
  }
  const planValues = planUpdate?.values as Record<string, unknown> | undefined;
  if (planValues?.status !== 'cancelada' || typeof planValues.data_cancelamento !== 'string') {
    throw new Error('Successful cancellation must immediately end plan access and record when cancellation occurred.');
  }
});

Deno.test('cancellation fails if the exact local gateway subscription row was not updated', async () => {
  const supabase = scriptedSupabase({
    currentPlan: { mp_assinatura_id: 'active-local-id' },
    gatewaySubscription: { id: 'active-local-id', mp_preapproval_id: 'active-mp-id' },
    updatedGateway: null,
  });
  let gatewayCancelled = false;
  let rejected = false;
  try {
    await cancelPlanSubscription(
      {},
      { supabase, user: { id: 'synthetic-user' }, mpToken: '', headers: {} },
      async () => { gatewayCancelled = true; },
    );
  } catch (error) {
    rejected = error instanceof Error && error.message.includes('registro local correspondente');
  }
  if (!gatewayCancelled || !rejected) throw new Error('Cancellation must report failure when the matching local row update returns no row.');
});

Deno.test('createPlanOrder rejects boleto before accessing clinic data or Mercado Pago', async () => {
  const response = await createPlanOrder(
    { metodo: 'boleto' },
    {
      supabase: null,
      user: { id: 'synthetic-user' },
      mpToken: '',
      headers: {},
    },
  );

  if (response.status !== 400) {
    throw new Error(`Expected HTTP 400 for retired payment method, got ${response.status}`);
  }
  const body = await response.json();
  if (!String(body.error).includes('Use cartão ou Pix')) {
    throw new Error('The response must direct the caller to the supported payment methods.');
  }
});
