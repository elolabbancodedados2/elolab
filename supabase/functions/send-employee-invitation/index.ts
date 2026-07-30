import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface InvitationRequest {
  funcionarioId: string;
  email: string;
  nome: string;
  /** Ignored on purpose — roles are read from funcionarios.pending_roles so the
   *  caller cannot mint an invitation with arbitrary (e.g. admin) roles. */
  roles?: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");

    if (!brevoApiKey) {
      throw new Error("BREVO_API_KEY não configurada");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("Authorization header required");
    }

    // Validate user with anon key + auth header
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      console.error("Auth error:", userError);
      throw new Error("Unauthorized");
    }

    const userId = user.id;

    const { funcionarioId, email, nome }: InvitationRequest = await req.json();

    if (!funcionarioId || !email || !nome) {
      throw new Error("Missing required fields: funcionarioId, email, nome");
    }

    // Use service client to bypass RLS for insert
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Only admins of a clinic may invite. Without this check any authenticated
    // user could mint an invite with roles: ["admin"] and escalate themselves.
    const { data: callerRoles } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (!callerRoles?.some((r: { role: string }) => r.role === "admin")) {
      return new Response(
        JSON.stringify({ success: false, error: "Apenas administradores podem enviar convites." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's clinica_id
    const { data: profileData } = await serviceClient
      .from("profiles")
      .select("clinica_id")
      .eq("id", userId)
      .maybeSingle();

    const clinicaId = profileData?.clinica_id || null;

    // The funcionario must belong to the caller's clinic, and the roles come
    // from the funcionario record — never from the request body.
    const { data: funcData } = await serviceClient
      .from("funcionarios")
      .select("pending_roles, clinica_id")
      .eq("id", funcionarioId)
      .maybeSingle();

    if (!funcData) {
      throw new Error("Funcionário não encontrado");
    }

    if (funcData.clinica_id && clinicaId && funcData.clinica_id !== clinicaId) {
      return new Response(
        JSON.stringify({ success: false, error: "Funcionário pertence a outra clínica." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ALLOWED_ROLES = ["admin", "medico", "recepcao", "enfermagem", "financeiro"];
    const finalRoles = ((funcData.pending_roles as string[]) || []).filter(r =>
      ALLOWED_ROLES.includes(r)
    );

    // Convite sem papel não dá acesso a nada: a pessoa aceita, fica vinculada à
    // clínica e continua sem enxergar uma tela sequer, porque todo o RLS parte
    // de has_any_role. Aconteceu de verdade — vários convites antigos foram
    // criados assim, com roles vazio, e ninguém entendia por que o funcionário
    // "entrava e não via nada".
    //
    // Melhor recusar aqui e dizer o que fazer do que gastar o convite e o
    // tempo da pessoa.
    if (finalRoles.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Defina a função do funcionário (médico, recepção, enfermagem, financeiro ou administrador) antes de enviar o convite. Sem função, ele entraria no sistema sem acesso a nenhuma tela.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!clinicaId && !funcData.clinica_id) {
      // Sem clínica, o aceite vincula a lugar nenhum e o RLS barra tudo pelo
      // is_same_clinica. Três convites antigos estão assim.
      return new Response(
        JSON.stringify({
          success: false,
          error: "Não foi possível identificar a clínica deste funcionário. Recarregue a página e tente de novo.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const inviteToken = crypto.randomUUID();

    const { error: insertError } = await serviceClient
      .from("employee_invitations")
      .insert({
        funcionario_id: funcionarioId,
        email,
        token: inviteToken,
        roles: finalRoles,
        status: "pending",
        clinica_id: clinicaId,
      });

    if (insertError) {
      console.error("Insert error:", insertError);
      throw new Error("Failed to create invitation: " + insertError.message);
    }

    const inviteCode = inviteToken;
    const inviteUrl = `https://app.elolab.com.br/aceitar-convite?token=${encodeURIComponent(inviteToken)}`;

    const roleLabels: Record<string, string> = {
      admin: "Administrador",
      medico: "Médico",
      recepcao: "Recepção",
      enfermagem: "Enfermagem",
      financeiro: "Financeiro",
    };

    const rolesDisplay = finalRoles.map(r => roleLabels[r] || r).join(", ") || "Usuário";

    // Escape user-controlled values before interpolating into the email HTML
    const esc = (s: string) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
          .header { background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); padding: 32px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { padding: 32px; }
          .greeting { font-size: 18px; color: #18181b; margin-bottom: 16px; }
          .text { color: #52525b; line-height: 1.6; margin-bottom: 24px; }
          .role-badge { display: inline-block; background: #dbeafe; color: #1d4ed8; padding: 6px 12px; border-radius: 6px; font-size: 14px; font-weight: 500; }
          .button { display: inline-block; background: #0ea5e9; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 24px 0; }
          .code-box { background: #f4f4f5; border: 1px dashed #a1a1aa; border-radius: 8px; padding: 12px; text-align: center; margin: 16px 0; }
          .code-value { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px; color: #18181b; word-break: break-all; }
          .link-box { background: #f8fafc; border-radius: 8px; padding: 10px; margin-top: 10px; font-size: 12px; color: #334155; word-break: break-all; }
          .footer { background: #f4f4f5; padding: 24px; text-align: center; color: #71717a; font-size: 12px; }
          .warning { color: #a16207; background: #fef3c7; padding: 12px; border-radius: 6px; margin-top: 16px; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏥 EloLab Clínica</h1>
          </div>
          <div class="content">
            <p class="greeting">Olá, ${esc(nome)}!</p>
            <p class="text">
              Você foi convidado(a) para fazer parte da nossa equipe no Sistema Clínico.
              Com este convite, você terá acesso ao sistema com as seguintes permissões:
            </p>
            <p>
              <span class="role-badge">${rolesDisplay}</span>
            </p>
            <p class="text">
              Clique no botão abaixo para criar sua conta e começar a usar o sistema:
            </p>
            <div style="text-align: center;">
              <a href="${inviteUrl}" class="button">Aceitar Convite e Criar Conta</a>
            </div>
            <p class="text" style="margin-bottom: 8px;"><strong>Código do convite:</strong></p>
            <div class="code-box">
              <div class="code-value">${inviteCode}</div>
            </div>
            <div class="link-box">Se o botão não abrir, use este link: ${inviteUrl}</div>
            <p class="warning">
              ⚠️ Este convite expira em 7 dias. Se você não reconhece este convite, ignore este e-mail.
            </p>
          </div>
          <div class="footer">
            <p>EloLab Clínica - Sistema de Gestão</p>
            <p>Este é um e-mail automático, por favor não responda.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send via Brevo
    const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'EloLab Clínica', email: 'noreply@elolab.com.br' },
        to: [{ email, name: nome }],
        subject: 'Convite para acessar o Sistema EloLab',
        htmlContent,
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      console.error("Brevo email error:", errBody);
    }

    return new Response(
      // The token is deliberately NOT returned: it is delivered only by email,
      // otherwise the caller could accept the invitation they just created.
      JSON.stringify({
        success: true,
        message: "Convite enviado com sucesso",
        emailSent: emailRes.ok,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error sending invitation:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});