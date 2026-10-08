import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { usuariosNoLimite, validarLimitesDeEquipe } from "../_shared/limitesClinica.ts";
import { checarRateLimit, clientIp } from "../_shared/rateLimit.ts";
import { corsPadrao } from '../_shared/cors.ts';

// Atribuído em cada request (reflete a origem permitida). Helpers
// top-level (json/reply) capturam esta variável por closure.
let corsHeaders: Record<string, string> = {};

;

Deno.serve(async (req) => {
  corsHeaders = { ...corsPadrao(req),};
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const service = createClient(supabaseUrl, serviceKey);

    if (await checarRateLimit(service, {
      chave: `accept-invite:${clientIp(req)}`,
      limite: 20,
      janelaSegundos: 60,
    })) {
      return json({ success: false, error: "Muitas tentativas. Aguarde alguns segundos." }, 429);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "accept"); // "lookup" | "accept"
    const token = String(body.token || "");
    if (!token) return json({ success: false, error: "Token obrigatório." }, 400);

    const { data: invite } = await service
      .from("convites_funcionario")
      .select("id, clinica_id, email, nome, roles, expires_at, accepted_at, accepted_by")
      .eq("token", token)
      .maybeSingle();

    if (!invite) return json({ success: false, error: "Convite inválido." }, 404);
    if ((invite as any).accepted_at && action !== 'accept_authenticated') {
      return json({ success: false, error: "Convite já utilizado." }, 410);
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

    const email = (invite as any).email as string;
    // ILIKE trata "_" e "%" como curinga; e-mail com "_" casaria outro usuário.
    const emailPadrao = email.replace(/[\\%_]/g, (c) => `\\${c}`);
    const nome = (invite as any).nome as string;
    const clinicaId = (invite as any).clinica_id as string;
    const roles = (invite as any).roles as string[];

    const erroLimitePlano = await validarLimitesDeEquipe(service, clinicaId, roles);
    if (erroLimitePlano) return json({ success: false, error: erroLimitePlano }, 403);

    // Limite de usuários definido pela plataforma (Limites e Consumo): o convite
    // pode ter sido enviado quando ainda havia vaga.
    const cotaUsuarios = await usuariosNoLimite(service, clinicaId);
    if (cotaUsuarios.atingido) {
      return json({ success: false, error: `A clínica atingiu o limite de ${cotaUsuarios.limite} assentos contabilizados. Fale com o suporte para revisar as contas consideradas ou solicitar ampliação do limite.` }, 403);
    }

    let userId: string | null = null;
    const telefone = body.telefone ? String(body.telefone) : null;
    if (action === 'accept_authenticated') {
      const authorization = req.headers.get('Authorization') || '';
      const accessToken = authorization.replace(/^Bearer\s+/i, '');
      if (!accessToken) return json({ success: false, error: 'Entre na sua conta para aceitar este convite.' }, 401);

      const { data: authData, error: authError } = await service.auth.getUser(accessToken);
      const authenticatedUser = authData?.user;
      if (authError || !authenticatedUser) {
        return json({ success: false, error: 'Sua sessão expirou. Entre novamente para aceitar o convite.' }, 401);
      }
      if (authenticatedUser.email?.toLowerCase() !== email.toLowerCase()) {
        return json({ success: false, error: 'Entre com a conta do e-mail que recebeu o convite.' }, 403);
      }

      userId = authenticatedUser.id;
      if ((invite as any).accepted_at) {
        if ((invite as any).accepted_by === userId) {
          return json({ success: true, user_id: userId, clinica_id: (invite as any).clinica_id, already_accepted: true });
        }
        return json({ success: false, error: 'Convite já utilizado.' }, 410);
      }
      if (new Date((invite as any).expires_at) < new Date()) {
        return json({ success: false, error: 'Convite expirado.' }, 410);
      }
    } else {
      if (action !== 'accept') return json({ success: false, error: 'Ação inválida.' }, 400);
      if (new Date((invite as any).expires_at) < new Date()) {
        return json({ success: false, error: 'Convite expirado.' }, 410);
      }

      const password = String(body.password || '');
      if (password.length < 8) {
        return json({ success: false, error: 'Senha deve ter pelo menos 8 caracteres.' }, 400);
      }

      const { data: created, error: createErr } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome, full_name: nome, telefone, invite_token: token },
      });

      if (createErr) {
        // Conta já existente: não consuma o convite nem altere seus papéis
        // antes que a pessoa prove acesso com a senha da conta.
        const { data: perfil } = await service
          .from('profiles').select('id').ilike('email', emailPadrao).maybeSingle();
        let existingId: string | null = (perfil as any)?.id ?? null;
        for (let page = 1; !existingId && page <= 50; page++) {
          const { data: list } = await service.auth.admin.listUsers({ page, perPage: 1000 });
          const users = list?.users ?? [];
          existingId = users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
          if (users.length < 1000) break;
        }
        if (existingId) {
          return json({
            success: false,
            code: 'account_exists',
            error: 'Este e-mail já tem uma conta. Entre com a senha existente para aceitar o convite.',
          });
        }
        return json({ success: false, error: createErr.message }, 400);
      }

      userId = created.user?.id ?? null;
    }

    if (!userId) return json({ success: false, error: "Falha ao criar usuário." }, 500);

    // Upsert profile com clinica_id
    await service.from("profiles").upsert({
      id: userId,
      nome,
      email,
      ...(telefone ? { telefone } : {}),
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
      .ilike("email", emailPadrao)
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
        // Ficha criada anteriormente pela clínica pode ainda não ter user_id.
        // Vincule-a por e-mail antes de criar uma segunda ficha médica.
        const { data: medByEmail } = await service
          .from("medicos")
          .select("id")
          .eq("clinica_id", clinicaId)
          .ilike("email", emailPadrao)
          .limit(1)
          .maybeSingle();
        if (medByEmail) {
          await service.from("medicos").update({ user_id: userId }).eq("id", medByEmail.id);
        } else {
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
