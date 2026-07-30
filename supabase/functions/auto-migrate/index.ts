/**
 * DESATIVADA — respondia DDL para quem pedisse.
 *
 * Esta função estava publicada e chamável por qualquer pessoa na internet
 * (verify_jwt = false), rodava com SUPABASE_SERVICE_ROLE_KEY — que ignora todo
 * o RLS — e executava CREATE TABLE / ALTER TABLE / DROP sem nenhuma checagem de
 * autorização. Qualquer visitante podia alterar o schema do banco de produção.
 *
 * Agravante: ela não existia neste repositório. Estava só no servidor, fora de
 * qualquer revisão de código. Foi encontrada auditando as 33 funções
 * publicadas, não lendo o repo.
 *
 * O App.tsx já havia removido a chamada (`autoSetupDatabase()` rodava a cada
 * carregamento da página), mas a função continuou no ar. Nada no app a chama.
 *
 * Mantida como stub em vez de apagada para que o slug fique documentado e
 * visível em revisão. O bundle original está preservado fora do repo.
 * Migrações passam pelo fluxo normal do Supabase, com revisão.
 */
Deno.serve(() =>
  new Response(
    JSON.stringify({
      error: 'Função desativada. Migrações de banco não são executadas por HTTP.',
    }),
    { status: 410, headers: { 'Content-Type': 'application/json' } }
  )
);
