// Ações do checkout transparente dos planos (tela /planos/checkout/:slug).
//
// - create_card_subscription: assinatura recorrente no cartão (/preapproval com
//   card_token_id e status "authorized"). O token vem do Card Payment Brick;
//   o número do cartão nunca passa pelo EloLab.
// - create_plan_order / get_plan_order / cancel_plan_order: pagamento único de
//   um período por Pix (/v1/orders).
//
// Preço, período e ativação são sempre decididos no servidor.

import { createMercadoPagoClient, MercadoPagoApiError } from '../_shared/mercadoPagoClient.ts';
import {
  buildCardSubscriptionPayload,
  buildPlanOrderPayload,
  describeCardSubscriptionError,
  extractPaymentInstructions,
  mapOrderStatus,
  normalizeOrderPayer,
  periodMonthsFor,
  PLAN_ORDER_OPEN_STATUSES,
} from '../_shared/planCheckout.ts';
import { applyGatewayOrder, sanitizeOrderSnapshot, syncPlanOrderFromGateway } from '../_shared/platformPlanOrders.ts';
import { syncPlatformPlan } from '../_shared/platformPlanSync.ts';
import { createOrderWithMercadoPagoSdk } from '../_shared/mercadoPagoOrdersSdk.ts';

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export interface PlanCheckoutContext {
  supabase: SupabaseLike;
  user: { id: string; email?: string; created_at?: string; user_metadata?: Record<string, unknown> };
  mpToken: string;
  headers: Record<string, string>;
}

type GatewayRequest = (preapprovalId: string) => Promise<unknown>;
type CreateCardGatewayRequest = (payload: Record<string, unknown>, deviceId: string | null) => Promise<Record<string, unknown>>;

const APP_URL = 'https://app.elolab.com.br';
const ORDER_CLIENT_FIELDS =
  'id, plano_slug, metodo, valor, periodo_meses, status, status_detail, ticket_url, qr_code, qr_code_base64, digitable_line, barcode_content, expira_em, pago_em, periodo_inicio, periodo_fim, created_at';

function reply(payload: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function isSandbox() {
  return (Deno.env.get('MERCADOPAGO_ENV') || '').toLowerCase() === 'sandbox';
}

export function trialDaysForPlan(plano: { trial_dias?: unknown } | null | undefined): number {
  const days = Number(plano?.trial_dias ?? 0);
  return Number.isSafeInteger(days) && days > 0 ? days : 0;
}

/**
 * E-mail do pagador. No sandbox o Mercado Pago exige que pagador e vendedor
 * sejam usuários de teste, então usamos o e-mail do comprador de teste
 * configurado no servidor. Em produção é sempre o e-mail da conta logada.
 */
function payerEmailFor(user: { email?: string }): string | null {
  if (isSandbox()) {
    const testPayer = (Deno.env.get('MERCADOPAGO_TEST_PAYER_EMAIL') || '').trim().toLowerCase();
    if (testPayer) return testPayer;
  }
  const email = (user.email || '').trim().toLowerCase();
  return email || null;
}

async function loadActivePlan(supabase: SupabaseLike, slug: unknown) {
  if (typeof slug !== 'string' || !slug.trim()) return null;
  const { data, error } = await supabase
    .from('planos')
    .select('id, slug, nome, descricao, valor, frequencia, ativo, trial_dias, features')
    .eq('slug', slug.trim().toLowerCase())
    .eq('ativo', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const valor = Number(data.valor);
  return Number.isFinite(valor) && valor > 0 ? data : null;
}

async function loadCurrentPlan(supabase: SupabaseLike, userId: string) {
  const { data, error } = await supabase
    .from('assinaturas_plano')
    .select('id, plano_id, plano_slug, status, em_trial, trial_fim, data_fim, mp_assinatura_id, cobranca_modalidade')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function hasTrialHistory(supabase: SupabaseLike, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('platform_plan_trial_claims')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function validateBuyerCheckout(ctx: PlanCheckoutContext) {
  const { data: profile, error } = await ctx.supabase.from('profiles').select('clinica_id').eq('id', ctx.user.id).maybeSingle();
  if (error) throw error;
  const { data: roles, error: roleError } = await ctx.supabase.from('user_roles').select('role').eq('user_id', ctx.user.id);
  if (roleError) throw roleError;
  const hasClinicRole = (roles || []).length > 0;
  if (!profile?.clinica_id && !hasClinicRole) {
    const metadata = ctx.user.user_metadata || {};
    // O comprador pode trocar de plano antes do primeiro pagamento. O slug
    // inicial em user_metadata identifica a jornada de compra, mas não deve
    // impedir a escolha de outro plano ativo no catálogo.
    if (metadata.checkout_flow !== 'saas_subscription') {
      throw new Error('Este cadastro não tem uma contratação pendente válida para este plano. Volte à página de planos e inicie a contratação.');
    }
    const email = (ctx.user.email || '').trim().toLowerCase();
    if (email) {
      const [{ data: clinicInvite, error: clinicInviteError }, { data: employeeInvite, error: employeeInviteError }] = await Promise.all([
        ctx.supabase.from('convites_funcionario').select('id').ilike('email', email).is('accepted_at', null).gt('expires_at', new Date().toISOString()).limit(1),
        ctx.supabase.from('employee_invitations').select('id').ilike('email', email).eq('status', 'pending').gt('expires_at', new Date().toISOString()).limit(1),
      ]);
      if (clinicInviteError) throw clinicInviteError;
      if (employeeInviteError) throw employeeInviteError;
      if (clinicInvite?.length || employeeInvite?.length) {
        throw new Error('Este e-mail já tem um convite de equipe pendente. Aceite o convite ou use outro e-mail para contratar uma clínica.');
      }
    }
  }
}

async function provisionAfterEntitlement(supabase: SupabaseLike, userId: string) {
  const { data, error } = await supabase.rpc('provision_clinic_after_subscription', { p_user_id: userId });
  if (error) throw new Error(`Assinatura confirmada, mas o provisionamento da clínica falhou: ${error.message}`);
  return data;
}

async function loadOpenOrder(supabase: SupabaseLike, userId: string) {
  const { data, error } = await supabase
    .from('platform_plan_orders')
    .select(`${ORDER_CLIENT_FIELDS}, mp_order_id, plano_id, user_id, idempotency_key`)
    .eq('user_id', userId)
    .in('status', ['criando', ...PLAN_ORDER_OPEN_STATUSES])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function clientOrder(row: Record<string, unknown> | null) {
  if (!row) return null;
  const keys = ORDER_CLIENT_FIELDS.split(',').map((k) => k.trim());
  return Object.fromEntries(keys.map((k) => [k, row[k] ?? null]));
}

function hasActiveRecurring(current: Record<string, unknown> | null) {
  return Boolean(
    current &&
      ['ativa', 'trial'].includes(String(current.status)) &&
      current.cobranca_modalidade !== 'pre_pago' &&
      current.mp_assinatura_id,
  );
}

function activePrepaidEnd(current: Record<string, unknown> | null): Date | null {
  if (!current || current.cobranca_modalidade !== 'pre_pago' || current.status !== 'ativa' || !current.data_fim) {
    return null;
  }
  const end = new Date(String(current.data_fim));
  return end.getTime() > Date.now() ? end : null;
}

// ─── Resumo para a tela de checkout ─────────────────────────────────────────

export async function billingStatus(body: Record<string, unknown>, ctx: PlanCheckoutContext) {
  const plano = body.plano_slug ? await loadActivePlan(ctx.supabase, body.plano_slug) : null;
  if (body.plano_slug && !plano) return reply({ error: 'Plano não encontrado' }, 404, ctx.headers);

  if (plano) await validateBuyerCheckout(ctx);

  const current = await loadCurrentPlan(ctx.supabase, ctx.user.id);
  const trialHistory = await hasTrialHistory(ctx.supabase, ctx.user.id);
  let clinic: unknown = null;
  if (current && ['ativa', 'trial'].includes(String(current.status))) {
    // Recupera de uma interrupção entre a confirmação do gateway e a criação da clínica.
    clinic = await provisionAfterEntitlement(ctx.supabase, ctx.user.id);
  }
  const open = await loadOpenOrder(ctx.supabase, ctx.user.id);

  return reply({
    public_key: Deno.env.get('MERCADOPAGO_PUBLIC_KEY') || null,
    sandbox: isSandbox(),
    plano: plano
      ? {
        id: plano.id,
        slug: plano.slug,
        nome: plano.nome,
        descricao: plano.descricao,
        valor: Number(plano.valor),
        frequencia: plano.frequencia || 'mensal',
        trial_dias: trialDaysForPlan(plano),
        features: plano.features || [],
        periodo_meses: periodMonthsFor(plano.frequencia),
      }
      : null,
    assinatura: current
      ? {
        plano_slug: current.plano_slug,
        status: current.status,
        em_trial: current.em_trial,
        trial_fim: current.trial_fim,
        data_fim: current.data_fim,
        modalidade: current.cobranca_modalidade || (current.mp_assinatura_id ? 'recorrente' : null),
      }
      : null,
    pedido_aberto: clientOrder(open),
    trial_elegivel: Boolean(!current && !trialHistory),
    provisionamento: clinic,
  }, 200, ctx.headers);
}

// ─── Cartão: assinatura recorrente ──────────────────────────────────────────

export async function createCardSubscription(
  body: Record<string, unknown>,
  ctx: PlanCheckoutContext,
  gatewayRequest?: CreateCardGatewayRequest,
) {
  const { supabase, user, headers } = ctx;
  const plano = await loadActivePlan(supabase, body.plano_slug);
  if (!plano) return reply({ error: 'Plano não encontrado' }, 404, headers);
  await validateBuyerCheckout(ctx);

  const openPlanOrder = await loadOpenOrder(supabase, user.id);
  if (openPlanOrder) {
    return reply({ error: 'Há um pagamento Pix pendente. Conclua ou cancele esse pedido antes de iniciar uma assinatura no cartão.' }, 409, headers);
  }

  const cardTokenId = typeof body.card_token_id === 'string' ? body.card_token_id.trim() : '';
  if (!/^[A-Za-z0-9-]{16,64}$/.test(cardTokenId)) {
    return reply({ error: 'Dados do cartão inválidos. Preencha o cartão novamente.' }, 400, headers);
  }

  const requestedTrialDays = body.trial_dias === undefined || body.trial_dias === null ? 0 : Number(body.trial_dias);
  const configuredTrialDays = trialDaysForPlan(plano);
  if (
    !Number.isSafeInteger(requestedTrialDays)
    || requestedTrialDays < 0
    || (requestedTrialDays > 0 && requestedTrialDays !== configuredTrialDays)
  ) {
    return reply({ error: 'Período de teste inválido para este plano' }, 400, headers);
  }
  if (requestedTrialDays > 0 && body.trial_consent !== true) {
    return reply({ error: 'É necessário autorizar claramente a cobrança recorrente após o teste.' }, 400, headers);
  }

  const payerEmail = payerEmailFor(user);
  if (!payerEmail) return reply({ error: 'A conta precisa ter um e-mail válido' }, 400, headers);

  const current = await loadCurrentPlan(supabase, user.id);
  if (hasActiveRecurring(current) && current?.plano_slug === plano.slug) {
    return reply({ error: 'Este plano já está ativo para esta conta' }, 409, headers);
  }
  // Teste grátis só para quem ainda não tem plano ativo.
  if (requestedTrialDays > 0 && (current || await hasTrialHistory(supabase, user.id))) {
    return reply({ error: 'O teste grátis está disponível somente uma vez por conta e não pode ser reutilizado.' }, 409, headers);
  }

  const client = createMercadoPagoClient({ accessToken: ctx.mpToken });

  // Checkout hospedado que ficou pendente é substituído pelo cartão.
  const { data: pendentes, error: pendentesError } = await supabase
    .from('assinaturas_mercadopago')
    .select('id, mp_preapproval_id')
    .eq('status', 'pendente')
    .filter('detalhes->>user_id', 'eq', user.id);
  if (pendentesError) throw pendentesError;
  for (const pendente of pendentes || []) {
    if (pendente.mp_preapproval_id) {
      try {
        await client.request({ method: 'PUT', path: `/preapproval/${pendente.mp_preapproval_id}`, body: { status: 'cancelled' } });
      } catch (error) {
        console.warn('Não foi possível cancelar checkout pendente:', pendente.mp_preapproval_id, error);
      }
    }
    await supabase.from('assinaturas_mercadopago').update({ status: 'cancelada' }).eq('id', pendente.id);
  }

  // Sem cobrança dobrada: quem tem período pré-pago vigente só é cobrado no fim dele.
  const trialEnd = requestedTrialDays > 0 ? new Date(Date.now() + requestedTrialDays * 86400000) : null;
  const startDate = trialEnd ?? activePrepaidEnd(current);
  const externalReference = crypto.randomUUID();

  // Registro local antes da chamada: se a resposta se perder, o webhook
  // reconcilia pelo external_reference.
  const { data: local, error: localError } = await supabase
    .from('assinaturas_mercadopago')
    .insert({
      nome_plano: plano.nome,
      descricao: plano.descricao,
      valor: Number(plano.valor),
      frequencia: plano.frequencia || 'mensal',
      status: 'pendente',
      detalhes: {
        checkout_type: 'preapproval_card',
        checkout_reference: externalReference,
        user_id: user.id,
        plano_id: plano.id,
        plano_slug: plano.slug,
        payer_email: payerEmail,
        trial_type: trialEnd ? 'with_payment_method' : 'none',
        trial_end: trialEnd?.toISOString() || null,
        trial_consent: trialEnd ? {
          accepted: true,
          accepted_at: new Date().toISOString(),
          terms_version: `recurring-trial-${requestedTrialDays}d-v1`,
        } : null,
        start_date: startDate?.toISOString() || null,
      },
    })
    .select('id, detalhes')
    .single();
  if (localError) throw localError;

  if (trialEnd) {
    const { error: claimError } = await supabase
      .from('platform_plan_trial_claims')
      .insert({
        user_id: user.id,
        plano_slug: plano.slug,
        trial_days: requestedTrialDays,
        checkout_reference: crypto.randomUUID(),
        status: 'reserved',
      });
    if (claimError) {
      // Unique user_id makes trial eligibility atomic even across concurrent requests.
      await supabase
        .from('assinaturas_mercadopago')
        .update({ status: 'cancelada' })
        .eq('id', local.id);
      return reply({ error: 'O teste grátis já foi utilizado ou está sendo iniciado nesta conta.' }, 409, headers);
    }
  }

  const payload = buildCardSubscriptionPayload({
    externalReference,
    plano,
    payerEmail,
    cardTokenId,
    backUrl: `${APP_URL}/planos?mp_status=success`,
    notificationUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mercadopago-webhook`,
    startDate,
  });

  let preapproval: Record<string, unknown>;
  try {
    // Uma tentativa só: repetir um POST de assinatura sem idempotência poderia
    // criar duas assinaturas no cartão do cliente.
    const deviceId = normalizeDeviceId(body.device_id);
    preapproval = gatewayRequest
      ? await gatewayRequest(payload, deviceId)
      : await createMercadoPagoClient({ accessToken: ctx.mpToken, maxAttempts: 1, timeoutMs: 30000 })
        .request({ method: 'POST', path: '/preapproval', body: payload, deviceId });
  } catch (error) {
    const apiError = error instanceof MercadoPagoApiError ? error : null;
    const described = describeCardSubscriptionError(apiError?.status ?? null, apiError?.body ?? null);
    console.error('Assinatura no cartão não criada:', apiError?.status, JSON.stringify(apiError?.body ?? String(error)).slice(0, 500));
    await supabase
      .from('assinaturas_mercadopago')
      .update({
        // Falha de comunicação: estado desconhecido no gateway, o webhook decide.
        status: described.code === 'falha_comunicacao' ? 'pendente' : 'cancelada',
        detalhes: { ...local.detalhes, erro_checkout: described.code, erro_http: apiError?.status ?? null },
      })
      .eq('id', local.id);
    // Uma recusa 4xx é definitiva: nenhum teste foi iniciado, então a pessoa
    // pode corrigir os dados e tentar de novo. Em timeout/5xx, manter a reserva
    // evita criar um segundo trial caso o gateway tenha recebido a primeira
    // solicitação e a resposta tenha se perdido.
    if (trialEnd && described.code !== 'falha_comunicacao') {
      const { error: claimReleaseError } = await supabase
        .from('platform_plan_trial_claims')
        .delete()
        .eq('user_id', user.id)
        .eq('status', 'reserved');
      if (claimReleaseError) console.error('Não foi possível liberar a reserva do teste após recusa definitiva.');
    }
    return reply({ error: described.message, code: described.code }, described.httpStatus, headers);
  }

  const gatewayStatus = String(preapproval.status || 'pending');
  const statusMap: Record<string, string> = {
    authorized: 'ativa',
    pending: 'pendente',
    paused: 'pausada',
    cancelled: 'cancelada',
    canceled: 'cancelada',
  };
  const { error: updateError } = await supabase
    .from('assinaturas_mercadopago')
    .update({
      mp_preapproval_id: String(preapproval.id),
      status: statusMap[gatewayStatus] || 'pendente',
      data_inicio: typeof preapproval.date_created === 'string' ? preapproval.date_created.slice(0, 10) : null,
      proximo_pagamento: typeof preapproval.next_payment_date === 'string' ? preapproval.next_payment_date.slice(0, 10) : null,
      detalhes: {
        ...local.detalhes,
        preapproval_id: String(preapproval.id),
        preapproval_status: gatewayStatus,
        auto_recurring: payload.auto_recurring,
      },
    })
    .eq('id', local.id);
  if (updateError) throw updateError;

  if (trialEnd) {
    const { error: claimUpdateError } = await supabase
      .from('platform_plan_trial_claims')
      .update({ status: gatewayStatus === 'authorized' ? 'started' : 'pending', gateway_subscription_id: String(preapproval.id) })
      .eq('user_id', user.id);
    if (claimUpdateError) throw claimUpdateError;
  }

  if (gatewayStatus === 'authorized') {
    await syncPlatformPlan(supabase, {
      assinaturaId: local.id,
      userId: user.id,
      planoId: plano.id,
      planoSlug: plano.slug,
      gatewayStatus,
      trialEnd: trialEnd?.toISOString() || null,
    }, ctx.mpToken);
    await provisionAfterEntitlement(supabase, user.id);
  }

  return reply({
    status: gatewayStatus === 'authorized' ? 'aprovado' : gatewayStatus === 'pending' ? 'em_analise' : 'recusado',
    assinatura_id: local.id,
    proxima_cobranca: preapproval.next_payment_date ?? null,
    em_trial: Boolean(trialEnd),
  }, 200, headers);
}

/** Cancela somente a assinatura recorrente atualmente vinculada ao plano ativo do usuário. */
export async function cancelPlanSubscription(
  body: Record<string, unknown>,
  ctx: PlanCheckoutContext,
  gatewayRequest?: GatewayRequest,
) {
  const { supabase, user, headers, mpToken } = ctx;
  const { data: current, error: currentError } = await supabase
    .from('assinaturas_plano')
    .select('mp_assinatura_id, cobranca_modalidade')
    .eq('user_id', user.id)
    .in('status', ['ativa', 'trial'])
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current?.mp_assinatura_id || current.cobranca_modalidade === 'pre_pago') {
    return reply({ error: 'Não há assinatura recorrente ativa para cancelar.' }, 404, headers);
  }

  const { data: assinatura, error: assinaturaLookupError } = await supabase
    .from('assinaturas_mercadopago')
    .select('id, mp_preapproval_id')
    .eq('id', current.mp_assinatura_id)
    .eq('status', 'ativa')
    .filter('detalhes->>user_id', 'eq', user.id)
    .maybeSingle();
  if (assinaturaLookupError) throw assinaturaLookupError;
  if (!assinatura?.mp_preapproval_id) return reply({ error: 'A assinatura ativa vinculada ao plano não foi encontrada.' }, 404, headers);

  try {
    if (gatewayRequest) await gatewayRequest(String(assinatura.mp_preapproval_id));
    else await createMercadoPagoClient({ accessToken: mpToken }).request({
      method: 'PUT',
      path: `/preapproval/${encodeURIComponent(String(assinatura.mp_preapproval_id))}`,
      body: { status: 'cancelled' },
    });
  } catch (error) {
    console.error('Falha ao cancelar no Mercado Pago:', error);
    return reply({ error: error instanceof Error ? error.message : 'Erro ao cancelar no Mercado Pago' }, 502, headers);
  }

  const cancelledAt = new Date().toISOString();
  const { data: updatedGateway, error: gatewayUpdateError } = await supabase
    .from('assinaturas_mercadopago')
    .update({ status: 'cancelada', data_fim: cancelledAt.slice(0, 10) })
    .eq('id', assinatura.id)
    .select('id')
    .maybeSingle();
  if (gatewayUpdateError) throw gatewayUpdateError;
  if (!updatedGateway) throw new Error('Mercado Pago cancelou a assinatura, mas o registro local correspondente não foi atualizado.');

  const { data: updatedPlan, error: planUpdateError } = await supabase
    .from('assinaturas_plano')
    .update({ status: 'cancelada', data_cancelamento: cancelledAt, updated_at: cancelledAt })
    .eq('user_id', user.id)
    .eq('mp_assinatura_id', assinatura.id)
    .in('status', ['ativa', 'trial'])
    .select('id')
    .maybeSingle();
  if (planUpdateError) throw planUpdateError;
  if (!updatedPlan) throw new Error('Mercado Pago cancelou a assinatura, mas o plano ativo correspondente não foi atualizado.');

  const motivo = typeof body.motivo === 'string' ? body.motivo.slice(0, 500) : null;
  await supabase.from('audit_log').insert({
    action: 'SUBSCRIPTION_CANCELLED',
    collection: 'assinaturas_mercadopago',
    record_id: assinatura.id,
    user_id: user.id,
    details: { mp_preapproval_id: assinatura.mp_preapproval_id, cancelled_at: cancelledAt, motivo },
  });
  return reply({ success: true, cancelled_at: cancelledAt }, 200, headers);
}

// ─── Pix: pagamento único de um período ────────────────────────────────────

/** Device ID gerado pelo MercadoPago.js V2 no navegador; opcional e só alfanumérico. */
function normalizeDeviceId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{8,512}$/.test(value) ? value : null;
}

async function postOrder(
  ctx: PlanCheckoutContext,
  row: Record<string, unknown>,
  payload: Record<string, unknown>,
  deviceId: string | null,
) {
  try {
    const criada = await createOrderWithMercadoPagoSdk(
      ctx.mpToken,
      payload,
      String(row.idempotency_key),
      deviceId,
    );
    // O POST pode retornar dados iniciais sem o Pix completo. O GET é a
    // resposta canônica documentada para carregar as instruções de pagamento.
    if (criada.id) {
      try {
        const atualizada = await createMercadoPagoClient({ accessToken: ctx.mpToken, maxAttempts: 2 })
          .request<Record<string, unknown>>({ method: 'GET', path: `/v1/orders/${encodeURIComponent(String(criada.id))}` });
        if (String(atualizada.id) === String(criada.id)) return { order: atualizada, error: null as MercadoPagoApiError | null };
      } catch (refreshError) {
        console.warn('Não foi possível atualizar os dados do pedido recém-criado:', refreshError instanceof MercadoPagoApiError ? refreshError.status : 'falha de comunicação');
      }
    }
    return { order: criada, error: null as MercadoPagoApiError | null };
  } catch (error) {
    if (error instanceof MercadoPagoApiError) {
      // Pedido recusado volta 4xx com a order em "data".
      const data = (error.body as Record<string, unknown> | null)?.data;
      if (data && typeof data === 'object' && (data as Record<string, unknown>).id) {
        return { order: data as Record<string, unknown>, error };
      }
      return { order: null, error };
    }
    throw error;
  }
}

export async function createPlanOrder(body: Record<string, unknown>, ctx: PlanCheckoutContext) {
  const { supabase, user, headers } = ctx;
  const metodo = body.metodo === 'pix' ? 'pix' : null;
  if (!metodo) return reply({ error: 'Forma de pagamento inválida. Use cartão ou Pix.' }, 400, headers);

  const plano = await loadActivePlan(supabase, body.plano_slug);
  if (!plano) return reply({ error: 'Plano não encontrado' }, 404, headers);
  await validateBuyerCheckout(ctx);

  const payerEmail = payerEmailFor(user);
  if (!payerEmail) return reply({ error: 'A conta precisa ter um e-mail válido' }, 400, headers);

  // O Mercado Pago avalia payer.address na qualidade da integração Pix.
  const normalized = normalizeOrderPayer((body.pagador || {}) as Record<string, unknown>, true);
  if (!normalized.payer) return reply({ error: normalized.errors.join('. '), campos: normalized.errors }, 400, headers);
  const payer = normalized.payer;

  const current = await loadCurrentPlan(supabase, user.id);
  if (hasActiveRecurring(current)) {
    return reply({
      error: 'Sua conta tem uma assinatura recorrente no cartão. Cancele-a em Planos antes de pagar por Pix, para não ser cobrado duas vezes.',
    }, 409, headers);
  }

  const months = periodMonthsFor(plano.frequencia);
  const valor = Number(plano.valor);
  let row = await loadOpenOrder(supabase, user.id);

  if (row) {
    const samePurchase = row.plano_id === plano.id && row.metodo === metodo && Number(row.valor) === valor;
    const stillValid = !row.expira_em || new Date(String(row.expira_em)).getTime() > Date.now() + 5 * 60000;
    if (samePurchase && stillValid && row.status !== 'criando' && row.mp_order_id) {
      return reply({ pedido: clientOrder(row), reutilizado: true }, 200, headers);
    }
    if (!samePurchase || (!stillValid && row.status !== 'criando')) {
      // Troca de forma de pagamento/plano ou pagamento vencido: encerra o anterior.
      if (row.mp_order_id) {
        try {
          await createMercadoPagoClient({ accessToken: ctx.mpToken })
            .request({ method: 'POST', path: `/v1/orders/${encodeURIComponent(String(row.mp_order_id))}/cancel` });
        } catch (error) {
          console.warn('Não foi possível cancelar o pedido anterior:', row.mp_order_id, error);
        }
      }
      await supabase
        .from('platform_plan_orders')
        .update({ status: row.mp_order_id ? 'cancelado' : 'erro', updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .in('status', ['criando', ...PLAN_ORDER_OPEN_STATUSES]);
      row = null;
    }
    // samePurchase em "criando": a chamada anterior não terminou; repete com a
    // mesma chave de idempotência, sem gerar outra cobrança.
  }

  if (!row) {
    const { data: inserted, error: insertError } = await supabase
      .from('platform_plan_orders')
      .insert({
        user_id: user.id,
        plano_id: plano.id,
        plano_slug: plano.slug,
        metodo,
        valor,
        periodo_meses: months,
        status: 'criando',
      })
      .select(`${ORDER_CLIENT_FIELDS}, mp_order_id, plano_id, user_id, idempotency_key`)
      .single();
    if (insertError?.code === '23505') {
      return reply({ error: 'Já existe um pagamento sendo gerado. Aguarde alguns segundos.' }, 409, headers);
    }
    if (insertError) throw insertError;
    row = inserted;
  }

  const payload = buildPlanOrderPayload({
    pedidoId: String(row.id),
    plano,
    method: metodo,
    payerEmail,
    payer,
  });
  const { order, error } = await postOrder(ctx, row, payload, normalizeDeviceId(body.device_id));

  if (!order) {
    const communication = error?.isCommunicationFailure ?? true;
    if (!communication) {
      await supabase
        .from('platform_plan_orders')
        .update({
          status: error?.status === 402 ? 'recusado' : 'erro',
          erro_mensagem: error?.message?.slice(0, 500) || 'Erro do Mercado Pago',
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
    }
    console.error('Pedido de plano não criado:', error?.status, JSON.stringify(error?.body ?? '').slice(0, 500));
    return reply({
      error: communication
        ? 'Não foi possível falar com o Mercado Pago agora. Nenhuma cobrança foi gerada; tente novamente em instantes.'
        : error?.status === 402
        ? 'O Mercado Pago recusou o pagamento. Confira os dados e tente outra forma de pagamento.'
        : 'O Mercado Pago não conseguiu gerar o Pix. Tente novamente.',
      code: communication ? 'falha_comunicacao' : error?.status === 402 ? 'recusado' : 'dados_invalidos',
    }, communication ? 503 : 422, headers);
  }

  const instructions = extractPaymentInstructions(order);
  const { error: updateError } = await supabase
    .from('platform_plan_orders')
    .update({
      mp_order_id: String(order.id),
      mp_payment_id: instructions.mpPaymentId,
      status: mapOrderStatus(order) === 'pago' ? 'em_processamento' : mapOrderStatus(order) || 'em_processamento',
      status_detail: typeof order.status_detail === 'string' ? order.status_detail : null,
      ticket_url: instructions.ticketUrl,
      qr_code: instructions.qrCode,
      qr_code_base64: instructions.qrCodeBase64,
      digitable_line: instructions.digitableLine,
      barcode_content: instructions.barcodeContent,
      expira_em: instructions.expiresAt,
      gateway_snapshot: sanitizeOrderSnapshot(order),
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);
  if (updateError) throw updateError;

  // Se já voltou pago, a liberação passa pela mesma função atômica do webhook.
  if (mapOrderStatus(order) === 'pago') {
    await applyGatewayOrder(supabase, { id: String(row.id), user_id: user.id, valor, status: 'em_processamento', mp_order_id: String(order.id) }, order);
  }

  const { data: fresh } = await supabase.from('platform_plan_orders').select(ORDER_CLIENT_FIELDS).eq('id', row.id).single();
  return reply({ pedido: clientOrder(fresh) }, 201, headers);
}

async function loadOwnOrder(ctx: PlanCheckoutContext, pedidoId: unknown) {
  if (typeof pedidoId !== 'string' || !/^[0-9a-f-]{36}$/i.test(pedidoId)) return null;
  const { data, error } = await ctx.supabase
    .from('platform_plan_orders')
    .select(`${ORDER_CLIENT_FIELDS}, mp_order_id`)
    .eq('id', pedidoId)
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPlanOrder(body: Record<string, unknown>, ctx: PlanCheckoutContext) {
  const row = await loadOwnOrder(ctx, body.pedido_id);
  if (!row) return reply({ error: 'Pedido não encontrado' }, 404, ctx.headers);

  if (row.mp_order_id && (PLAN_ORDER_OPEN_STATUSES as string[]).includes(row.status)) {
    try {
      await syncPlanOrderFromGateway(ctx.supabase, createMercadoPagoClient({ accessToken: ctx.mpToken, maxAttempts: 1 }), row.mp_order_id);
    } catch (error) {
      // A tela continua consultando; o webhook também atualiza o pedido.
      console.warn('Consulta do pedido no Mercado Pago falhou:', row.mp_order_id, error);
    }
  }

  const fresh = await loadOwnOrder(ctx, body.pedido_id);
  return reply({ pedido: clientOrder(fresh) }, 200, ctx.headers);
}

export async function cancelPlanOrder(body: Record<string, unknown>, ctx: PlanCheckoutContext) {
  const row = await loadOwnOrder(ctx, body.pedido_id);
  if (!row) return reply({ error: 'Pedido não encontrado' }, 404, ctx.headers);
  if (!['criando', ...PLAN_ORDER_OPEN_STATUSES].includes(row.status)) {
    return reply({ pedido: clientOrder(row) }, 200, ctx.headers);
  }

  if (row.mp_order_id) {
    const client = createMercadoPagoClient({ accessToken: ctx.mpToken });
    try {
      await client.request({ method: 'POST', path: `/v1/orders/${encodeURIComponent(row.mp_order_id)}/cancel` });
    } catch (error) {
      // Já pago ou já expirado no gateway: o estado real vem da consulta abaixo.
      console.warn('Cancelamento do pedido recusado pelo Mercado Pago:', row.mp_order_id, error);
    }
    await syncPlanOrderFromGateway(ctx.supabase, client, row.mp_order_id);
  } else {
    await ctx.supabase
      .from('platform_plan_orders')
      .update({ status: 'cancelado', updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'criando');
  }

  const fresh = await loadOwnOrder(ctx, body.pedido_id);
  return reply({ pedido: clientOrder(fresh) }, 200, ctx.headers);
}
