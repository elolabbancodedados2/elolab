/**
 * Guarda para funções disparadas pelo pg_cron.
 *
 * Estas funções são agendadas pelo banco e não têm usuário por trás. Antes elas
 * eram chamadas com a chave `anon` no Authorization — que é pública, está no
 * JavaScript do site — então qualquer visitante conseguia dispará-las e gerar
 * envio de WhatsApp, e-mail e cobrança em nome da clínica.
 *
 * Agora o cron manda um cabeçalho x-cron-secret com um segredo privado.
 *
 * Falha aberta de propósito: enquanto CRON_SECRET não estiver configurado nos
 * secrets das edge functions, nada é bloqueado. Isso permite configurar o
 * segredo e reagendar o cron sem janela de indisponibilidade. Depois de rodar
 * a migration 20260727235000, confirme que o segredo está setado.
 */
export function cronSecretOk(req: Request): boolean {
  const expected = Deno.env.get('CRON_SECRET');

  // Ainda não configurado → não bloqueia (ver comentário acima)
  if (!expected) return true;

  const provided = req.headers.get('x-cron-secret');
  if (!provided) return false;

  // Comparação em tempo constante para não vazar o segredo por timing
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Papel declarado no JWT do Authorization.
 *
 * Confiável porque estas funções rodam com verify_jwt = true: o gateway do
 * Supabase valida a assinatura antes do handler. Aqui só precisamos distinguir
 * a chave `anon` (role "anon", pública) de um usuário logado (role
 * "authenticated"), então basta ler o claim.
 */
function jwtRole(req: Request): string | null {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const resto = parts[1].length % 4;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(resto ? 4 - resto : 0);
    return JSON.parse(atob(b64))?.role ?? null;
  } catch {
    return null;
  }
}

/**
 * Para funções que o cron dispara MAS que a interface também chama de propósito
 * — send-appointment-reminder (ao criar agendamento) e process-notification-queue
 * (hook useNotificationScheduler).
 *
 * Aceita duas origens: o agendador, com o segredo; ou um usuário autenticado.
 * A chave `anon` sozinha não passa, que é justamente o buraco original.
 *
 * Usar cronSecretOk nessas duas devolveria 403 para a própria clínica assim que
 * CRON_SECRET fosse configurado.
 */
export function cronOrUserOk(req: Request): boolean {
  if (cronSecretOk(req)) return true;
  return jwtRole(req) === 'authenticated';
}

/**
 * Clínica de quem chamou, quando a chamada veio de um usuário logado.
 *
 * Rotinas como `birthday-greetings` e `stock-alert` foram escritas para o
 * agendador: percorrem TODAS as clínicas e disparam para cada uma que tenha a
 * automação ligada. Isso está certo quando quem chama é o pg_cron.
 *
 * Mas a tela de Automações tem um botão "Executar agora". Se ele rodasse a
 * rotina global, um clique na clínica A dispararia mensagem para pacientes das
 * outras onze — envio duplicado, em nome de quem não pediu.
 *
 * Então: chamada do cron continua global; chamada de usuário fica restrita à
 * clínica dele. A clínica vem do JWT, nunca do corpo da requisição.
 *
 * @returns `null` quando é o cron (processa tudo) ou quando não há clínica.
 */
export async function clinicaDoChamador(
  req: Request,
  supabase: { from: (t: string) => any },
): Promise<string | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  let sub: string | null = null;
  try {
    const resto = parts[1].length % 4;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(resto ? 4 - resto : 0);
    const claims = JSON.parse(atob(b64));
    if (claims?.role !== 'authenticated') return null; // cron ou service_role
    sub = claims?.sub ?? null;
  } catch {
    return null;
  }
  if (!sub) return null;

  const { data } = await supabase
    .from('profiles').select('clinica_id').eq('id', sub).maybeSingle();
  return (data as any)?.clinica_id ?? null;
}

export function cronForbidden(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error: 'Forbidden: esta função só pode ser disparada pelo agendador.' }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
