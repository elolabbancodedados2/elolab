import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL");
    const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY");

    let body: any = {};
    try { body = await req.json(); } catch { /* GET via cron */ }
    const dryRun = body?.dry_run === true;
    const filterClinicaId = body?.clinica_id || null;

    // Buscar lançamentos receita vencidos e pendentes
    const hoje = new Date().toISOString().slice(0, 10);
    let query = supabase
      .from("lancamentos")
      .select("id, descricao, valor, data_vencimento, paciente_id, clinica_id, pacientes(nome, telefone)")
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
        if (!pac?.telefone) {
          results.push({ id: l.id, sent: false, reason: "sem_telefone" });
          continue;
        }
        const diasAtraso = Math.max(
          1,
          Math.floor((Date.now() - new Date(l.data_vencimento).getTime()) / 86400000)
        );
        const valorFmt = Number(l.valor || 0).toLocaleString("pt-BR", {
          style: "currency", currency: "BRL",
        });
        const msg = `Olá, ${pac.nome}! 👋\n\nIdentificamos que você possui um pagamento em aberto:\n\n• ${l.descricao || "Atendimento"}\n• Valor: ${valorFmt}\n• Vencimento: ${new Date(l.data_vencimento).toLocaleDateString("pt-BR")}\n• Dias em atraso: ${diasAtraso}\n\nPara regularizar, entre em contato com a clínica. Caso já tenha pago, desconsidere esta mensagem. 💙`;

        if (dryRun || !instance || !evolutionApiUrl || !evolutionApiKey) {
          results.push({ id: l.id, sent: false, preview: msg, reason: dryRun ? "dry_run" : "sem_instancia" });
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