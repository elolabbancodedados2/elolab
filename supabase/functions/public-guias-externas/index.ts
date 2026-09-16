import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checarRateLimit, clientIp } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-portal-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metodo nao permitido" }, 405);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Rate limit por IP: 30 requisições/minuto é folgado para uso legítimo
    // (recepcionista digita, envia, corrige e reenvia) e barra script abusivo.
    const limitado = await checarRateLimit(supabase, {
      chave: `guias:${clientIp(req)}`,
      limite: 30,
      janelaSegundos: 60,
    });
    if (limitado) return json({ error: "Muitas tentativas — aguarde alguns segundos e tente de novo." }, 429);

    const url = new URL(req.url);
    const body = await req.json();
    const action = url.searchParams.get("action") || body.action || "submit";

    if (action === "validate") {
      const token = body.token || url.searchParams.get("token") || req.headers.get("x-portal-token");
      if (!token) return json({ valid: false, error: "Token ausente" }, 400);
      const { data } = await supabase
        .from("portal_guias_tokens")
        .select("clinica_id, ativo, expires_at, descricao, clinicas:clinica_id(nome)")
        .eq("token", token)
        .maybeSingle();
      if (!data || !data.ativo) return json({ valid: false, error: "Token inválido" }, 401);
      if (data.expires_at && new Date(data.expires_at) <= new Date()) {
        return json({ valid: false, error: "Token expirado" }, 401);
      }
      return json({ valid: true, clinica_nome: (data as any).clinicas?.nome, descricao: data.descricao });
    }

    if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

    const token = body.token || req.headers.get("x-portal-token");
    if (!token) return json({ error: "Token obrigatório" }, 401);

    const { data: tokenRow } = await supabase
      .from("portal_guias_tokens")
      .select("clinica_id, ativo, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (!tokenRow || !tokenRow.ativo) return json({ error: "Token inválido ou inativo" }, 401);
    if (tokenRow.expires_at && new Date(tokenRow.expires_at) <= new Date()) {
      return json({ error: "Token expirado" }, 401);
    }

    if (!body.paciente_nome || !String(body.paciente_nome).trim()) {
      return json({ error: "Nome do paciente é obrigatório" }, 400);
    }
    if (!Array.isArray(body.exames_solicitados) || body.exames_solicitados.length === 0) {
      return json({ error: "Informe ao menos um exame" }, 400);
    }
    if (body.exames_solicitados.length > 50 || body.exames_solicitados.some((ex: unknown) => {
      const nome = ex && typeof ex === "object" ? (ex as Record<string, unknown>).nome : null;
      return typeof nome !== "string" || nome.trim().length === 0 || nome.length > 200;
    })) {
      return json({ error: "A lista de exames é inválida ou excede o limite permitido" }, 400);
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
        exames_solicitados: body.exames_solicitados.map((ex: { nome: string }) => ({ nome: ex.nome.trim() })),
        observacoes: body.observacoes || null,
        // O portal público não faz upload. Nunca aceite um caminho de storage
        // vindo do cliente, pois isso poderia apontar a clínica para outro
        // arquivo quando a guia fosse aberta internamente.
        anexo_url: null,
        anexo_nome: null,
      })
      .select("id")
      .single();

    if (insErr) {
      console.error("Erro ao salvar guia externa:", insErr);
      return json({ error: "Não foi possível receber a guia. Tente novamente mais tarde." }, 500);
    }

    await supabase
      .from("portal_guias_tokens")
      .update({ ultimo_uso: new Date().toISOString() })
      .eq("token", token);

    return json({ success: true, id: inserted.id, message: "Guia recebida com sucesso" });
  } catch (e: any) {
    console.error("Erro public-guias-externas:", e);
    return json({ error: "Não foi possível processar a solicitação. Tente novamente mais tarde." }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
