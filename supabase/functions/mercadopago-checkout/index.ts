import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MP_API_BASE = "https://api.mercadopago.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const mpToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!mpToken) {
      return new Response(
        JSON.stringify({ error: "MERCADOPAGO_ACCESS_TOKEN não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const adminSupabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "create_preference") {
      return await createPreference(body, mpToken, supabase, corsHeaders);
    } else if (action === "create_subscription") {
      return await createSubscription(body, mpToken, adminSupabase, corsHeaders, user);
    } else if (action === "get_payment") {
      return await getPayment(body, mpToken, corsHeaders);
    } else if (action === "cancel_subscription") {
      return await cancelSubscription(
        mpToken,
        adminSupabase,
        corsHeaders,
        user.id,
        typeof body.motivo === "string" ? body.motivo.slice(0, 500) : null,
      );
    } else {
      return new Response(
        JSON.stringify({ error: `Ação desconhecida: ${action}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    console.error("Erro no mercadopago-checkout:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function createPreference(
  body: any,
  mpToken: string,
  supabase: any,
  headers: Record<string, string>
) {
  const { paciente_id, lancamento_id, agendamento_id, descricao, valor, parcelas_max, payer_email, payer_name } = body;

  const externalReference = crypto.randomUUID();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const webhookUrl = `${supabaseUrl}/functions/v1/mercadopago-webhook`;

  // POST /checkout/preferences per MP API docs
  const preference = {
    items: [
      {
        title: descricao || "Consulta Médica - EloLab",
        quantity: 1,
        unit_price: Number(valor),
        currency_id: "BRL",
      },
    ],
    payer: {
      ...(payer_name && { name: payer_name }),
      ...(payer_email && { email: payer_email }),
    },
    external_reference: externalReference,
    payment_methods: {
      installments: parcelas_max || 12,
    },
    back_urls: {
      success: `${supabaseUrl}/functions/v1/mercadopago-webhook?status=success`,
      failure: `${supabaseUrl}/functions/v1/mercadopago-webhook?status=failure`,
      pending: `${supabaseUrl}/functions/v1/mercadopago-webhook?status=pending`,
    },
    auto_return: "approved",
    notification_url: webhookUrl,
    statement_descriptor: "ELOLAB",
  };

  const response = await callMercadoPagoWithRetry(
    `${MP_API_BASE}/checkout/preferences`,
    "POST",
    preference,
    mpToken
  );

  // Save to DB
  const { data: pagamento, error } = await supabase
    .from("pagamentos_mercadopago")
    .insert({
      paciente_id,
      lancamento_id,
      agendamento_id,
      mp_preference_id: response.id,
      mp_external_reference: externalReference,
      valor: Number(valor),
      descricao: descricao || "Consulta Médica",
      tipo: "pagamento",
      checkout_url: response.init_point,
      parcelas: parcelas_max || 1,
    })
    .select()
    .single();

  if (error) {
    console.error("Erro ao salvar pagamento:", error);
    throw new Error("Erro ao registrar pagamento no banco");
  }

  return new Response(
    JSON.stringify({
      checkout_url: response.init_point,
      sandbox_url: response.sandbox_init_point,
      preference_id: response.id,
      pagamento_id: pagamento.id,
    }),
    { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
  );
}

async function createSubscription(
  body: any,
  mpToken: string,
  supabase: any,
  headers: Record<string, string>,
  authUser: { id: string; email?: string }
) {
  const { plano_slug, trial_dias } = body;
  if (typeof plano_slug !== "string" || !plano_slug.trim()) {
    return json({ error: "plano_slug é obrigatório" }, 400, headers);
  }

  const { data: plano, error: planoError } = await supabase
    .from("planos")
    .select("id, slug, nome, descricao, valor, frequencia, ativo, trial_dias")
    .eq("slug", plano_slug.trim().toLowerCase())
    .eq("ativo", true)
    .maybeSingle();
  if (planoError || !plano) return json({ error: "Plano não encontrado" }, 404, headers);

  const requestedTrialDays = trial_dias === undefined || trial_dias === null ? 0 : Number(trial_dias);
  const planTrialDays = Number(plano.trial_dias || 0);
  if (!Number.isInteger(requestedTrialDays) || requestedTrialDays < 0 || requestedTrialDays > planTrialDays) {
    return json({ error: "Período de teste inválido para este plano" }, 400, headers);
  }

  const payerEmail = (authUser.email || "").trim().toLowerCase();
  if (!payerEmail) return json({ error: "A conta precisa ter um e-mail válido" }, 400, headers);

  const { data: existing } = await supabase
    .from("assinaturas_plano")
    .select("id, status, plano_slug")
    .eq("user_id", authUser.id)
    .in("status", ["ativa", "trial", "pendente"])
    .limit(1)
    .maybeSingle();
  if (existing && ["ativa", "trial"].includes(existing.status) && existing.plano_slug === plano.slug) {
    return json({ error: "Este plano já está ativo para esta conta" }, 409, headers);
  }
  if (existing?.status === "pendente") {
    const pendingGateway = await findPendingGateway(supabase, authUser.id);
    if (pendingGateway?.checkout_url) {
      return json({
        checkout_url: pendingGateway.checkout_url,
        preapproval_id: pendingGateway.mp_preapproval_id,
        assinatura_id: pendingGateway.id,
        message: "A assinatura pendente foi reutilizada.",
      }, 200, headers);
    }
    return json({ error: "Já existe um pagamento de assinatura aguardando conclusão" }, 409, headers);
  }

  // O webhook pode ainda não ter criado assinaturas_plano. Reutilizar o
  // preapproval pendente evita assinaturas duplicadas por cliques repetidos.
  const pendingGateway = await findPendingGateway(supabase, authUser.id);
  if (pendingGateway?.checkout_url) {
    const detalhes = (pendingGateway.detalhes || {}) as Record<string, unknown>;
    if (detalhes.plano_slug === plano.slug) {
      return json({
        checkout_url: pendingGateway.checkout_url,
        preapproval_id: pendingGateway.mp_preapproval_id,
        assinatura_id: pendingGateway.id,
        message: "A assinatura pendente foi reutilizada.",
      }, 200, headers);
    }
    return json({ error: "Já existe um pagamento de assinatura aguardando conclusão" }, 409, headers);
  }

  const appUrl = "https://app.elolab.com.br";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const webhookUrl = `${supabaseUrl}/functions/v1/mercadopago-webhook`;
  const externalReference = crypto.randomUUID();
  const trialEnd = requestedTrialDays > 0
    ? new Date(Date.now() + requestedTrialDays * 24 * 60 * 60 * 1000)
    : new Date();

  // Use Preapproval API for recurring subscriptions
  // Reference: https://developers.mercadopago.com/en/reference/preapproval/_preapproval/post
  const preapprovalPayload = {
    status: "pending",
    payer_email: payerEmail,
    back_url: `${appUrl}/planos?mp_status=success`,
    reason: `EloLab ${plano.nome}`,
    external_reference: externalReference,
    auto_recurring: {
      frequency: 1,
      frequency_type: plano.frequencia === "anual" ? "years" : "months",
      transaction_amount: Number(plano.valor),
      currency_id: "BRL",
      start_date: trialEnd.toISOString(),
    },
    notification_url: webhookUrl,
  };

  const response = await callMercadoPagoWithRetry(
    `${MP_API_BASE}/preapproval`,
    "POST",
    preapprovalPayload,
    mpToken
  );

  // Persist the pending preapproval locally; the payer completes it at init_point.
  const { data: assinatura, error } = await supabase
    .from("assinaturas_mercadopago")
    .insert({
      mp_preapproval_id: response.id,
      nome_plano: plano.nome,
      descricao: plano.descricao,
      valor: Number(plano.valor),
      frequencia: plano.frequencia || "mensal",
      checkout_url: response.init_point,
      status: "pendente",
      detalhes: {
        checkout_type: "preapproval",
        preapproval_id: response.id,
        checkout_reference: externalReference,
        user_id: authUser.id,
        plano_id: plano.id,
        plano_slug: plano.slug,
        payer_email: payerEmail,
        trial_type: requestedTrialDays > 0 ? "with_payment_method" : "none",
        trial_end: requestedTrialDays > 0 ? trialEnd.toISOString() : null,
        auto_recurring: preapprovalPayload.auto_recurring,
      },
    })
    .select()
    .single();

  if (error) {
    console.error("Erro ao salvar assinatura:", error);
    throw new Error("Erro ao registrar assinatura no banco");
  }

  return new Response(
    JSON.stringify({
      checkout_url: response.init_point,
      preapproval_id: response.id,
      assinatura_id: assinatura.id,
      message: "Assinatura recorrente criada. Página de checkout aberta para pagamento do 1º mês.",
    }),
    { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
  );
}

async function findPendingGateway(supabase: any, authUserId: string) {
  const { data, error } = await supabase
    .from("assinaturas_mercadopago")
    .select("id, mp_preapproval_id, checkout_url, detalhes")
    .eq("status", "pendente")
    .filter("detalhes->>user_id", "eq", authUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getPayment(
  body: any,
  mpToken: string,
  headers: Record<string, string>
) {
  const { payment_id } = body;
  // GET /v1/payments/{id} per MP API docs
  const response = await callMercadoPagoWithRetry(
    `${MP_API_BASE}/v1/payments/${payment_id}`,
    "GET",
    null,
    mpToken
  );

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function cancelSubscription(
  mpToken: string,
  supabase: any,
  headers: Record<string, string>,
  authUserId: string,
  motivo: string | null = null,
) {
  const { data: candidates, error: searchError } = await supabase
    .from("assinaturas_mercadopago")
    .select("id, mp_preapproval_id, detalhes")
    .in("status", ["pendente", "ativa", "pausada"])
    .filter("detalhes->>user_id", "eq", authUserId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (searchError) throw searchError;

  const assinatura = candidates?.[0];
  const mp_preapproval_id = assinatura?.mp_preapproval_id;

  if (!mp_preapproval_id) {
    return new Response(
      JSON.stringify({ error: "mp_preapproval_id é obrigatório" }),
      { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }

  // O Mercado Pago usa o valor `canceled` para cancelar o preapproval.
  try {
    await callMercadoPagoWithRetry(
      `${MP_API_BASE}/preapproval/${mp_preapproval_id}`,
      "PUT",
      { status: "canceled" },
      mpToken
    );
  } catch (err) {
    console.error("Falha ao cancelar no Mercado Pago:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Erro ao cancelar no Mercado Pago",
      }),
      { status: 502, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }

  const cancelDate = new Date().toISOString();

  const { error: assinaturaError } = await supabase
    .from("assinaturas_mercadopago")
    .update({ status: "cancelada", data_fim: cancelDate.slice(0, 10) })
    .eq("id", assinatura.id);
  if (assinaturaError) throw assinaturaError;

  // Atualiza tabela do plano do usuário (que useUserPlan consulta)
  const { error: planError } = await supabase
    .from("assinaturas_plano")
    .update({
      status: "cancelada",
      data_cancelamento: cancelDate,
      updated_at: cancelDate,
    })
    .eq("user_id", authUserId)
    .eq("mp_assinatura_id", assinatura.id)
    .in("status", ["ativa", "trial", "pendente"]);
  if (planError) throw planError;

  // Audit trail
  if (authUserId) {
    await supabase.from("audit_log").insert({
      action: "SUBSCRIPTION_CANCELLED",
      collection: "assinaturas_mercadopago",
      record_id: assinatura.id,
      user_id: authUserId,
      details: { mp_preapproval_id, cancelled_at: cancelDate, motivo },
    });
  }

  return new Response(JSON.stringify({ success: true, cancelled_at: cancelDate }), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function callMercadoPagoWithRetry(
  url: string,
  method: string,
  payload: any,
  token: string,
  attempt = 1
): Promise<any> {
  try {
    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(90000),
    };

    if (payload && method !== "GET") {
      options.body = JSON.stringify(payload);
    }

    const response = await fetch(url, options);

    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      const text = await response.text();
      console.error("Mercado Pago retornou não-JSON:", text.substring(0, 200));
      throw new Error("Mercado Pago retornou resposta inválida");
    }

    const data = await response.json();

    if (response.status >= 400 && response.status < 500) {
      console.error("Mercado Pago 4xx:", JSON.stringify(data));
      throw new Error(data.message || `Erro do Mercado Pago: ${response.status}`);
    }

    if (!response.ok) {
      throw new Error(`Erro do gateway Mercado Pago: ${response.status}`);
    }

    return data;
  } catch (error: any) {
    if (error.message?.includes("Erro do Mercado Pago") || error.message?.includes("4")) {
      throw error;
    }

    console.error(`Tentativa ${attempt}/3 falhou:`, error.message);
    if (attempt >= 3) {
      throw new Error(`Mercado Pago indisponível após 3 tentativas: ${error.message}`);
    }
    await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt - 1)));
    return callMercadoPagoWithRetry(url, method, payload, token, attempt + 1);
  }
}

function json(payload: Record<string, unknown>, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
