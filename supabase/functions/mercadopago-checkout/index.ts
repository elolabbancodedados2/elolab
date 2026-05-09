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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
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
      return await createSubscription(body, mpToken, supabase, corsHeaders, user.id);
    } else if (action === "get_payment") {
      return await getPayment(body, mpToken, corsHeaders);
    } else if (action === "cancel_subscription") {
      return await cancelSubscription(body, mpToken, supabase, corsHeaders);
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
  authUserId: string
) {
  const { paciente_id, plano_id, plano_slug, nome_plano, descricao, valor, frequencia, payer_email, payer_name } = body;
  const appUrl = "https://app.elolab.com.br";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const webhookUrl = `${supabaseUrl}/functions/v1/mercadopago-webhook`;
  const externalReference = crypto.randomUUID();

  // Use Preapproval API for recurring subscriptions
  // Reference: https://developers.mercadopago.com/en/reference/preapproval/_preapproval/post
  const preapprovalPayload = {
    payer_email: payer_email,
    back_url: `${appUrl}/planos?mp_status=success`,
    reason: nome_plano,
    external_reference: externalReference,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months", // Monthly subscription
      transaction_amount: Number(valor),
      currency_id: "BRL",
      start_date: new Date().toISOString(),
      end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(), // 1 year validity
    },
    notification_url: webhookUrl,
  };

  const response = await callMercadoPagoWithRetry(
    `${MP_API_BASE}/preapproval`,
    "POST",
    preapprovalPayload,
    mpToken
  );

  // Create a preference for the initial payment (first month)
  // Reference: https://developers.mercadopago.com/en/reference/preferences/_checkout_preferences/post
  const preference = {
    items: [
      {
        title: nome_plano,
        description: descricao || `Plano ${nome_plano} EloLab - 1º mês`,
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
      installments: 1,
      default_installments: 1,
    },
    back_urls: {
      success: `${appUrl}/planos?mp_status=success`,
      failure: `${appUrl}/planos?mp_status=failure`,
      pending: `${appUrl}/planos?mp_status=pending`,
    },
    auto_return: "approved",
    notification_url: webhookUrl,
    statement_descriptor: "ELOLAB",
  };

  const preferenceResponse = await callMercadoPagoWithRetry(
    `${MP_API_BASE}/checkout/preferences`,
    "POST",
    preference,
    mpToken
  );

  const { data: assinatura, error } = await supabase
    .from("assinaturas_mercadopago")
    .insert({
      paciente_id,
      mp_preapproval_id: response.id,
      nome_plano,
      descricao,
      valor: Number(valor),
      frequencia: "mensal",
      checkout_url: preferenceResponse.init_point,
      status: "pendente",
      detalhes: {
        checkout_type: "preapproval",
        preapproval_id: response.id,
        checkout_reference: externalReference,
        user_id: authUserId,
        plano_id: plano_id ?? null,
        plano_slug: plano_slug ?? null,
        payer_email: payer_email ?? null,
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
      checkout_url: preferenceResponse.init_point,
      preapproval_id: response.id,
      assinatura_id: assinatura.id,
      message: "Assinatura recorrente criada. Página de checkout aberta para pagamento do 1º mês.",
    }),
    { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
  );
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
  body: any,
  mpToken: string,
  supabase: any,
  headers: Record<string, string>
) {
  const { assinatura_id, mp_preapproval_id, user_id, motivo } = body;

  if (!mp_preapproval_id) {
    return new Response(
      JSON.stringify({ error: "mp_preapproval_id é obrigatório" }),
      { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }

  // PUT /preapproval/{id} with status: "cancelled" per MP API docs
  try {
    await callMercadoPagoWithRetry(
      `${MP_API_BASE}/preapproval/${mp_preapproval_id}`,
      "PUT",
      { status: "cancelled" },
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

  // Atualiza tabela MP (registro do gateway)
  if (assinatura_id) {
    await supabase
      .from("assinaturas_mercadopago")
      .update({ status: "cancelada" })
      .eq("id", assinatura_id);
  } else {
    // Fallback: encontrar via mp_preapproval_id
    await supabase
      .from("assinaturas_mercadopago")
      .update({ status: "cancelada" })
      .eq("mp_preapproval_id", mp_preapproval_id);
  }

  // Atualiza tabela do plano do usuário (que useUserPlan consulta)
  if (user_id) {
    await supabase
      .from("assinaturas_plano")
      .update({
        status: "cancelada",
        data_cancelamento: cancelDate,
        updated_at: cancelDate,
      })
      .eq("user_id", user_id)
      .eq("status", "ativa");
  }

  // Audit trail
  if (user_id) {
    await supabase.from("audit_log").insert({
      action: "SUBSCRIPTION_CANCELLED",
      collection: "assinaturas_mercadopago",
      record_id: assinatura_id || mp_preapproval_id,
      user_id,
      details: { motivo: motivo || null, mp_preapproval_id, cancelled_at: cancelDate },
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