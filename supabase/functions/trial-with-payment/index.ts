/**
 * Endpoint legado desativado.
 *
 * O fluxo de assinatura em uso é `mercadopago-checkout`, que resolve o plano
 * no servidor e não aceita preço ou dados de cobrança confiados ao navegador.
 */
Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null);
  return new Response(
    JSON.stringify({ error: 'Use o checkout oficial da assinatura da plataforma.' }),
    { status: 410, headers: { 'Content-Type': 'application/json' } },
  );
});
