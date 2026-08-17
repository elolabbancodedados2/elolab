import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cronOrUserOk, cronForbidden, clinicaDoChamador } from "../_shared/cronAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Esta função não tinha guarda NENHUMA. A chave `anon` é pública — está no
  // JavaScript entregue a todo visitante — então qualquer pessoa disparava a
  // régua de cobrança da clínica, e a RESPOSTA devolvia nome de paciente e
  // valor em aberto para quem chamou. Verificado em produção.
  if (!cronOrUserOk(req)) return cronForbidden(corsHeaders);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const evolutionApiUrl = (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/+$/, "");
    const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY");

    let body: any = {};
    try { body = await req.json(); } catch { /* GET via cron */ }
    const dryRun = body?.dry_run === true;
    // A clínica vem do JWT de quem chamou, nunca do corpo: aceitar
    // `body.clinica_id` deixava um usuário disparar cobrança de outra clínica.
    // Quando é o cron (sem usuário), segue processando todas.
    const clinicaDoUsuario = await clinicaDoChamador(req, supabase);
    const filterClinicaId = clinicaDoUsuario;

    // Buscar lançamentos receita vencidos e pendentes
    const hoje = new Date().toISOString().slice(0, 10);
    let query = supabase
      .from("lancamentos")
      .select("id, descricao, valor, data_vencimento, paciente_id, clinica_id, pacientes(nome, telefone, email)")
      .eq("tipo", "receita")
      .eq("status", "pendente")
      .lt("data_vencimento", hoje)
      .not("paciente_id", "is", null)
      .limit(500);
    if (filterClinicaId) query = query.eq("clinica_id", filterClinicaId);

    const { data: pendentes, error } = await query;
    if (error) throw error;

    const results: any[] = [];
    const byClinica: Record<string, any[]> = {};
    for (const l of pendentes || []) {
      const cid = (l as any).clinica_id || "_";
      (byClinica[cid] ||= []).push(l);
    }

    for (const [clinicaId, items] of Object.entries(byClinica)) {
      // Pegar instância ativa da clínica
      const { data: sess } = await supabase
        .from("whatsapp_sessions")
        .select("instance_name")
        .eq("status", "connected")
        .eq("clinica_id", clinicaId)
        .limit(1)
        .maybeSingle();
      const instance = sess?.instance_name;

      for (const l of items) {
        const pac: any = (l as any).pacientes;
        const diasAtraso = Math.max(
          1,
          Math.floor((Date.now() - new Date(l.data_vencimento).getTime()) / 86400000)
        );
        // Régua progressiva: evita cobrar a mesma pessoa todos os dias.
        if (![1, 3, 7, 15, 30].includes(diasAtraso) && diasAtraso % 30 !== 0) {
          results.push({ id: l.id, sent: false, reason: "fora_da_regua" });
          continue;
        }
        const { data: jaEnviado } = await supabase.from("notification_queue").select("id")
          .eq("clinica_id", clinicaId)
          .contains("dados_extras", { tipo_notificacao: "cobranca_inadimplente", lancamento_id: l.id, dias_atraso: diasAtraso })
          .limit(1);
        if (jaEnviado?.length) {
          results.push({ id: l.id, sent: false, reason: "ja_enviado" });
          continue;
        }
        const valorFmt = Number(l.valor || 0).toLocaleString("pt-BR", {
          style: "currency", currency: "BRL",
        });
        const msg = `Olá, ${pac.nome}! 👋\n\nIdentificamos que você possui um pagamento em aberto:\n\n• ${l.descricao || "Atendimento"}\n• Valor: ${valorFmt}\n• Vencimento: ${new Date(l.data_vencimento).toLocaleDateString("pt-BR")}\n• Dias em atraso: ${diasAtraso}\n\nPara regularizar, entre em contato com a clínica. Caso já tenha pago, desconsidere esta mensagem. 💙`;

        if (dryRun) {
          results.push({ id: l.id, sent: false, preview: msg, reason: "dry_run" });
          continue;
        }

        // Sem WhatsApp, o e-mail entra na mesma fila de entrega/retry.
        if (!pac?.telefone || !instance || !evolutionApiUrl || !evolutionApiKey) {
          if (pac?.email) {
            await supabase.from("notification_queue").insert({ tipo: "email", clinica_id: clinicaId,
              destinatario_id: l.paciente_id, destinatario_email: pac.email, destinatario_nome: pac.nome,
              assunto: `Pagamento em aberto há ${diasAtraso} dia(s)`, conteudo: msg, status: "pendente",
              dados_extras: { tipo_notificacao: "cobranca_inadimplente", lancamento_id: l.id, dias_atraso: diasAtraso } });
            results.push({ id: l.id, sent: true, channel: "email_queue" });
          } else results.push({ id: l.id, sent: false, reason: "sem_contato" });
          continue;
        }

        try {
          const tel = pac.telefone.replace(/\D/g, "");
          const fmt = tel.startsWith("55") ? tel : `55${tel}`;
          const r = await fetch(`${evolutionApiUrl}/message/sendText/${instance}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evolutionApiKey },
            body: JSON.stringify({ number: fmt, text: msg }),
          });
          const ok = r.ok;
          if (ok) await supabase.from("notification_queue").insert({ tipo: "whatsapp", clinica_id: clinicaId,
            destinatario_id: l.paciente_id, destinatario_telefone: pac.telefone, destinatario_nome: pac.nome,
            assunto: "Pagamento em aberto", conteudo: msg, status: "enviado", enviado_em: new Date().toISOString(),
            dados_extras: { tipo_notificacao: "cobranca_inadimplente", lancamento_id: l.id, dias_atraso: diasAtraso } });
          await supabase.from("automation_logs").insert({
            tipo: "cobranca_whatsapp",
            nome: "Cobrança inadimplente",
            status: ok ? "sucesso" : "erro",
            registros_processados: 1,
            registros_sucesso: ok ? 1 : 0,
            detalhes: { lancamento_id: l.id, paciente_id: l.paciente_id, dias_atraso: diasAtraso },
          });
          results.push({ id: l.id, sent: ok });
        } catch (err) {
          results.push({ id: l.id, sent: false, error: String(err) });
        }
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
