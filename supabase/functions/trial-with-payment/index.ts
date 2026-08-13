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

  // Este endpoint antigo aceitava valores e dados de pagamento enviados pelo
  // navegador e ainda tentava gravar em uma estrutura que não possui esses
  // campos. O fluxo único e seguro agora é mercadopago-checkout, que resolve o
  // plano no servidor e abre o checkout hospedado pelo Mercado Pago.
  return new Response(
    JSON.stringify({ error: "Use o checkout oficial da assinatura da plataforma." }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );

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
    const { plano_slug, plano_nome, plano_valor, trial_dias, payer_email, payer_name, payment_method } = body;

    // Validate required fields
    if (!plano_slug || !plano_valor || !trial_dias) {
      return new Response(
        JSON.stringify({ error: "Dados incompletos: plano_slug, plano_valor, trial_dias são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate payment method
    if (!payment_method || !["credit_card", "pix_recurring"].includes(payment_method)) {
      return new Response(
        JSON.stringify({ error: "Método de pagamento inválido. Use 'credit_card' ou 'pix_recurring'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate trial days (1-30 days reasonable limit)
    if (typeof trial_dias !== "number" || trial_dias < 1 || trial_dias > 30) {
      return new Response(
        JSON.stringify({ error: "Período de teste deve estar entre 1 e 30 dias" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate price is positive
    if (typeof plano_valor !== "number" || plano_valor <= 0) {
      return new Response(
        JSON.stringify({ error: "Valor do plano inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!payer_email || !emailRegex.test(payer_email)) {
      return new Response(
        JSON.stringify({ error: "Email do pagador inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already has an active trial or subscription for this plan
    const { data: existingSubscriptions } = await supabase
      .from("assinaturas_plano")
      .select("id, status, em_trial")
      .eq("user_id", user.id)
      .eq("plano_slug", plano_slug)
      .in("status", ["trial", "ativa"]);

    if (existingSubscriptions && existingSubscriptions.length > 0) {
      return new Response(
        JSON.stringify({ error: "Você já possui um plano ativo ou em período de teste. Cancele-o primeiro para ativar outro." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate trial end date (3 days from now)
    const trialEndDate = new Date(new Date().setDate(new Date().getDate() + trial_dias));
    const chargeDate = new Date(trialEndDate);

    // Create preapproval with trial period
    // The preapproval will auto-charge after trial ends (3 days from now)
    const externalReference = crypto.randomUUID();
    const appUrl = "https://app.elolab.com.br";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const webhookUrl = `${supabaseUrl}/functions/v1/mercadopago-webhook`;

    const preapprovalPayload = {
      payer_email: payer_email,
      back_url: `${appUrl}/planos?mp_status=success`,
      reason: `${plano_nome} - Período de Teste (${trial_dias} dias)`,
      external_reference: externalReference,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: Number(plano_valor),
        currency_id: "BRL",
        // Start charging after trial period ends
        start_date: chargeDate.toISOString(),
        end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
      },
      notification_url: webhookUrl,
    };

    const response = await callMercadoPagoWithRetry(
      `${MP_API_BASE}/preapproval`,
      "POST",
      preapprovalPayload,
      mpToken
    );

    // Create trial record in assinaturas_plano with trial_trial_payment_method
    const { data: trialRecord, error: trialError } = await supabase
      .from("assinaturas_plano")
      .insert({
        user_id: user.id,
        plano_slug: plano_slug,
        status: "trial",
        em_trial: true,
        trial_fim: trialEndDate.toISOString(),
        detalhes: {
          trial_type: "with_payment_method",
          preapproval_id: response.id,
          preapproval_status: response.status,
          external_reference: externalReference,
          payment_method: payment_method,
          user_email: payer_email,
          user_name: payer_name,
          auto_recurring: preapprovalPayload.auto_recurring,
          trial_start: new Date().toISOString(),
          trial_end: trialEndDate.toISOString(),
          charge_date: chargeDate.toISOString(),
        },
      })
      .select()
      .single();

    if (trialError) {
      console.error("Erro ao salvar período de teste:", trialError);
      throw new Error("Erro ao registrar período de teste no banco");
    }

    return new Response(
      JSON.stringify({
        success: true,
        preapproval_id: response.id,
        preapproval_status: response.status,
        trial_id: trialRecord.id,
        trial_end: trialEndDate.toISOString(),
        charge_date: chargeDate.toISOString(),
        message: `Período de teste iniciado. Cobrança será realizada em ${chargeDate.toLocaleDateString('pt-BR')}.`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro no trial-with-payment:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

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
