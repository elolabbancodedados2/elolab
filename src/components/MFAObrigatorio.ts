import { supabase } from '@/integrations/supabase/client';

/**
 * MFA obrigatório (CLIN-QA-304). Quem decide é o banco: a migration
 * 20261029110000 exige AAL2 nas operações sensíveis e expõe
 * `mfa_exigido_para_mim()` para a tela saber quando pedir o cadastro do fator.
 */

export type ProximoPassoMfa = 'verificar' | 'cadastrar' | 'liberar';

/** Depois da senha: conta com fator verifica; perfil obrigado sem fator cadastra; demais seguem. */
export function proximoPassoMfa({ fatorPendente, exigido }: {
  fatorPendente: string | null;
  exigido: boolean;
}): ProximoPassoMfa {
  if (fatorPendente) return 'verificar';
  if (exigido) return 'cadastrar';
  return 'liberar';
}

type RpcBooleano = { rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }> };

/**
 * Consulta a política no servidor. Em falha devolve false: a tela não bloqueia
 * o login, e o banco continua negando as operações sensíveis sem AAL2.
 */
export async function mfaExigidoParaMim(): Promise<boolean> {
  try {
    const { data, error } = await (supabase as unknown as RpcBooleano).rpc('mfa_exigido_para_mim');
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

/** O banco sinaliza com este HINT quando a operação exige o segundo fator. */
export function exigeMfa(error: unknown): boolean {
  return (error as { hint?: unknown } | null)?.hint === 'mfa_necessario';
}
