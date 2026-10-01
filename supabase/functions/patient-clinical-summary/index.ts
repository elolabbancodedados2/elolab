import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPadrao } from '../_shared/cors.ts';

// Atribuído em cada request (reflete a origem permitida). Helpers
// top-level (json/reply) capturam esta variável por closure.
let corsHeaders: Record<string, string> = {};

;

Deno.serve(async (req) => {
  corsHeaders = { ...corsPadrao(req),};
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Método não permitido" }), {
        status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { paciente_id } = await req.json();
    if (!paciente_id) {
      return new Response(JSON.stringify({ error: "paciente_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("clinica_id").eq("id", user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id),
    ]);
    const clinicaId = (profile as { clinica_id?: string | null } | null)?.clinica_id;
    const podeAcessar = (roles || []).some((role: { role: string }) => ["admin", "medico"].includes(role.role));
    if (!clinicaId || !podeAcessar) {
      return new Response(JSON.stringify({ error: "Acesso não autorizado" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Coletar dados clínicos
    const [pac, pront, presc, exam, atest, comorb] = await Promise.all([
      supabase.from("pacientes").select("nome, data_nascimento, sexo, alergias, observacoes").eq("id", paciente_id).eq("clinica_id", clinicaId).maybeSingle(),
      supabase.from("prontuarios").select("data, queixa_principal, hipotese_diagnostica, conduta").eq("paciente_id", paciente_id).eq("clinica_id", clinicaId).order("data", { ascending: false }).limit(20),
      supabase.from("prescricoes").select("data_emissao, medicamento, dosagem, posologia").eq("paciente_id", paciente_id).eq("clinica_id", clinicaId).order("data_emissao", { ascending: false }).limit(20),
      supabase.from("exames").select("data_solicitacao, tipo_exame, resultado, status").eq("paciente_id", paciente_id).eq("clinica_id", clinicaId).order("data_solicitacao", { ascending: false }).limit(20),
      supabase.from("atestados").select("data_emissao, motivo, dias").eq("paciente_id", paciente_id).eq("clinica_id", clinicaId).order("data_emissao", { ascending: false }).limit(10),
      (supabase as any).from("paciente_comorbidades").select("codigo_cid, descricao, ativo").eq("paciente_id", paciente_id).eq("clinica_id", clinicaId),
    ]);

    if (!pac.data) {
      return new Response(JSON.stringify({ error: "Paciente não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ctx = {
      paciente: pac.data,
      consultas: pront.data,
      prescricoes: presc.data,
      exames: exam.data,
      atestados: atest.data,
      comorbidades: comorb.data,
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você é um assistente médico. Gere um resumo clínico estruturado em pt-BR a partir dos dados fornecidos. Use seções: 1) Identificação, 2) Comorbidades e alergias, 3) Histórico recente de consultas, 4) Medicações em uso, 5) Exames relevantes, 6) Pontos de atenção / recomendações. Seja objetivo, em markdown, sem inventar dados.",
          },
          { role: "user", content: "Dados do paciente:\n" + JSON.stringify(ctx, null, 2) },
        ],
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      return new Response(JSON.stringify({ error: "Falha IA", detail: t }), {
        status: aiResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const summary = data.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
