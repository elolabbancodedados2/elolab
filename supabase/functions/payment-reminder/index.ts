import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cronSecretOk, cronForbidden } from '../_shared/cronAuth.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Só o agendador (pg_cron) pode disparar esta rotina.
  if (!cronSecretOk(req)) return cronForbidden(corsHeaders);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();

    // 1. Find subscriptions expiring in 1 day (reminder before expiry)
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const { data: expiringTomorrow } = await supabase
      .from("assinaturas_plano")
      .select("user_id, plano_slug, trial_fim, data_fim")
      .in("status", ["trial", "ativa"])
      .or(`trial_fim.gte.${tomorrowStr}T00:00:00,data_fim.gte.${tomorrowStr}T00:00:00`)
      .or(`trial_fim.lt.${tomorrowStr}T23:59:59,data_fim.lt.${tomorrowStr}T23:59:59`);

    let remindersCount = 0;

    // 2. Find expired subscriptions (send overdue notices)
    const { data: expired } = await supabase
      .from("assinaturas_plano")
      .select("user_id, plano_slug, trial_fim, data_fim, updated_at")
      .eq("status", "expirada");

    const notifications: any[] = [];

    // Process expiring tomorrow - send reminder
    if (expiringTomorrow) {
      for (const sub of expiringTomorrow) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, nome")
          .eq("id", sub.user_id)
          .single();

        if (profile?.email) {
          notifications.push({
            tipo: "email",
            assunto: "⚠️ Sua assinatura EloLab expira amanhã!",
            conteudo: `Olá ${profile.nome || ""},\n\nSua assinatura do plano ${sub.plano_slug} expira amanhã. Renove agora para não perder o acesso ao sistema.\n\nApós 2 dias sem pagamento, o acesso será bloqueado automaticamente.\n\nEquipe EloLab`,
            destinatario_email: profile.email,
            destinatario_nome: profile.nome,
            destinatario_id: sub.user_id,
            status: "pendente",
            dados_extras: JSON.stringify({ tipo_lembrete: "expira_amanha", plano: sub.plano_slug }),
          });
          remindersCount++;
        }
      }
    }

    // Process expired - send overdue notice
    if (expired) {
      for (const sub of expired) {
        const expDate = sub.trial_fim || sub.data_fim;
        if (!expDate) continue;

        const daysSince = Math.floor((now.getTime() - new Date(expDate).getTime()) / (1000 * 60 * 60 * 24));

        // Send at day 0 (just expired), day 1, and day 2 (last chance before block)
        if (daysSince >= 0 && daysSince <= 2) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("email, nome")
            .eq("id", sub.user_id)
            .single();

          if (profile?.email) {
            const urgency = daysSince === 2
              ? "🚨 ÚLTIMO AVISO: Seu acesso será bloqueado HOJE!"
              : daysSince === 1
              ? "⚠️ Sua assinatura expirou - acesso será bloqueado amanhã"
              : "⏰ Sua assinatura EloLab expirou";

            const bodyText = daysSince === 2
              ? `Olá ${profile.nome || ""},\n\nEste é o último aviso. Sua assinatura expirou há 2 dias e o acesso ao sistema será BLOQUEADO automaticamente.\n\nRenove imediatamente para evitar a interrupção do serviço.\n\nSeus dados estão seguros e serão mantidos.\n\nEquipe EloLab`
              : daysSince === 1
              ? `Olá ${profile.nome || ""},\n\nSua assinatura expirou ontem. Você tem mais 1 dia para regularizar antes do bloqueio automático.\n\nRenove agora para continuar usando o EloLab sem interrupção.\n\nEquipe EloLab`
              : `Olá ${profile.nome || ""},\n\nSua assinatura do plano ${sub.plano_slug} expirou. Renove para continuar acessando o sistema.\n\nApós 2 dias, o acesso será bloqueado automaticamente.\n\nEquipe EloLab`;

            notifications.push({
              tipo: "email",
              assunto: urgency,
              conteudo: bodyText,
              destinatario_email: profile.email,
              destinatario_nome: profile.nome,
              destinatario_id: sub.user_id,
              status: "pendente",
              dados_extras: JSON.stringify({ tipo_lembrete: `expirado_dia_${daysSince}`, plano: sub.plano_slug }),
            });
            remindersCount++;
          }
        }
      }
    }

    // Insert all notifications
    if (notifications.length > 0) {
      const { error: insertError } = await supabase
        .from("notification_queue")
        .insert(notifications);

      if (insertError) {
        console.error("Error inserting notifications:", insertError);
      }
    }

    // Log execution
    await supabase.from("automation_logs").insert({
      tipo: "cobranca",
      nome: "Lembretes de Pagamento",
      status: "sucesso",
      registros_processados: remindersCount,
      registros_sucesso: remindersCount,
      detalhes: { expiring_tomorrow: expiringTomorrow?.length || 0, expired: expired?.length || 0 },
    });

    console.info(`Payment reminders sent: ${remindersCount}`);

    return new Response(
      JSON.stringify({ success: true, reminders_sent: remindersCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Payment reminder error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});