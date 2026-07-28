import { z } from 'zod';

/**
 * Política de senha única do sistema.
 *
 * Antes cada porta de entrada tinha a sua: o cadastro exigia 6 caracteres e a
 * aceitação de convite exigia 6 ou 8, dependendo de qual dos dois fluxos de
 * convite o link usava. Como um convite pode conceder o papel `admin`, a conta
 * mais poderosa da clínica podia nascer com a senha mais fraca.
 *
 * Mantenha estas regras espelhadas em Authentication → Policies no painel do
 * Supabase — a validação aqui é do cliente e não substitui a do servidor.
 */
export const PASSWORD_MIN_LENGTH = 10;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`)
  .regex(/[a-z]/, 'Inclua ao menos uma letra minúscula')
  .regex(/[A-Z]/, 'Inclua ao menos uma letra maiúscula')
  .regex(/[0-9]/, 'Inclua ao menos um número');

/**
 * Valida uma senha e devolve a primeira mensagem de erro, ou null se estiver ok.
 * Para telas que não usam react-hook-form/zod.
 */
export function validatePassword(password: string): string | null {
  const result = passwordSchema.safeParse(password);
  return result.success ? null : result.error.issues[0].message;
}
