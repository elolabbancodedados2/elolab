import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cronSecretOk, cronForbidden } from '../_shared/cronAuth.ts';
import { corsPadrao } from '../_shared/cors.ts';
import { getOverdueRecurringInvoiceIds, prepaidReminderMilestone } from '../_shared/platformPlanDelinquency.ts';

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
      .select("id, user_id, plano_slug, trial_fim, data_fim, cobranca_modalidade")
      .in("status", ["trial", "ativa"])
      .or(`trial_fim.gte.${tomorrowStr}T00:00:00,data_fim.gte.${tomorrowStr}T00:00:00`)
      .or(`trial_fim.lt.${tomorrowStr}T23:59:59,data_fim.lt.${tomorrowStr}T23:59:59`);

    let remindersCount = 0;

    // 2. Find expired subscriptions (send overdue notices)
    const { data: expired } = await supabase
      .from("assinaturas_plano")
      .select("id, user_id, plano_slug, trial_fim, data_fim, updated_at, cobranca_modalidade")
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

        const reminderDetails = {
          tipo_lembrete: sub.cobranca_modalidade === 'pre_pago' ? 'prepaid_period_ends_soon' : 'plan_period_ends_soon',
          assinatura_id: sub.id,
          termina_em: sub.data_fim,
        };
        const { data: alreadyQueued, error: dedupeError } = await supabase
          .from('notification_queue')
          .select('id')
          .eq('destinatario_id', sub.user_id)
          .contains('dados_extras', reminderDetails)
          .limit(1)
          .maybeSingle();
        if (dedupeError) throw dedupeError;

        if (profile?.email && !alreadyQueued) {
          const accessNotice = sub.cobranca_modalidade === 'pre_pago'
            ? 'Após 7 dias do vencimento, novos registros serão bloqueados; consulta e exportação continuam disponíveis.'
            : 'Regularize o pagamento para manter o acesso ao plano.';
          notifications.push({
            tipo: "email",
            assunto: "⚠️ Sua assinatura EloLab expira amanhã!",
            conteudo: `Olá ${profile.nome || ""},\n\nO período do plano ${sub.plano_slug} termina amanhã. ${accessNotice}\n\nRegularize em Planos para evitar interrupção.\n\nEquipe EloLab`,
            destinatario_email: profile.email,
            destinatario_nome: profile.nome,
            destinatario_id: sub.user_id,
            status: "pendente",
            dados_extras: reminderDetails,
          });
          remindersCount++;
        }
      }
    }

    // Notify once for each recurring invoice still unpaid after 72 hours.
    const { data: recurringPlans, error: recurringPlansError } = await supabase
      .from('assinaturas_plano')
      .select('id, user_id, plano_slug, mp_assinatura_id')
      .eq('cobranca_modalidade', 'recorrente')
      .in('status', ['ativa', 'trial'])
      .not('mp_assinatura_id', 'is', null);
    if (recurringPlansError) throw recurringPlansError;

    for (const sub of recurringPlans || []) {
      const { data: invoices, error: invoicesError } = await supabase
        .from('platform_subscription_invoices')
        .select('id, mp_preapproval_id, payment_status, debit_date, date_created')
        .eq('assinatura_mp_id', sub.mp_assinatura_id)
        .order('date_created', { ascending: false })
        .limit(100);
      if (invoicesError) throw invoicesError;

      const overdueInvoiceId = getOverdueRecurringInvoiceIds(invoices || [])[0];
      if (!overdueInvoiceId) continue;

      const reminderDetails = {
        tipo_lembrete: 'recurring_invoice_unpaid_72h',
        assinatura_id: sub.id,
        fatura_id: overdueInvoiceId,
      };
      const { data: alreadyQueued, error: dedupeError } = await supabase
        .from('notification_queue')
        .select('id')
        .eq('destinatario_id', sub.user_id)
        .contains('dados_extras', reminderDetails)
        .limit(1)
        .maybeSingle();
      if (dedupeError) throw dedupeError;
      if (alreadyQueued) continue;

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('email, nome')
        .eq('id', sub.user_id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile?.email) continue;

      notifications.push({
        tipo: 'email',
        assunto: 'A cobrança do seu plano EloLab está pendente',
        conteudo: `Olá ${profile.nome || ''},\n\nNão identificamos o pagamento da fatura recorrente do plano ${sub.plano_slug} após 3 dias do vencimento. O acesso para novos registros está suspenso até a confirmação do pagamento. Seus dados continuam disponíveis para consulta e exportação.\n\nAtualize ou regularize a cobrança em Planos. Se você já pagou, aguarde a confirmação do Mercado Pago.\n\nEquipe EloLab`,
        destinatario_email: profile.email,
        destinatario_nome: profile.nome,
        destinatario_id: sub.user_id,
        status: 'pendente',
        dados_extras: reminderDetails,
      });
      remindersCount++;
    }

    // Process expired - send overdue notice
    if (expired) {
      for (const sub of expired) {
        const expDate = sub.trial_fim || sub.data_fim;
        if (!expDate) continue;

        const daysSince = Math.floor((now.getTime() - new Date(expDate).getTime()) / (1000 * 60 * 60 * 24));
        const reminderType = prepaidReminderMilestone(daysSince);
        if (!reminderType) continue;
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, nome")
          .eq("id", sub.user_id)
          .single();

        const reminderDetails = { tipo_lembrete: reminderType, assinatura_id: sub.id, plano: sub.plano_slug };
        const { data: alreadyQueued, error: dedupeError } = await supabase
          .from('notification_queue')
          .select('id')
          .eq('destinatario_id', sub.user_id)
          .contains('dados_extras', reminderDetails)
          .limit(1)
          .maybeSingle();
        if (dedupeError) throw dedupeError;

        if (profile?.email && !alreadyQueued) {
          const urgency = daysSince === 6
            ? "🚨 Último aviso: falta 1 dia para o bloqueio de escrita"
            : daysSince === 3
              ? "⚠️ Sua assinatura expirou há 3 dias"
              : "⏰ Sua assinatura EloLab expirou";

          const bodyText = daysSince === 6
            ? `Olá ${profile.nome || ""},\n\nEste é o último aviso antes do bloqueio de escrita. O período do plano ${sub.plano_slug} terminou há 6 dias. Após 7 dias, novos registros serão bloqueados; consulta e exportação continuam disponíveis.\n\nRegularize em Planos para manter o acesso normal.\n\nEquipe EloLab`
            : `Olá ${profile.nome || ""},\n\nO período do plano ${sub.plano_slug} terminou há ${daysSince} dia(s). Regularize em Planos. Após 7 dias do vencimento, novos registros serão bloqueados; consulta e exportação continuam disponíveis.\n\nEquipe EloLab`;

          notifications.push({
            tipo: "email",
            assunto: urgency,
            conteudo: bodyText,
            destinatario_email: profile.email,
            destinatario_nome: profile.nome,
            destinatario_id: sub.user_id,
            status: "pendente",
            dados_extras: reminderDetails,
          });
          remindersCount++;
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
