import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const service = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "accept"); // "lookup" | "accept"
    const token = String(body.token || "");
    if (!token) return json({ success: false, error: "Token obrigatório." }, 400);

    const { data: invite } = await service
      .from("convites_funcionario")
      .select("id, clinica_id, email, nome, roles, expires_at, accepted_at")
      .eq("token", token)
      .maybeSingle();

    if (!invite) return json({ success: false, error: "Convite inválido." }, 404);
    if ((invite as any).accepted_at) return json({ success: false, error: "Convite já utilizado." }, 410);
    if (new Date((invite as any).expires_at) < new Date()) {
      return json({ success: false, error: "Convite expirado." }, 410);
    }

    const { data: clinica } = await service
      .from("clinicas").select("nome").eq("id", (invite as any).clinica_id).maybeSingle();

    if (action === "lookup") {
      return json({
        success: true,
        invite: {
          email: (invite as any).email,
          nome: (invite as any).nome,
          roles: (invite as any).roles,
          clinica_nome: (clinica as any)?.nome ?? "",
        },
      });
    }

    // action === "accept"
    const password = String(body.password || "");
    const telefone = body.telefone ? String(body.telefone) : null;
    if (password.length < 8) {
      return json({ success: false, error: "Senha deve ter pelo menos 8 caracteres." }, 400);
    }

    const email = (invite as any).email as string;
    const nome = (invite as any).nome as string;
    const clinicaId = (invite as any).clinica_id as string;
    const roles = (invite as any).roles as string[];

    // Cria ou recupera usuário
    let userId: string | null = null;
    const { data: created, error: createErr } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome, full_name: nome, telefone, invite_token: token },
    });

    if (createErr) {
      // Pode já existir → procurar
      const { data: list } = await service.auth.admin.listUsers();
      const existing = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (!existing) {
        return json({ success: false, error: createErr.message }, 400);
      }
      userId = existing.id;
    } else {
      userId = created.user?.id ?? null;
    }

    if (!userId) return json({ success: false, error: "Falha ao criar usuário." }, 500);

    // Upsert profile com clinica_id
    await service.from("profiles").upsert({
      id: userId,
      nome,
      email,
      telefone,
      clinica_id: clinicaId,
    } as any, { onConflict: "id" });

    // Roles
    if (roles.length > 0) {
      const rows = roles.map((role) => ({ user_id: userId, role }));
      await service.from("user_roles").upsert(rows as any, { onConflict: "user_id,role" });
    }

    // Vincula o cadastro de funcionário à conta criada.
    //
    // Era a única coisa que este caminho não fazia e o outro
    // (accept_employee_invitation) fazia. Sem o vínculo, a pessoa passa a ter
    // login mas a ficha de funcionário fica órfã: hoje 9 dos 12 funcionários
    // estão assim, sem user_id, e por isso não aparecem em nada que dependa de
    // conta.
    //
    // Casa pelo e-mail dentro da MESMA clínica. Se não houver ficha, cria —
    // convidar alguém já é a decisão de que essa pessoa faz parte da equipe.
    const { data: fichaExistente } = await service
      .from("funcionarios")
      .select("id, user_id")
      .eq("clinica_id", clinicaId)
      .ilike("email", email)
      .maybeSingle();

    if (fichaExistente) {
      if (!(fichaExistente as any).user_id) {
        await service
          .from("funcionarios")
          .update({ user_id: userId })
          .eq("id", (fichaExistente as any).id);
      }
    } else {
      await service.from("funcionarios").insert({
        nome,
        email,
        user_id: userId,
        clinica_id: clinicaId,
        ativo: true,
        // pending_roles espelha os papéis concedidos: é de onde o outro fluxo
        // lê para reenviar convite, e vazio ali gera convite que não dá acesso.
        pending_roles: roles,
      } as any);
    }

    // Se médico, garantir registro em medicos
    if (roles.includes("medico")) {
      const { data: existsMed } = await service
        .from("medicos").select("id").eq("user_id", userId).maybeSingle();
      if (!existsMed) {
        await service.from("medicos").insert({
          nome,
          email,
          crm: "PENDENTE",
          user_id: userId,
          ativo: true,
          clinica_id: clinicaId,
        } as any);
      }
    }

    // Marca convite aceito
    await service.from("convites_funcionario")
      .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
      .eq("id", (invite as any).id);

    return json({ success: true, user_id: userId, clinica_id: clinicaId });
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