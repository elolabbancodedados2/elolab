import { supabase } from '@/integrations/supabase/client';

/** O banco sinaliza com este HINT quando a mudança reduz proteção e a prova de identidade não é recente. */
export function exigeReautenticacao(error: unknown): boolean {
  return (error as { hint?: unknown } | null)?.hint === 'reautenticacao_necessaria';
}

export async function fatorTotpVerificado(): Promise<string | null> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return (data?.totp ?? []).find((f) => f.status === 'verified')?.id ?? null;
}

/**
 * Renova a prova de identidade da sessão atual. Com 2FA, usa só o TOTP: entrar
 * de novo por senha criaria sessão AAL1 e perderia o segundo fator.
 */
export async function reautenticar({ email, factorId, codigo, senha }: {
  email: string; factorId: string | null; codigo: string; senha: string;
}): Promise<void> {
  if (factorId) {
    if (!/^\d{6}$/.test(codigo)) throw new Error('O código deve ter 6 dígitos.');
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: codigo });
    if (error) throw error;
    return;
  }
  if (!senha) throw new Error('Informe sua senha atual.');
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
}
