/**
 * Rate limit para endpoints públicos (sem JWT do usuário).
 *
 * Chama a função `public.checar_rate_limit` no banco. Ela é atômica (INSERT
 * ... ON CONFLICT DO UPDATE) e devolve `true` se a requisição pode passar,
 * `false` se a chave já estourou o limite na janela atual.
 *
 * Uso típico no início da edge function:
 *
 *   const limitado = await checarRateLimit(supabase, {
 *     chave: `guias:${clientIp(req)}:${token}`,
 *     limite: 20,
 *     janelaSegundos: 60,
 *   });
 *   if (limitado) return json({ error: 'Muitas tentativas, tente em instantes.' }, 429);
 *
 * Se o banco estiver indisponível, a função devolve `false` (permite passar).
 * Perder rate limit por um momento de rede vale mais que quebrar produção.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface RateLimitOpts {
  chave: string;
  limite: number;
  janelaSegundos?: number;
}

/**
 * @returns `true` se a requisição está LIMITADA (rejeitar);
 *          `false` se pode passar.
 */
export async function checarRateLimit(
  supabase: SupabaseClient,
  opts: RateLimitOpts
): Promise<boolean> {
  const janela = opts.janelaSegundos ?? 60;
  const { data, error } = await supabase.rpc('checar_rate_limit', {
    p_chave: opts.chave,
    p_limite: opts.limite,
    p_janela_segundos: janela,
  });

  if (error) {
    // Falha do banco/timeout: não travar tráfego legítimo.
    console.error('[rateLimit] falha ao consultar, deixando passar:', error.message);
    return false;
  }

  // A função devolve true quando PODE passar; falso quando estourou.
  return data === false;
}

/**
 * Extrai o IP do cliente de forma consistente entre CDN/proxy.
 * Prioriza `cf-connecting-ip` (Cloudflare), depois `x-forwarded-for`.
 */
export function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  );
}
