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
 * Endpoints que protegem tokens, dados pessoais, convites ou gravações públicas
 * devem usar `failClosed: true`, para uma falha do banco não virar bypass.
 * Endpoints sem efeito sensível podem manter o padrão fail-open.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface RateLimitOpts {
  chave: string;
  limite: number;
  janelaSegundos?: number;
  /** Rejeita a requisição se a proteção não puder ser consultada. */
  failClosed?: boolean;
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
    console.error('[rateLimit] falha ao consultar:', error.message);
    if (opts.failClosed) throw new Error('Rate limit indisponível; requisição interrompida por segurança.');
    return false;
  }

  // A função devolve true quando PODE passar; falso quando estourou.
  return data === false;
}

/**
 * Extrai o IP informado pelo proxy que encaminhou a requisição.
 */
export function clientIp(req: Request): string {
  return (
    req.headers.get('x-real-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  );
}
