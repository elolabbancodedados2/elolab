import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { usuariosNoLimite, validarLimitesDeEquipe } from "../_shared/limitesClinica.ts";
import { checarRateLimit, clientIp } from "../_shared/rateLimit.ts";
import { corsPadrao } from '../_shared/cors.ts';
import { isInvitationExpired } from "../_shared/invitationExpiry.ts";

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
    // Links vencidos não devem revelar dados pessoais durante a consulta inicial.
    if (action === "lookup" && isInvitationExpired((invite as any).expires_at)) {
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
      if (isInvitationExpired((invite as any).expires_at)) {
        return json({ success: false, error: 'Convite expirado.' }, 410);
      }
    } else {
      if (action !== 'accept') return json({ success: false, error: 'Ação inválida.' }, 400);
      if (isInvitationExpired((invite as any).expires_at)) {
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

    const { data: perfilAtual, error: perfilLookupError } = await service
      .from("profiles")
      .select("clinica_id, email")
      .eq("id", userId)
      .maybeSingle();
    throwDatabaseError(perfilLookupError, "Não foi possível validar o perfil da conta.");
    if (perfilAtual?.clinica_id && perfilAtual.clinica_id !== clinicaId) {
      return json({ success: false, error: "Esta conta já pertence a outra clínica." }, 409);
    }
    if (perfilAtual?.email && perfilAtual.email.toLowerCase() !== email.toLowerCase()) {
      return json({ success: false, error: "O e-mail do perfil não corresponde ao convite. Peça ao administrador para corrigir o cadastro." }, 409);
    }

    // Confira os vínculos antes de gravar o perfil e as permissões. Um convite
    // não pode tomar uma ficha que já pertence a outra conta.
    const { data: fichaExistente, error: fichaLookupError } = await service
      .from("funcionarios")
      .select("id, user_id")
      .eq("clinica_id", clinicaId)
      .ilike("email", emailPadrao)
      .maybeSingle();
    throwDatabaseError(fichaLookupError, "Não foi possível validar a ficha do funcionário.");
    if (fichaExistente?.user_id && fichaExistente.user_id !== userId) {
      return json({ success: false, error: "A ficha deste funcionário já está vinculada a outra conta. Peça ao administrador para corrigir o vínculo." }, 409);
    }

    let medicoExistente: { id: string; user_id: string | null; clinica_id: string } | null = null;
    if (roles.includes("medico")) {
      const { data: medicoDaConta, error: medicoLookupError } = await service
        .from("medicos").select("id, user_id, clinica_id").eq("user_id", userId).maybeSingle();
      throwDatabaseError(medicoLookupError, "Não foi possível validar o cadastro médico.");
      if (medicoDaConta && medicoDaConta.clinica_id !== clinicaId) {
        return json({ success: false, error: "O cadastro médico desta conta já pertence a outra clínica." }, 409);
      }
      medicoExistente = medicoDaConta;

      if (!medicoExistente) {
        const { data: medicoPorEmail, error: medicoEmailError } = await service
          .from("medicos")
          .select("id, user_id, clinica_id")
          .eq("clinica_id", clinicaId)
          .ilike("email", emailPadrao)
          .limit(1)
          .maybeSingle();
        throwDatabaseError(medicoEmailError, "Não foi possível validar o cadastro médico.");
        if (medicoPorEmail?.user_id && medicoPorEmail.user_id !== userId) {
          return json({ success: false, error: "O cadastro médico deste e-mail já está vinculado a outra conta. Peça ao administrador para corrigir o vínculo." }, 409);
        }
        medicoExistente = medicoPorEmail;
      }
    }

    // Upsert profile com clinica_id
    const { error: profileSaveError } = await service.from("profiles").upsert({
      id: userId,
      nome,
      email,
      ...(telefone ? { telefone } : {}),
      clinica_id: clinicaId,
    } as any, { onConflict: "id" });
    throwDatabaseError(profileSaveError, "Não foi possível vincular o perfil à clínica.");

    // Roles
    if (roles.length > 0) {
      const rows = roles.map((role) => ({ user_id: userId, role }));
      const { error: rolesSaveError } = await service.from("user_roles").upsert(rows as any, { onConflict: "user_id,role" });
      throwDatabaseError(rolesSaveError, "Não foi possível atribuir os papéis do convite.");
    }

    // Vincula o cadastro de funcionário à conta criada.
    //
    // Sem o vínculo, a pessoa teria login mas a ficha de funcionário ficaria
    // órfã e deixaria de aparecer nas telas que dependem da conta.
    //
    // Casa pelo e-mail dentro da MESMA clínica. Se não houver ficha, cria —
    // convidar alguém já é a decisão de que essa pessoa faz parte da equipe.
    if (fichaExistente) {
      if (!(fichaExistente as any).user_id) {
        const { data: linkedEmployee, error: linkError } = await service
          .from("funcionarios")
          .update({ user_id: userId })
          .eq("id", (fichaExistente as any).id)
          .is("user_id", null)
          .select("id")
          .maybeSingle();
        throwDatabaseError(linkError, "Não foi possível vincular a ficha do funcionário.");
        if (!linkedEmployee) return json({ success: false, error: "A ficha do funcionário mudou durante o aceite. Peça ao administrador para verificar o vínculo." }, 409);
      }
    } else {
      const { error: employeeInsertError } = await service.from("funcionarios").insert({
        nome,
        email,
        user_id: userId,
        clinica_id: clinicaId,
        ativo: true,
        // pending_roles espelha os papéis concedidos: é de onde o outro fluxo
        // lê para reenviar convite, e vazio ali gera convite que não dá acesso.
        pending_roles: roles,
      } as any);
      throwDatabaseError(employeeInsertError, "Não foi possível criar a ficha do funcionário.");
    }

    // Se médico, garantir registro em medicos
    if (roles.includes("medico")) {
      if (medicoExistente) {
        // Ficha criada anteriormente pode ainda não ter user_id.
        if (!medicoExistente.user_id) {
          const { data: linkedDoctor, error: doctorLinkError } = await service.from("medicos")
            .update({ user_id: userId })
            .eq("id", medicoExistente.id)
            .select("id")
            .maybeSingle();
          throwDatabaseError(doctorLinkError, "Não foi possível vincular o cadastro médico.");
          if (!linkedDoctor) throw new Error("O cadastro médico mudou durante o aceite. Tente novamente.");
        }
      } else {
        const { error: doctorInsertError } = await service.from("medicos").insert({
          nome,
          email,
          crm: "PENDENTE",
          user_id: userId,
          ativo: true,
          clinica_id: clinicaId,
        } as any);
        throwDatabaseError(doctorInsertError, "Não foi possível criar o cadastro médico.");
      }
    }

    // Marca convite aceito
    const { data: inviteUpdated, error: inviteUpdateError } = await service.from("convites_funcionario")
      .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
      .eq("id", (invite as any).id)
      .is("accepted_at", null)
      .select("id")
      .maybeSingle();
    throwDatabaseError(inviteUpdateError, "Não foi possível concluir o aceite do convite.");
    if (!inviteUpdated) return json({ success: false, error: "O convite foi utilizado por outra tentativa. Entre novamente para conferir o acesso." }, 409);

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

function throwDatabaseError(error: { message?: string } | null, message: string): void {
  if (!error) return;
  console.error("accept-invite database operation failed:", error.message ?? "unknown error");
  throw new Error(message);
}
