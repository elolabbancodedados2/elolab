import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cronSecretOk, cronForbidden } from '../_shared/cronAuth.ts';
import { corsPadrao } from '../_shared/cors.ts';

let corsHeaders: Record<string, string> = {};

serve(async (req) => {
  corsHeaders = corsPadrao(req);
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

    // Trial com cartão: avisar dentro das últimas 24 horas e deduplicar por
    // assinatura, mesmo quando o cron executa mais de uma vez nesse intervalo.
    const trialWindowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const { data: trialsEndingSoon, error: trialsError } = await supabase
      .from("assinaturas_plano")
      .select("id, user_id, plano_slug, trial_fim")
      .eq("status", "trial")
      .gt("trial_fim", now.toISOString())
      .lte("trial_fim", trialWindowEnd.toISOString());
    if (trialsError) throw trialsError;
    for (const sub of trialsEndingSoon || []) {
      const { data: alreadyQueued, error: dedupeError } = await supabase
        .from("notification_queue")
        .select("id")
        .eq("destinatario_id", sub.user_id)
        .contains("dados_extras", { tipo_lembrete: "trial_ends_soon", assinatura_id: sub.id })
        .limit(1)
        .maybeSingle();
      if (dedupeError) throw dedupeError;
      if (alreadyQueued) continue;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("email, nome")
        .eq("id", sub.user_id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile?.email) continue;
      const endsAt = new Date(sub.trial_fim).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
      notifications.push({
        tipo: "email",
        assunto: "Seu teste EloLab termina em menos de 24 horas",
        conteudo: `Olá ${profile.nome || ""},\n\nSeu teste gratuito do plano ${sub.plano_slug} termina em ${endsAt}. A partir desse horário, o Mercado Pago fará a cobrança recorrente autorizada de acordo com o plano escolhido. Se não quiser continuar, cancele em Planos antes do fim do teste.\n\nEquipe EloLab`,
        destinatario_email: profile.email,
        destinatario_nome: profile.nome,
        destinatario_id: sub.user_id,
        status: "pendente",
        dados_extras: { tipo_lembrete: "trial_ends_soon", assinatura_id: sub.id, plano: sub.plano_slug, trial_fim: sub.trial_fim },
      });
      remindersCount++;
    }

    // Process expiring tomorrow - send reminder
    if (expiringTomorrow) {
      for (const sub of expiringTomorrow) {
        // Trials recebem o aviso específico das últimas 24 horas abaixo.
        if (sub.trial_fim && new Date(sub.trial_fim).getTime() > now.getTime()) continue;
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
      detalhes: { expiring_tomorrow: expiringTomorrow?.length || 0, trials_ending_soon: trialsEndingSoon?.length || 0, expired: expired?.length || 0 },
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
