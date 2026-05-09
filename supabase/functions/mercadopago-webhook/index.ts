import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MP_API_BASE = "https://api.mercadopago.com";

// Validate Mercado Pago signature (HMAC-SHA256)
async function validateMercadoPagoSignature(
  request: Request,
  body: string,
  secret: string
): Promise<boolean> {
  const xSignature = request.headers.get("x-signature");
  const xRequestId = request.headers.get("x-request-id");

  if (!xSignature || !xRequestId) {
    console.warn("Missing signature headers");
    return false;
  }

  // xSignature format: "ts=1234567890,v1=hash_value"
  const parts = xSignature.split(",");
  let timestamp = "";
  let hash = "";

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "ts") timestamp = value;
    if (key === "v1") hash = value;
  }

  if (!timestamp || !hash) {
    console.warn("Invalid signature format");
    return false;
  }

  // Construct the signature string: request_id.timestamp.body
  const signatureString = `${xRequestId}.${timestamp}.${body}`;

  // Create HMAC-SHA256
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signatureString)
  );

  const calculatedHash = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  const isValid = calculatedHash === hash;
  if (!isValid) {
    console.warn("Signature validation failed");
  }
  return isValid;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Handle redirect back_urls (GET) — user returning from checkout
    if (req.method === "GET") {
      const url = new URL(req.url);
      const status = url.searchParams.get("status") || "unknown";
      const appUrl = "https://app.elolab.com.br";
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          Location: `${appUrl}/planos?mp_status=${status}`,
        },
      });
    }

    // Handle webhook notification (POST)
    const body = await req.text();
    const data = JSON.parse(body);
    console.log("Webhook recebido:", JSON.stringify(data));

    // Validate signature — MERCADOPAGO_WEBHOOK_SECRET é obrigatório.
    // Se ausente, recusamos webhooks para impedir spoofing (ativar conta de graça
    // sem ter pago). Configure em Supabase Dashboard → Edge Functions → Secrets.
    const mpWebhookSecret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
    if (!mpWebhookSecret) {
      console.error("MERCADOPAGO_WEBHOOK_SECRET not configured — webhook rejected");
      return new Response(
        JSON.stringify({ error: "Webhook validation not configured. Contact admin." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const isValid = await validateMercadoPagoSignature(req, body, mpWebhookSecret);
    if (!isValid) {
      console.error("Invalid webhook signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for idempotency — prevent duplicate processing
    const eventId = data.id?.toString() || `${data.type}-${data.data?.id}`;
    const { data: existingLog } = await supabase
      .from("mercadopago_webhook_logs")
      .select("id, processado")
      .eq("event_id", eventId)
      .maybeSingle();

    if (existingLog && existingLog.processado) {
      console.log("Webhook already processed:", eventId);
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log webhook event (or update if idempotency key already exists)
    let logId = existingLog?.id;
    if (!logId) {
      const { data: newLog, error: logError } = await supabase
        .from("mercadopago_webhook_logs")
        .insert({
          event_type: data.type || data.action || "unknown",
          event_id: eventId,
          data_id: data.data?.id?.toString(),
          payload: data,
          tentativas: 1,
        })
        .select("id")
        .single();

      if (logError) {
        console.error("Failed to create webhook log:", logError);
        return new Response(JSON.stringify({ error: "Failed to log webhook" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      logId = newLog.id;
    }

    const mpToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!mpToken) {
      console.error("MERCADOPAGO_ACCESS_TOKEN não configurado");
      await supabase
        .from("mercadopago_webhook_logs")
        .update({ erro_mensagem: "Missing MERCADOPAGO_ACCESS_TOKEN" })
        .eq("id", logId);
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process payment notification (payment.created, payment.updated)
    if (
      data.type === "payment" ||
      data.action === "payment.created" ||
      data.action === "payment.updated"
    ) {
      const paymentId = data.data?.id;
      if (paymentId) {
        await processPaymentNotification(paymentId.toString(), mpToken, supabase, logId);
      }
    }

    // Process subscription notification (subscription_preapproval)
    if (
      data.type === "subscription_preapproval" ||
      data.action?.includes("preapproval") ||
      data.type === "subscription_preapproval_plan"
    ) {
      const preapprovalId = data.data?.id;
      if (preapprovalId) {
        await processSubscriptionNotification(preapprovalId.toString(), mpToken, supabase, logId);
      }
    }

    // Process authorized_payment (subscription automatic renewal payment)
    if (
      data.type === "subscription_authorized_payment" ||
      data.action?.includes("authorized_payment")
    ) {
      const paymentId = data.data?.id;
      if (paymentId) {
        console.log("Processing automatic subscription renewal payment:", paymentId);
        await processPaymentNotification(paymentId.toString(), mpToken, supabase, logId);
        // Also log this as a renewal in the subscription
        const preapprovalId = data.data?.preapproval_id;
        if (preapprovalId) {
          const { data: assinatura } = await supabase
            .from("assinaturas_mercadopago")
            .select("detalhes, id")
            .eq("mp_preapproval_id", preapprovalId)
            .maybeSingle();

          if (assinatura) {
            const detalhes = (assinatura.detalhes || {}) as Record<string, unknown>;
            const trialType = typeof detalhes.trial_type === "string" ? detalhes.trial_type : null;

            await supabase
              .from("assinaturas_mercadopago")
              .update({
                detalhes: {
                  ...detalhes,
                  ultima_renovacao: new Date().toISOString(),
                  ultimo_pagamento_autorizado: paymentId,
                },
              })
              .eq("mp_preapproval_id", preapprovalId);

            // If this is a trial with payment method, activate the plan now that 3 days have passed
            if (trialType === "with_payment_method") {
              const userId = typeof detalhes.user_id === "string" ? detalhes.user_id : null;
              const planoId = typeof detalhes.plano_id === "string" ? detalhes.plano_id : null;
              const planoSlug = typeof detalhes.plano_slug === "string" ? detalhes.plano_slug : null;

              if (userId && planoId && planoSlug) {
                const { data: existingPlan } = await supabase
                  .from("assinaturas_plano")
                  .select("id")
                  .eq("user_id", userId)
                  .eq("plano_slug", planoSlug)
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();

                if (existingPlan?.id) {
                  // Activate the trial plan after first payment (trial ended)
                  await supabase
                    .from("assinaturas_plano")
                    .update({
                      status: "ativa",
                      em_trial: false,
                      trial_fim: null,
                      data_cancelamento: null,
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", existingPlan.id);
                  console.log("Trial period ended and activated paid plan for user:", userId);
                }
              }
            }
          }
        }
      }
    }

    // Mark webhook as processed
    await supabase
      .from("mercadopago_webhook_logs")
      .update({ processado: true })
      .eq("id", logId);

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Erro no webhook:", error);
    // Log error but return 200 to avoid Mercado Pago retries
    // The webhook log entry has already been created
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processPaymentNotification(
  paymentId: string,
  mpToken: string,
  supabase: any,
  logId: string
) {
  let retries = 0;
  const maxRetries = 3;

  while (retries < maxRetries) {
    try {
      // GET /v1/payments/{id} per MP API docs
      const response = await fetch(`${MP_API_BASE}/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${mpToken}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        console.error(`Erro ao buscar pagamento ${paymentId}:`, response.status);
        retries++;
        if (retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
          continue;
        }
        await supabase
          .from("mercadopago_webhook_logs")
          .update({ erro_mensagem: `Failed to fetch payment after ${maxRetries} retries` })
          .eq("id", logId);
        return;
      }

      const payment = await response.json();
      console.log("Pagamento processado:", payment.id, payment.status, "ref:", payment.external_reference);

      const statusMap: Record<string, string> = {
        approved: "aprovado",
        pending: "pendente",
        in_process: "em_processo",
        rejected: "rejeitado",
        cancelled: "cancelado",
        refunded: "reembolsado",
        charged_back: "reembolsado",
      };

      const status = statusMap[payment.status] || payment.status;

      // Update pagamentos_mercadopago by external_reference
      const { data: pagamentos } = await supabase
        .from("pagamentos_mercadopago")
        .select("id, lancamento_id")
        .eq("mp_external_reference", payment.external_reference)
        .limit(1);

      if (pagamentos && pagamentos.length > 0) {
        const { error: updateError } = await supabase
          .from("pagamentos_mercadopago")
          .update({
            mp_payment_id: payment.id?.toString(),
            status,
            valor_pago: payment.transaction_amount,
            metodo_pagamento: payment.payment_type_id,
            data_aprovacao: payment.status === "approved" ? new Date().toISOString() : null,
            parcelas: payment.installments,
            detalhes_pagamento: payment,
            notificacao_webhook: payment,
          })
          .eq("id", pagamentos[0].id);

        if (updateError) {
          throw new Error(`Failed to update payment: ${updateError.message}`);
        }

        // Update linked lancamento if payment is approved
        if (pagamentos[0].lancamento_id && status === "aprovado") {
          const { error: lancError } = await supabase
            .from("lancamentos")
            .update({
              status: "pago",
              forma_pagamento:
                payment.payment_type_id === "credit_card"
                  ? "cartao_credito"
                  : payment.payment_type_id === "debit_card"
                  ? "cartao_debito"
                  : payment.payment_type_id === "account_money"
                  ? "mercadopago"
                  : payment.payment_type_id || "mercadopago",
            })
            .eq("id", pagamentos[0].lancamento_id);

          if (lancError) {
            throw new Error(`Failed to update lancamento: ${lancError.message}`);
          }
        }
      }

      // Check if this payment is for a registro_pendente (public checkout)
      if (payment.external_reference && payment.status === "approved") {
        const { data: registro } = await supabase
          .from("registros_pendentes")
          .select("*")
          .eq("id", payment.external_reference)
          .eq("status", "aguardando_pagamento")
          .maybeSingle();

        if (registro) {
          console.log("Activating registro_pendente:", registro.id);
          const { error: regError } = await supabase
            .from("registros_pendentes")
            .update({
              status: "pago",
              mp_payment_id: payment.id?.toString(),
            })
            .eq("id", registro.id);

          if (!regError) {
            // Send activation email with invite code AFTER payment approval
            await sendActivationEmail(registro, supabase);
          }
        }

        const { data: assinaturaMp } = await supabase
          .from("assinaturas_mercadopago")
          .select("id, detalhes")
          .contains("detalhes", { checkout_reference: payment.external_reference })
          .maybeSingle();

        if (assinaturaMp) {
          const detalhes = (assinaturaMp.detalhes || {}) as Record<string, unknown>;
          const userId = typeof detalhes.user_id === "string" ? detalhes.user_id : null;
          const planoId = typeof detalhes.plano_id === "string" ? detalhes.plano_id : null;
          const planoSlug = typeof detalhes.plano_slug === "string" ? detalhes.plano_slug : null;

          const { error: assinError } = await supabase
            .from("assinaturas_mercadopago")
            .update({
              status: "ativa",
              detalhes: {
                ...detalhes,
                payment_id: payment.id?.toString() || null,
                payment_status: payment.status,
                payment_type: payment.payment_type_id || null,
              },
            })
            .eq("id", assinaturaMp.id);

          if (assinError) {
            throw new Error(`Failed to update assinatura: ${assinError.message}`);
          }

          if (userId && planoId && planoSlug) {
            const { data: existingPlan } = await supabase
              .from("assinaturas_plano")
              .select("id")
              .eq("user_id", userId)
              .eq("plano_slug", planoSlug)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (existingPlan?.id) {
              const { error: planError } = await supabase
                .from("assinaturas_plano")
                .update({
                  plano_id: planoId,
                  status: "ativa",
                  em_trial: false,
                  trial_fim: null,
                  data_cancelamento: null,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", existingPlan.id);

              if (planError) {
                throw new Error(`Failed to update plan: ${planError.message}`);
              }
            } else {
              const { error: insertError } = await supabase
                .from("assinaturas_plano")
                .insert({
                  user_id: userId,
                  plano_id: planoId,
                  plano_slug: planoSlug,
                  status: "ativa",
                  em_trial: false,
                  data_inicio: new Date().toISOString(),
                });

              if (insertError) {
                throw new Error(`Failed to insert plan: ${insertError.message}`);
              }
            }
          }
        }
      }

      // Successfully processed
      return;
    } catch (error: any) {
      console.error(`Payment processing attempt ${retries + 1} failed:`, error.message);
      retries++;
      if (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
      }
    }
  }

  // All retries exhausted
  console.error(`Failed to process payment ${paymentId} after ${maxRetries} attempts`);
  await supabase
    .from("mercadopago_webhook_logs")
    .update({
      erro_mensagem: `Failed to process payment after ${maxRetries} retries`,
      tentativas: maxRetries,
    })
    .eq("id", logId);
}

async function processSubscriptionNotification(
  preapprovalId: string,
  mpToken: string,
  supabase: any,
  logId: string
) {
  let retries = 0;
  const maxRetries = 3;

  while (retries < maxRetries) {
    try {
      // GET /preapproval/{id} per MP API docs
      const response = await fetch(`${MP_API_BASE}/preapproval/${preapprovalId}`, {
        headers: {
          Authorization: `Bearer ${mpToken}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        console.error(`Erro ao buscar assinatura ${preapprovalId}:`, response.status);
        retries++;
        if (retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
          continue;
        }
        await supabase
          .from("mercadopago_webhook_logs")
          .update({ erro_mensagem: `Failed to fetch subscription after ${maxRetries} retries` })
          .eq("id", logId);
        return;
      }

      const preapproval = await response.json();
      console.log("Assinatura processada:", preapproval.id, preapproval.status, "ref:", preapproval.external_reference);

      const statusMap: Record<string, string> = {
        authorized: "ativa",
        pending: "pendente",
        paused: "pausada",
        cancelled: "cancelada",
      };

      const status = statusMap[preapproval.status] || preapproval.status;

      // Update assinaturas_mercadopago with full preapproval details
      const { data: existingAssinatura } = await supabase
        .from("assinaturas_mercadopago")
        .select("id, detalhes")
        .eq("mp_preapproval_id", preapprovalId)
        .maybeSingle();

      if (existingAssinatura) {
        const detalhes = (existingAssinatura.detalhes || {}) as Record<string, unknown>;
        const { error: updateError } = await supabase
          .from("assinaturas_mercadopago")
          .update({
            status,
            data_inicio: preapproval.date_created,
            detalhes: {
              ...detalhes,
              preapproval_status: preapproval.status,
              preapproval_data: preapproval,
            },
          })
          .eq("id", existingAssinatura.id);

        if (updateError) {
          throw new Error(`Failed to update subscription: ${updateError.message}`);
        }
      } else {
        // Create new record if not found
        const { error: createError } = await supabase
          .from("assinaturas_mercadopago")
          .update({
            status,
            data_inicio: preapproval.date_created,
            detalhes: preapproval,
          })
          .eq("mp_preapproval_id", preapprovalId);

        if (createError) {
          throw new Error(`Failed to create subscription: ${createError.message}`);
        }
      }

      // If subscription is now authorized, handle activation or trial start
      if (preapproval.status === "authorized") {
        console.log("Subscription authorized:", preapprovalId);

        // Find the subscription record
        if (existingAssinatura) {
          const detalhes = (existingAssinatura.detalhes || {}) as Record<string, unknown>;
          const userId = typeof detalhes.user_id === "string" ? detalhes.user_id : null;
          const planoId = typeof detalhes.plano_id === "string" ? detalhes.plano_id : null;
          const planoSlug = typeof detalhes.plano_slug === "string" ? detalhes.plano_slug : null;
          const trialType = typeof detalhes.trial_type === "string" ? detalhes.trial_type : null;
          const trialEnd = typeof detalhes.trial_end === "string" ? detalhes.trial_end : null;

          // Check if this is a trial with payment method
          const isTrialWithPayment = trialType === "with_payment_method" && trialEnd;

          // Activate or update the user's plan subscription
          if (userId && planoId && planoSlug) {
            const { data: existingPlan } = await supabase
              .from("assinaturas_plano")
              .select("id")
              .eq("user_id", userId)
              .eq("plano_slug", planoSlug)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (existingPlan?.id) {
              // Update existing plan subscription
              let updateData: any;
              if (isTrialWithPayment) {
                // Keep trial active until trial_end is reached
                updateData = {
                  plano_id: planoId,
                  status: "trial",
                  em_trial: true,
                  trial_fim: trialEnd,
                  data_cancelamento: null,
                  data_inicio: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                console.log("Trial with payment method activated for user:", userId);
              } else {
                // Regular subscription activation
                updateData = {
                  plano_id: planoId,
                  status: "ativa",
                  em_trial: false,
                  trial_fim: null,
                  data_cancelamento: null,
                  data_inicio: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
              }

              const { error: updateError } = await supabase
                .from("assinaturas_plano")
                .update(updateData)
                .eq("id", existingPlan.id);

              if (updateError) {
                throw new Error(`Failed to update plan: ${updateError.message}`);
              }
            } else {
              // Create new plan subscription
              let insertData: any;
              if (isTrialWithPayment) {
                // Create with trial status
                insertData = {
                  user_id: userId,
                  plano_id: planoId,
                  plano_slug: planoSlug,
                  status: "trial",
                  em_trial: true,
                  trial_fim: trialEnd,
                  data_inicio: new Date().toISOString(),
                };
                console.log("Trial with payment method created for user:", userId);
              } else {
                // Create with active status
                insertData = {
                  user_id: userId,
                  plano_id: planoId,
                  plano_slug: planoSlug,
                  status: "ativa",
                  em_trial: false,
                  data_inicio: new Date().toISOString(),
                };
              }

              const { error: insertError } = await supabase
                .from("assinaturas_plano")
                .insert(insertData);

              if (insertError) {
                throw new Error(`Failed to insert plan: ${insertError.message}`);
              }
            }
            console.log("Plan processed for user:", userId, "Plan:", planoSlug);
          }
        }

        // Also handle registro_pendente if external_reference exists
        if (preapproval.external_reference) {
          const { data: registro } = await supabase
            .from("registros_pendentes")
            .select("*")
            .eq("id", preapproval.external_reference)
            .eq("status", "aguardando_pagamento")
            .maybeSingle();

          if (registro) {
            console.log("Activating registro_pendente from subscription:", registro.id);
            const { error: regError } = await supabase
              .from("registros_pendentes")
              .update({
                status: "pago",
                mp_payment_id: preapproval.id?.toString(),
              })
              .eq("id", registro.id);

            if (!regError) {
              // Send activation email with invite code AFTER subscription approval
              await sendActivationEmail(registro, supabase);
            }
          }
        }
      }

      // Successfully processed
      return;
    } catch (error: any) {
      console.error(`Subscription processing attempt ${retries + 1} failed:`, error.message);
      retries++;
      if (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
      }
    }
  }

  // All retries exhausted
  console.error(`Failed to process subscription ${preapprovalId} after ${maxRetries} attempts`);
  await supabase
    .from("mercadopago_webhook_logs")
    .update({
      erro_mensagem: `Failed to process subscription after ${maxRetries} retries`,
      tentativas: maxRetries,
    })
    .eq("id", logId);
}

// Send activation email with invite code after payment/subscription approval
async function sendActivationEmail(registro: any, supabase: any) {
  const brevoApiKey = Deno.env.get("BREVO_API_KEY");
  if (!brevoApiKey) {
    console.log("BREVO_API_KEY not configured, skipping activation email");
    return;
  }

  try {
    // Get plan details
    const { data: plano } = await supabase
      .from("planos")
      .select("*")
      .eq("id", registro.plano_id)
      .single();

    const appUrl = "https://app.elolab.com.br";
    const activationLink = `${appUrl}/auth?codigo=${registro.codigo_convite}&email=${encodeURIComponent(registro.email)}&plano=${registro.plano_slug}`;
    const planoNome = plano?.nome || registro.plano_slug;
    const planoValor = plano ? Number(plano.valor).toFixed(2) : "0.00";

    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: "EloLab", email: "noreply@elolab.com.br" },
        to: [{ email: registro.email, name: registro.nome }],
        subject: `🎉 Pagamento aprovado! Seu código de ativação do ${planoNome}`,
        htmlContent: `
          <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #1a9a7a, #14b8a6); padding: 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; font-size: 28px; margin: 0;">Pagamento Aprovado! ✅</h1>
              <p style="color: rgba(255,255,255,0.9); font-size: 16px; margin-top: 8px;">Bem-vindo ao EloLab</p>
            </div>
            <div style="padding: 30px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6;">Olá, <strong>${registro.nome}</strong>!</p>
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">Sua assinatura do <strong>${planoNome}</strong> foi confirmada com sucesso. Use o código abaixo para criar sua conta:</p>
              <div style="background: #f0fdf4; border: 2px dashed #1a9a7a; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
                <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Seu código de ativação</p>
                <p style="color: #1a9a7a; font-size: 36px; font-weight: 800; letter-spacing: 4px; margin: 0;">${registro.codigo_convite}</p>
              </div>
              <div style="text-align: center; margin: 24px 0;">
                <a href="${activationLink}" style="display: inline-block; background: linear-gradient(135deg, #1a9a7a, #14b8a6); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Criar Minha Conta →
                </a>
              </div>
              <p style="color: #9ca3af; font-size: 12px; text-align: center;">Este código expira em 7 dias. Sua assinatura de R$ ${planoValor}/mês está ativa.</p>
            </div>
            <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">EloLab — Gestão Inteligente para Clínicas</p>
            </div>
          </div>
        `,
      }),
    });

    console.log("Activation email sent to:", registro.email);
  } catch (error) {
    console.error("Erro ao enviar email de ativação:", error);
  }
}