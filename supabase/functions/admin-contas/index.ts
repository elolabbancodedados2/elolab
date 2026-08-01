// Ferramentas de conta do dono da plataforma: bloquear, trocar senha, apagar.
//
// Substitui a admin-set-password, que autorizava por SENHA COMPARTILHADA
// (ADMIN_TOOL_SECRET) em vez de identidade. Qualquer pessoa que descobrisse o
// segredo — num log, num histórico de terminal, num backup de .env — trocava a
// senha de qualquer conta do sistema, inclusive a do dono, e entrava nela para
// ler prontuário. E não ficava registro de nada.
//
// Aqui a autorização é a identidade de quem chamou: o JWT da sessão, conferido
// contra platform_admins. Não há segredo para vazar, e toda tentativa vai para
// admin_acoes, dê certo ou não.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const ACOES_AUDITADAS = new Set([
  "bloquear", "desbloquear", "trocar_senha", "enviar_reset", "confirmar_email", "apagar",
]);

// Um século. O GoTrue não tem "banido para sempre", só duração.
const BANIMENTO = "876000h";
const SENHA_MINIMA = 10;
const TETO_POR_MINUTO = 20;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const service = createClient(url, serviceKey);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  // Registra a tentativa antes de responder. Uma ação que falhou por falta de
  // permissão é justamente a que mais interessa a quem audita depois.
  const registrar = async (campos: Record<string, unknown>) => {
    try {
      await service.from("admin_acoes").insert({ ip, ...campos });
    } catch (_) {
      // Auditoria indisponível não pode derrubar a resposta, mas também não
      // pode passar em branco.
      console.error("FALHA AO AUDITAR", JSON.stringify(campos));
    }
  };

  try {
    // ─── 1. Quem está chamando ───
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Sessão não enviada. Entre novamente." }, 401);
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: ator }, error: erroAtor } = await userClient.auth.getUser();
    if (erroAtor || !ator) {
      return json({ error: "Sessão inválida ou expirada. Entre novamente." }, 401);
    }

    // ─── 2. O pedido ───
    // Lido ANTES da checagem de permissão para que a recusa registre o que a
    // pessoa realmente tentou fazer. Sem isso o log dizia "bloquear" para quem
    // tentou apagar — e é justamente essa diferença que uma auditoria procura.
    const body = await req.json().catch(() => ({}));
    const acaoPedida = String(body.acao ?? "");
    const alvoId = String(body.alvo_id ?? "");
    const motivo = body.motivo ? String(body.motivo).slice(0, 500) : null;

    // Só valores da lista chegam à coluna; o texto cru fica em `detalhe`.
    const acao = ACOES_AUDITADAS.has(acaoPedida) || acaoPedida === "previa"
      ? acaoPedida
      : "desconhecida";

    // ─── 3. É dono da plataforma? ───
    // Contra platform_admins, não contra o papel `admin`, que é de CLÍNICA:
    // qualquer cliente que comprou o EloLab tem esse papel na clínica dele.
    const { data: donoPlataforma } = await service
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", ator.id)
      .eq("ativo", true)
      .maybeSingle();

    const atorEmail = ator.email ?? ator.id;

    if (!donoPlataforma) {
      await registrar({
        ator_id: ator.id, ator_email: atorEmail,
        alvo_id: alvoId || null, alvo_email: "(não avaliado)", acao,
        sucesso: false, erro: "chamador não é dono da plataforma",
        detalhe: { recusado_antes_de_agir: true, acao_pedida: acaoPedida },
      });
      return json({ error: "Esta ferramenta é do dono da plataforma." }, 403);
    }

    if (!alvoId) return json({ error: "Escolha a conta." }, 400);

    const { data: alvoResp, error: erroAlvo } = await service.auth.admin.getUserById(alvoId);
    const alvo = alvoResp?.user;
    if (erroAlvo || !alvo) return json({ error: "Conta não encontrada." }, 404);
    const alvoEmail = alvo.email ?? alvoId;

    // ─── 4. Prévia: só leitura, não altera nada, não vai para a auditoria ───
    if (acao === "previa") {
      return json({ previa: await levantarPrevia(service, alvoId, alvo) });
    }

    if (!ACOES_AUDITADAS.has(acao)) {
      return json({ error: `Ação desconhecida: ${acaoPedida}` }, 400);
    }

    // A partir daqui, tudo é registrado.
    const negar = async (mensagem: string, status: number) => {
      await registrar({
        ator_id: ator.id, ator_email: atorEmail,
        alvo_id: alvoId, alvo_email: alvoEmail,
        acao, motivo, sucesso: false, erro: mensagem,
      });
      return json({ error: mensagem }, status);
    };

    // ─── 5. Travas ───

    // Teto por minuto: uma sessão roubada não vira uma varredura na base
    // inteira antes de alguém perceber.
    const umMinutoAtras = new Date(Date.now() - 60_000).toISOString();
    const { count } = await service
      .from("admin_acoes")
      .select("id", { count: "exact", head: true })
      .eq("ator_id", ator.id)
      .gte("criado_em", umMinutoAtras);
    if ((count ?? 0) >= TETO_POR_MINUTO) {
      return await negar("Muitas ações seguidas. Espere um minuto.", 429);
    }

    // Contra si mesmo: bloquear-se ou apagar-se tranca o dono para fora do
    // próprio app, sem ninguém do outro lado para desfazer.
    if (alvoId === ator.id && acao !== "enviar_reset") {
      return await negar(
        "Você não pode fazer isso com a sua própria conta — ficaria sem como voltar.", 400,
      );
    }

    // Contra outro dono: impede que um administrador da plataforma derrube o
    // outro. Mudanças nesse círculo passam pelo banco, com as duas mãos.
    if (alvoId !== ator.id) {
      const { data: alvoEhDono } = await service
        .from("platform_admins")
        .select("user_id").eq("user_id", alvoId).eq("ativo", true).maybeSingle();
      if (alvoEhDono) {
        return await negar(
          "Esta conta também é dona da plataforma. Ações entre donos são feitas direto no banco, de propósito.", 403,
        );
      }
    }

    // ─── 6. Execução ───
    let resultado: Record<string, unknown> = {};

    switch (acao) {
      case "bloquear": {
        const { error } = await service.auth.admin.updateUserById(alvoId, {
          ban_duration: BANIMENTO,
        });
        if (error) return await negar(error.message, 400);
        await encerrarSessoes(service, alvoId);
        resultado = { bloqueado: true };
        break;
      }

      case "desbloquear": {
        const { error } = await service.auth.admin.updateUserById(alvoId, {
          ban_duration: "none",
        });
        if (error) return await negar(error.message, 400);
        resultado = { bloqueado: false };
        break;
      }

      case "trocar_senha": {
        const senha = String(body.senha ?? "");
        if (senha.length < SENHA_MINIMA) {
          return await negar(`A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`, 400);
        }
        const { error } = await service.auth.admin.updateUserById(alvoId, { password: senha });
        if (error) return await negar(error.message, 400);
        await encerrarSessoes(service, alvoId);
        // A senha NUNCA entra na auditoria — o registro diz que houve troca,
        // não qual é. Quem lê o log não pode entrar na conta por causa dele.
        resultado = { senha_trocada: true };
        break;
      }

      case "enviar_reset": {
        const destino = Deno.env.get("APP_URL") ?? "https://app.elolab.com.br";
        const anon = createClient(url, anonKey);
        const { error } = await anon.auth.resetPasswordForEmail(alvoEmail, {
          redirectTo: `${destino}/redefinir-senha`,
        });
        if (error) return await negar(error.message, 400);
        resultado = { email_enviado: true };
        break;
      }

      case "confirmar_email": {
        const { error } = await service.auth.admin.updateUserById(alvoId, {
          email_confirm: true,
        });
        if (error) return await negar(error.message, 400);
        resultado = { email_confirmado: true };
        break;
      }

      case "apagar": {
        // Digitar o e-mail inteiro é a última barreira antes de algo que não
        // tem volta. Um clique errado na lista não passa daqui.
        if (String(body.confirmacao ?? "").trim().toLowerCase() !== alvoEmail.toLowerCase()) {
          return await negar("Digite o e-mail da conta exatamente como aparece para confirmar.", 400);
        }

        const previa = await levantarPrevia(service, alvoId, alvo);
        if (previa.impedimentos.length > 0) {
          return await negar(
            `Esta conta não pode ser apagada: ${previa.impedimentos.join("; ")}. Use "Bloquear".`, 409,
          );
        }

        const { error } = await service.auth.admin.deleteUser(alvoId);
        if (error) {
          // 23503: a conta assinou algo que o banco se recusa a deixar órfão —
          // uma triagem, um laudo, uma movimentação de estoque.
          const ehVinculo = error.message.includes("violates foreign key")
            || (error as { code?: string }).code === "23503";
          return await negar(
            ehVinculo
              ? "Esta conta tem registros clínicos vinculados e não pode ser apagada. Use \"Bloquear\" — o acesso acaba e o histórico fica."
              : error.message,
            ehVinculo ? 409 : 400,
          );
        }
        resultado = { apagado: true, arrastou: previa.some_junto };
        break;
      }
    }

    await registrar({
      ator_id: ator.id, ator_email: atorEmail,
      alvo_id: alvoId, alvo_email: alvoEmail,
      acao, motivo, sucesso: true, detalhe: resultado,
    });

    return json({ ok: true, ...resultado });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("admin-contas:", msg);
    return json({ error: "Erro inesperado. Tente de novo." }, 500);
  }
});

// Sessões abertas somem, então o próximo refresh falha. O token de acesso já
// emitido continua valendo até expirar (1 h no padrão do Supabase) — quem
// estiver com a tela aberta segue até lá. Por isso o bloqueio não é
// instantâneo, e a tela diz isso.
async function encerrarSessoes(service: ReturnType<typeof createClient>, alvoId: string) {
  try {
    await service.rpc("admin_encerrar_sessoes", { p_user_id: alvoId });
  } catch (e) {
    console.error("não foi possível encerrar sessões:", e);
  }
}

interface Previa {
  email: string;
  bloqueado: boolean;
  email_confirmado: boolean;
  ultimo_login: string | null;
  papeis: string[];
  dono_da_clinica: string | null;
  pacientes: number;
  agendamentos: number;
  impedimentos: string[];
  some_junto: string[];
}

/** O que existe na conta hoje, e o que a exclusão levaria junto. */
async function levantarPrevia(
  service: ReturnType<typeof createClient>,
  alvoId: string,
  alvo: { email?: string; banned_until?: string; email_confirmed_at?: string; last_sign_in_at?: string },
): Promise<Previa> {
  const [perfil, papeis, clinicaPropria] = await Promise.all([
    service.from("profiles").select("clinica_id, nome").eq("id", alvoId).maybeSingle(),
    service.from("user_roles").select("role").eq("user_id", alvoId),
    service.from("clinicas").select("id, nome").eq("owner_id", alvoId).maybeSingle(),
  ]);

  const impedimentos: string[] = [];
  const someJunto: string[] = [];
  let pacientes = 0;
  let agendamentos = 0;

  const clinica = clinicaPropria.data as { id: string; nome: string } | null;
  if (clinica) {
    const [p, a] = await Promise.all([
      service.from("pacientes").select("id", { count: "exact", head: true }).eq("clinica_id", clinica.id),
      service.from("agendamentos").select("id", { count: "exact", head: true }).eq("clinica_id", clinica.id),
    ]);
    pacientes = p.count ?? 0;
    agendamentos = a.count ?? 0;

    if (pacientes > 0 || agendamentos > 0) {
      impedimentos.push(
        `é dona da clínica "${clinica.nome}", com ${pacientes} paciente(s) e ${agendamentos} agendamento(s)`,
      );
    } else {
      someJunto.push(`a clínica "${clinica.nome}" fica sem dono`);
    }
  }

  const [medico, funcionario, mensagens] = await Promise.all([
    service.from("medicos").select("id", { count: "exact", head: true }).eq("user_id", alvoId),
    service.from("funcionarios").select("id", { count: "exact", head: true }).eq("user_id", alvoId),
    service.from("chat_messages").select("id", { count: "exact", head: true }).eq("remetente_id", alvoId),
  ]);
  if ((medico.count ?? 0) > 0) someJunto.push("o cadastro de médico e a agenda dele");
  if ((funcionario.count ?? 0) > 0) someJunto.push("o cadastro de funcionário");
  if ((mensagens.count ?? 0) > 0) someJunto.push(`${mensagens.count} mensagem(ns) do chat interno`);

  return {
    email: alvo.email ?? "",
    bloqueado: !!alvo.banned_until && new Date(alvo.banned_until) > new Date(),
    email_confirmado: !!alvo.email_confirmed_at,
    ultimo_login: alvo.last_sign_in_at ?? null,
    papeis: ((papeis.data ?? []) as { role: string }[]).map((r) => r.role),
    dono_da_clinica: clinica?.nome ?? null,
    pacientes,
    agendamentos,
    impedimentos,
    some_junto: someJunto,
  };
}
