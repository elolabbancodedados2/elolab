/**
 * CORS com allowlist de origens.
 *
 * Antes todas as edge functions respondiam `Access-Control-Allow-Origin: *`:
 * qualquer site conseguia disparar requisições autenticadas contra endpoints
 * que devolvem dado clínico e financeiro. Agora a origem do request só é
 * refletida se estiver na allowlist — no caso contrário devolvemos o
 * primeiro domínio da lista, que o browser de outra origem rejeita do mesmo
 * jeito, sem confirmar ao atacante que a origem dele foi avaliada.
 *
 * Ajustar por ambiente com a variável ALLOWED_ORIGINS (lista separada por
 * vírgula). O padrão cobre produção e o dev local do Vite.
 *
 * Chamadas server-to-server (webhooks do Mercado Pago, cron, uma função
 * chamando outra) não enviam Origin — CORS é proteção de browser, e para elas
 * o header é indiferente.
 */

const DEFAULT_ORIGINS = [
  'https://app.elolab.com.br',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

function allowedOrigins(): string[] {
  const extra = Deno.env.get('ALLOWED_ORIGINS');
  if (!extra) return DEFAULT_ORIGINS;
  const list = extra.split(',').map(o => o.trim()).filter(Boolean);
  return list.length > 0 ? list : DEFAULT_ORIGINS;
}

/** Origem refletida: a do request se for conhecida; senão, a default. */
function origemPermitida(req: Request): string {
  const list = allowedOrigins();
  const origin = req.headers.get('origin');
  return origin && list.includes(origin) ? origin : list[0];
}

/** Headers CORS para a resposta e para o preflight OPTIONS. */
export function corsPadrao(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origemPermitida(req),
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-portal-token, x-cron-secret, x-elolab-internal, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
