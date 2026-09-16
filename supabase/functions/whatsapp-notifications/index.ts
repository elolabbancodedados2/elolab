/**
 * Endpoint legado desativado.
 *
 * O envio atual passa por funções específicas, com autenticação e escopo de
 * clínica. Este slug não é usado pelo aplicativo e não deve permanecer como
 * uma porta genérica para disparos via service_role.
 */
Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null);
  return new Response(
    JSON.stringify({ error: 'Endpoint legado desativado.' }),
    { status: 410, headers: { 'Content-Type': 'application/json' } },
  );
});
