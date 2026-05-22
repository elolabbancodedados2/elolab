import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-portal-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "submit";

    if (action === "validate") {
      const token = url.searchParams.get("token") || req.headers.get("x-portal-token");
      if (!token) return json({ valid: false, error: "Token ausente" }, 400);
      const { data } = await supabase
        .from("portal_guias_tokens")
        .select("clinica_id, ativo, descricao, clinicas:clinica_id(nome)")
        .eq("token", token)
        .maybeSingle();
      if (!data || !data.ativo) return json({ valid: false, error: "Token inválido" }, 401);
      return json({ valid: true, clinica_nome: (data as any).clinicas?.nome, descricao: data.descricao });
    }

    if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

    const body = await req.json();
    const token = body.token || req.headers.get("x-portal-token");
    if (!token) return json({ error: "Token obrigatório" }, 401);

    const { data: tokenRow } = await supabase
      .from("portal_guias_tokens")
      .select("clinica_id, ativo")
      .eq("token", token)
      .maybeSingle();

    if (!tokenRow || !tokenRow.ativo) return json({ error: "Token inválido ou inativo" }, 401);

    if (!body.paciente_nome || !String(body.paciente_nome).trim()) {
      return json({ error: "Nome do paciente é obrigatório" }, 400);
    }
    if (!Array.isArray(body.exames_solicitados) || body.exames_solicitados.length === 0) {
      return json({ error: "Informe ao menos um exame" }, 400);
    }

    const { data: inserted, error: insErr } = await supabase
      .from("guias_externas")
      .insert({
        clinica_id: tokenRow.clinica_id,
        origem: "portal",
        status: "recebida",
        paciente_nome: String(body.paciente_nome).trim(),
        paciente_cpf: body.paciente_cpf || null,
        paciente_nascimento: body.paciente_nascimento || null,
        paciente_telefone: body.paciente_telefone || null,
        paciente_email: body.paciente_email || null,
        paciente_sexo: body.paciente_sexo || null,
        medico_externo_nome: body.medico_externo_nome || null,
        medico_externo_crm: body.medico_externo_crm || null,
        medico_externo_uf: body.medico_externo_uf || null,
        medico_externo_especialidade: body.medico_externo_especialidade || null,
        medico_externo_contato: body.medico_externo_contato || null,
        convenio_nome: body.convenio_nome || null,
        numero_autorizacao: body.numero_autorizacao || null,
        validade_autorizacao: body.validade_autorizacao || null,
        exames_solicitados: body.exames_solicitados,
        observacoes: body.observacoes || null,
        anexo_url: body.anexo_url || null,
        anexo_nome: body.anexo_nome || null,
      })
      .select("id")
      .single();

    if (insErr) {
      console.error("Erro ao salvar guia externa:", insErr);
      return json({ error: insErr.message }, 500);
    }

    await supabase
      .from("portal_guias_tokens")
      .update({ ultimo_uso: new Date().toISOString() })
      .eq("token", token);

    return json({ success: true, id: inserted.id, message: "Guia recebida com sucesso" });
  } catch (e: any) {
    console.error("Erro public-guias-externas:", e);
    return json({ error: e.message || "Erro interno" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}