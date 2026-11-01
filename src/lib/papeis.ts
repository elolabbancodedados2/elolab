import type { AppRole } from '@/contexts/SupabaseAuthContext';

/**
 * Ordem explícita dos papéis. O banco não garante ordem nas linhas de
 * user_roles; sem isto o "papel principal" (roles[0]) de quem tem mais de um
 * papel mudava de um login para outro.
 */
export const ORDEM_PAPEIS: readonly AppRole[] = ['admin', 'medico', 'enfermagem', 'recepcao', 'financeiro'];

export function ordenarPapeis(roles: readonly string[]): AppRole[] {
  const conhecidos = new Set<string>(ORDEM_PAPEIS);
  const unicos = [...new Set(roles)].filter((role): role is AppRole => conhecidos.has(role));
  return unicos.sort((a, b) => ORDEM_PAPEIS.indexOf(a) - ORDEM_PAPEIS.indexOf(b));
}
