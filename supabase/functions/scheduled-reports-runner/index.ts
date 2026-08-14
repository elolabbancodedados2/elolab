import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cronOrUserOk, cronForbidden } from "../_shared/cronAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DATASET_TABLES: Record<string, { table: string; dateField: string }> = {
  pacientes: { table: "pacientes", dateField: "created_at" },
  agendamentos: { table: "agendamentos", dateField: "data" },
  lancamentos: { table: "lancamentos", dateField: "data" },
  exames: { table: "exames", dateField: "data_solicitacao" },
  prescricoes: { table: "prescricoes", dateField: "data_emissao" },
  atestados: { table: "atestados", dateField: "data_emissao" },
  prontuarios: { table: "prontuarios", dateField: "data" },
  encaminhamentos: { table: "encaminhamentos", dateField: "data_encaminhamento" },
  estoque: { table: "estoque", dateField: "created_at" },
};

function nextRun(freq: string, hora: string, diaSemana?: number, diaMes?: number) {
  const [h, m] = (hora || "08:00").split(":").map(Number);
  const d = new Date();
  d.setSeconds(0); d.setMilliseconds(0);
  d.setHours(h, m);
  if (freq === "diaria") {
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  } else if (freq === "semanal") {
    const dow = diaSemana ?? 1;
    while (d.getDay() !== dow || d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  } else if (freq === "mensal") {
    const dom = diaMes ?? 1;
    d.setDate(dom);
    if (d.getTime() <= Date.now()) d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString();
}

function csvEscape(v: any) {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Sem guarda, qualquer visitante com a chave pública `anon` disparava a
  // geração e o envio de relatórios da clínica.
  if (!cronOrUserOk(req)) return cronForbidden(corsHeaders);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const resendKey = Deno.env.get("RESEND_API_KEY");

    let body: any = {};
    // Corpo vazio é esperado quando o disparo vem do agendador.
    try { body = await req.json(); } catch { /* sem corpo */ }
    const forceId = body?.id || null;

    let q = supabase.from("relatorios_salvos").select("*").eq("ativo", true);
    if (forceId) q = q.eq("id", forceId);
    else q = q.lte("proxima_execucao", new Date().toISOString());
    const { data: relatorios, error } = await q;
    if (error) throw error;

    const out: any[] = [];
    for (const r of relatorios || []) {
      const cfg: any = r.config || {};
      const ds = DATASET_TABLES[r.dataset];
      if (!ds) { out.push({ id: r.id, skipped: "dataset_invalido" }); continue; }

      let query: any = supabase.from(ds.table).select("*").eq("clinica_id", r.clinica_id).limit(cfg.limite || 1000);
      if (cfg.dataInicio) query = query.gte(ds.dateField, cfg.dataInicio);
      if (cfg.dataFim) query = query.lte(ds.dateField, cfg.dataFim);
      query = query.order(ds.dateField, { ascending: false });
      const { data: rows } = await query;

      // Gerar CSV simples
      let csv = "";
      if (rows && rows.length) {
        const cols = cfg.colunas?.length ? cfg.colunas : Object.keys(rows[0]);
        csv = cols.join(",") + "\n";
        for (const row of rows) csv += cols.map((c: string) => csvEscape(row[c])).join(",") + "\n";
      } else {
        csv = "Sem dados no período\n";
      }

      // Enviar e-mail
      if (resendKey && r.destinatarios?.length) {
        const fileName = `${r.nome.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
        const html = `<h2>${r.nome}</h2><p>${r.descricao || ""}</p><p>Registros: <b>${rows?.length || 0}</b></p><p>Relatório anexo (CSV).</p>`;
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "EloLab <noreply@elolab.com.br>",
            to: r.destinatarios,
            subject: `📊 ${r.nome}`,
            html,
            attachments: [{ filename: fileName, content: btoa(unescape(encodeURIComponent(csv))) }],
          }),
        });
      }

      const proxima = r.frequencia
        ? nextRun(r.frequencia, r.hora ?? "08:00", r.dia_semana, r.dia_mes)
        : null;
      await supabase.from("relatorios_salvos").update({
        ultima_execucao: new Date().toISOString(),
        proxima_execucao: proxima,
      }).eq("id", r.id);

      out.push({ id: r.id, rows: rows?.length || 0, sent_to: r.destinatarios?.length || 0 });
    }

    return new Response(JSON.stringify({ processed: out.length, out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});