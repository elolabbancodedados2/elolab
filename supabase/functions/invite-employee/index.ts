import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { usuariosNoLimite, validarLimitesDeEquipe } from "../_shared/limitesClinica.ts";
import { corsPadrao } from '../_shared/cors.ts';
import { sendBrandedBrevoRequest } from '../_shared/brevoEmail.ts';

// Atribuído em cada request (reflete a origem permitida). Helpers
// top-level (json/reply) capturam esta variável por closure.
let corsHeaders: Record<string, string> = {};

;

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  medico: "Médico",
  recepcao: "Recepção",
  enfermagem: "Enfermagem",
  financeiro: "Financeiro",
};

const ALLOWED_ROLES = new Set(["admin", "medico", "recepcao", "enfermagem", "financeiro"]);

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (character) => entities[character] || character);
}

Deno.serve(async (req) => {
  corsHeaders = { ...corsPadrao(req),};
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
    const { data: profile, error: profileError } = await service
      .from("profiles").select("clinica_id, nome").eq("id", user.id).maybeSingle();
    if (profileError) throw new Error("Não foi possível validar a clínica da conta.");
    const clinicaId = (profile as any)?.clinica_id;
    if (!clinicaId) return json({ success: false, error: "Sem clínica associada." }, 403);

    const { data: adminRole, error: roleError } = await service
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (roleError) throw new Error("Não foi possível validar as permissões da conta.");
    if (!adminRole) return json({ success: false, error: "Apenas admins podem convidar." }, 403);

    // E-mail já em outra clínica?
    const { data: existingProfile, error: existingProfileError } = await service
      .from("profiles").select("clinica_id").eq("email", email).maybeSingle();
    if (existingProfileError) throw new Error("Não foi possível verificar o e-mail informado.");
    if (existingProfile && (existingProfile as any).clinica_id && (existingProfile as any).clinica_id !== clinicaId) {
      return json({ success: false, error: "E-mail já está vinculado a outra clínica." }, 409);
    }

    const { data: clinica, error: clinicaError } = await service
      .from("clinicas").select("nome").eq("id", clinicaId).maybeSingle();
    if (clinicaError || !clinica) throw new Error("Não foi possível validar o plano da clínica.");
    const erroLimitePlano = await validarLimitesDeEquipe(service, clinicaId, roles);
    if (erroLimitePlano) return json({ success: false, error: erroLimitePlano }, 403);

    // Limite de usuários definido pela plataforma (Limites e Consumo).
    const cotaUsuarios = await usuariosNoLimite(service, clinicaId);
    if (cotaUsuarios.atingido) {
      return json({ success: false, error: `A clínica atingiu o limite de ${cotaUsuarios.limite} assentos contabilizados. Fale com o suporte para revisar as contas consideradas ou solicitar ampliação do limite.` }, 403);
    }

    // Cria convite
    const token = crypto.randomUUID();
    const { error: insertErr } = await service.rpc("create_employee_invitation", {
      _clinica_id: clinicaId,
      _email: email,
      _nome: nome,
      _roles: roles,
      _token: token,
      _invited_by: user.id,
    });
    if (insertErr) {
      console.error("insert convite", insertErr);
      return json({ success: false, error: "Falha ao criar convite: " + insertErr.message }, 500);
    }

    const inviteUrl = `https://app.elolab.com.br/aceitar-convite?token=${encodeURIComponent(token)}`;
    const rolesDisplay = roles.map((r) => ROLE_LABELS[r] || r).join(", ");
    const clinicaNome = (clinica as any)?.nome || "EloLab";
    const inviterNome = (profile as any)?.nome || "a equipe";

    let emailStatus: "sent" | "not_configured" | "failed" = "not_configured";
    if (brevoKey) {
      const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f4f5;padding:24px">
        <div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:32px">
          <h2 style="color:#10b981">Você foi convidado para ${escapeHtml(clinicaNome)}</h2>
          <p>Olá <strong>${escapeHtml(nome)}</strong>,</p>
          <p>${escapeHtml(inviterNome)} convidou você para entrar na <strong>${escapeHtml(clinicaNome)}</strong> com o(s) papel(is): <strong>${escapeHtml(rolesDisplay)}</strong>.</p>
          <p><a href="${inviteUrl}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Aceitar convite</a></p>
          <p style="color:#666;font-size:12px">Link: ${inviteUrl}<br>Válido por 7 dias.</p>
        </div></body></html>`;
      try {
        const emailResponse = await sendBrandedBrevoRequest({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: { name: "EloLab", email: "noreply@elolab.com.br" },
            to: [{ email, name: nome }],
            subject: `Convite para ${clinicaNome}`,
            htmlContent: html,
          }),
        });
        if (emailResponse.ok) {
          emailStatus = "sent";
        } else {
          emailStatus = "failed";
          console.error("brevo rejected invite email", { status: emailResponse.status });
        }
      } catch (e) {
        emailStatus = "failed";
        console.error("brevo", e);
      }
    }

    return json({ success: true, token, inviteUrl, emailStatus });
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
