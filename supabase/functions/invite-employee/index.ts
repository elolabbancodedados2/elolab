import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  medico: "Médico",
  recepcao: "Recepção",
  enfermagem: "Enfermagem",
  financeiro: "Financeiro",
};

const ALLOWED_ROLES = new Set(["admin", "medico", "recepcao", "enfermagem", "financeiro"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const brevoKey = Deno.env.get("BREVO_API_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ success: false, error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const nome = String(body.nome || "").trim();
    const roles: string[] = Array.isArray(body.roles) ? body.roles : [];

    if (!email || !nome || roles.length === 0) {
      return json({ success: false, error: "Campos obrigatórios: email, nome, roles." }, 400);
    }
    if (roles.some((r) => !ALLOWED_ROLES.has(r))) {
      return json({ success: false, error: "Role inválida." }, 400);
    }

    const service = createClient(supabaseUrl, serviceKey);

    // Caller deve ter clinica + role admin
    const { data: profile } = await service
      .from("profiles").select("clinica_id, nome").eq("id", user.id).maybeSingle();
    const clinicaId = (profile as any)?.clinica_id;
    if (!clinicaId) return json({ success: false, error: "Sem clínica associada." }, 403);

    const { data: adminRole } = await service
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!adminRole) return json({ success: false, error: "Apenas admins podem convidar." }, 403);

    // E-mail já em outra clínica?
    const { data: existingProfile } = await service
      .from("profiles").select("clinica_id").eq("email", email).maybeSingle();
    if (existingProfile && (existingProfile as any).clinica_id && (existingProfile as any).clinica_id !== clinicaId) {
      return json({ success: false, error: "E-mail já está vinculado a outra clínica." }, 409);
    }

    // Limites do plano
    const { data: clinica } = await service
      .from("clinicas").select("plano_id, nome").eq("id", clinicaId).maybeSingle();
    let plano: any = null;
    if ((clinica as any)?.plano_id) {
      const { data: p } = await service
        .from("planos")
        .select("nome, max_medicos, max_recepcao, max_funcionarios_total")
        .eq("id", (clinica as any).plano_id).maybeSingle();
      plano = p;
    }

    if (plano) {
      const { count: totalFunc } = await service
        .from("funcionarios").select("id", { count: "exact", head: true }).eq("clinica_id", clinicaId);
      if ((totalFunc ?? 0) >= (plano.max_funcionarios_total ?? 9999)) {
        return json({ success: false, error: `Limite de funcionários do plano ${plano.nome} atingido.` }, 403);
      }
      if (roles.includes("medico")) {
        const { count: medicosCount } = await service
          .from("medicos").select("id", { count: "exact", head: true }).eq("clinica_id", clinicaId).eq("ativo", true);
        if ((medicosCount ?? 0) >= (plano.max_medicos ?? 9999)) {
          return json({ success: false, error: `Limite de médicos do plano ${plano.nome} atingido.` }, 403);
        }
      }
    }

    // Cria convite
    const token = crypto.randomUUID();
    const { error: insertErr } = await service.from("convites_funcionario").insert({
      clinica_id: clinicaId,
      email,
      nome,
      roles,
      token,
      invited_by: user.id,
    });
    if (insertErr) {
      console.error("insert convite", insertErr);
      return json({ success: false, error: "Falha ao criar convite: " + insertErr.message }, 500);
    }

    const inviteUrl = `https://app.elolab.com.br/aceitar-convite?token=${encodeURIComponent(token)}`;
    const rolesDisplay = roles.map((r) => ROLE_LABELS[r] || r).join(", ");
    const clinicaNome = (clinica as any)?.nome || "EloLab";
    const inviterNome = (profile as any)?.nome || "a equipe";

    if (brevoKey) {
      const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f4f5;padding:24px">
        <div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:32px">
          <h2 style="color:#10b981">Você foi convidado para ${clinicaNome}</h2>
          <p>Olá <strong>${nome}</strong>,</p>
          <p>${inviterNome} convidou você para entrar na <strong>${clinicaNome}</strong> com o(s) papel(is): <strong>${rolesDisplay}</strong>.</p>
          <p><a href="${inviteUrl}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Aceitar convite</a></p>
          <p style="color:#666;font-size:12px">Link: ${inviteUrl}<br>Válido por 7 dias.</p>
        </div></body></html>`;
      try {
        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": brevoKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: { name: "EloLab", email: "noreply@elolab.com.br" },
            to: [{ email, name: nome }],
            subject: `Convite para ${clinicaNome}`,
            htmlContent: html,
          }),
        });
      } catch (e) {
        console.error("brevo", e);
      }
    }

    return json({ success: true, token, inviteUrl });
  } catch (e: any) {
    console.error(e);
    return json({ success: false, error: e?.message ?? "Erro" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}