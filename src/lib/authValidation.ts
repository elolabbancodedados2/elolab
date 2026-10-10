import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Informe seu e-mail.').email('Digite um e-mail válido.'),
  password: z.string().min(1, 'Informe sua senha.'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

export type LoginErrorMessage = {
  message: string;
  canResendConfirmation: boolean;
};

/** Converte falhas de autenticação em mensagens simples para quem usa o app. */
export function interpretarErroLogin(error: unknown): LoginErrorMessage {
  const value = error as { message?: unknown; code?: unknown; status?: unknown; name?: unknown } | null;
  const message = String(value?.message ?? error ?? '').toLowerCase();
  const code = String(value?.code ?? '').toLowerCase();
  const status = Number(value?.status ?? 0);

  if (code.includes('email_not_confirmed') || message.includes('email not confirmed')) {
    return {
      message: 'Confirme seu e-mail para entrar. Se precisar, envie um novo link abaixo.',
      canResendConfirmation: true,
    };
  }
  if (code.includes('invalid_credentials') || message.includes('invalid login credentials')) {
    return {
      message: 'E-mail ou senha incorretos. Tente de novo ou redefina sua senha.',
      canResendConfirmation: false,
    };
  }
  if (status === 429 || /over_request_rate_limit|rate limit|too many requests|too many attempts/.test(`${code} ${message}`)) {
    return {
      message: 'Muitas tentativas. Aguarde um pouco e tente de novo.',
      canResendConfirmation: false,
    };
  }
  if (/user is banned|user banned|account disabled|user disabled/.test(message)) {
    return {
      message: 'Sua conta está suspensa. Fale com o administrador da clínica.',
      canResendConfirmation: false,
    };
  }
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/.test(message)) {
    return {
      message: 'Sem conexão. Verifique sua internet e tente de novo.',
      canResendConfirmation: false,
    };
  }

  return {
    message: 'Não foi possível entrar. Tente de novo em instantes.',
    canResendConfirmation: false,
  };
}
