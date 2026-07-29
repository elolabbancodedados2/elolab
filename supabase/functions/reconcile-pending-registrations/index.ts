// Reconciliação diária: reenvia código de ativação para registros pagos há +24h
// que ainda não viraram conta (user_id NULL). Também expira registros vencidos.
import { createClient } from "npm:@supabase/supabase-js@2";
import { cronSecretOk, cronForbidden } from "../_shared/cronAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Só o agendador. Antes a chave anon, que é pública, bastava para disparar.
  if (!cronSecretOk(req)) return cronForbidden(corsHeaders);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const brevoApiKey = Deno.env.get("BREVO_API_KEY");
  const now = new Date();
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  let resent = 0;
  let expired = 0;

  // 1. Marcar como expirados registros pendentes vencidos (>7d)
  const { data: expirados } = await supabase
    .from("registros_pendentes")
    .update({ status: "expirado" })
    .lt("expires_at", now.toISOString())
    .in("status", ["pendente", "aguardando_pagamento"])
    .select("id");
  expired = expirados?.length ?? 0;

  // 2. Buscar pagos órfãos (>24h sem cadastro)
  const { data: orfaos, error } = await supabase
    .from("registros_pendentes")
    .select("id, nome, email, codigo_convite, plano_id, plano_slug, reminder_count, updated_at")
    .eq("status", "pago")
    .is("user_id", null)
    .lt("updated_at", cutoff24h)
    .lt("reminder_count", 3);

  if (error) {
    console.error("Erro ao buscar órfãos:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  for (const reg of orfaos ?? []) {
    if (!brevoApiKey) break;
    try {
      const { data: plano } = await supabase
        .from("planos").select("nome, valor").eq("id", reg.plano_id).maybeSingle();
      const planoNome = plano?.nome ?? reg.plano_slug;
      const link = `https://app.elolab.com.br/auth?codigo=${reg.codigo_convite}&email=${encodeURIComponent(reg.email)}&plano=${reg.plano_slug}`;

      const r = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": brevoApiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          sender: { name: "EloLab", email: "noreply@elolab.com.br" },
          to: [{ email: reg.email, name: reg.nome }],
          subject: `⏰ Lembrete: ative sua assinatura ${planoNome}`,
          htmlContent: `
            <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #1a9a7a, #14b8a6); padding: 32px; text-align: center; border-radius: 12px 12px 0 0;">
                <h1 style="color: #fff; margin: 0;">Sua conta está esperando ⏰</h1>
              </div>
              <div style="padding: 30px; background: #fff; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
                <p>Olá, <strong>${reg.nome}</strong>!</p>
                <p>Notamos que seu pagamento do <strong>${planoNome}</strong> foi confirmado, mas a conta ainda não foi criada.</p>
                <div style="background: #f0fdf4; border: 2px dashed #1a9a7a; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
                  <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Seu código</p>
                  <p style="color: #1a9a7a; font-size: 36px; font-weight: 800; letter-spacing: 4px; margin: 0;">${reg.codigo_convite}</p>
                </div>
                <div style="text-align: center; margin: 24px 0;">
                  <a href="${link}" style="display: inline-block; background: #1a9a7a; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600;">Ativar minha conta →</a>
                </div>
                <p style="color: #9ca3af; font-size: 12px; text-align: center;">Precisa de ajuda? Responda este email.</p>
              </div>
            </div>`,
        }),
      });
      if (r.ok) {
        resent++;
        await supabase
          .from("registros_pendentes")
          .update({ reminder_count: (reg.reminder_count ?? 0) + 1, updated_at: now.toISOString() })
          .eq("id", reg.id);
      } else {
        console.error("Brevo erro:", r.status, await r.text());
      }
    } catch (e) {
      console.error("Falha reenvio", reg.id, e);
    }
  }

  return new Response(
    JSON.stringify({ success: true, resent, expired, checked: orfaos?.length ?? 0 }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});