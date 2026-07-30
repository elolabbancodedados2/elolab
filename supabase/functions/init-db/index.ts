/**
 * DESATIVADA — inicializava o banco para quem pedisse.
 *
 * Mesmo problema da auto-migrate: estava publicada e chamável por qualquer
 * pessoa na internet (verify_jwt = false), rodava com
 * SUPABASE_SERVICE_ROLE_KEY — que ignora todo o RLS — e executava DDL sem
 * nenhuma checagem de autorização.
 *
 * Agravante: não existia neste repositório. Estava só no servidor, fora de
 * qualquer revisão de código. Foi encontrada auditando as 33 funções
 * publicadas, não lendo o repo.
 *
 * Nada no app a chama. Mantida como stub em vez de apagada para que o slug
 * fique documentado e visível em revisão; o bundle original está preservado
 * fora do repo. Migrações passam pelo fluxo normal do Supabase, com revisão.
 */
Deno.serve(() =>
  new Response(
    JSON.stringify({
      error: 'Função desativada. Inicialização de banco não é executada por HTTP.',
    }),
    { status: 410, headers: { 'Content-Type': 'application/json' } }
  )
);
