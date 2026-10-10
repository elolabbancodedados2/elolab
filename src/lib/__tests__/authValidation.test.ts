import { describe, expect, it } from 'vitest';
import { interpretarErroLogin, loginSchema } from '../authValidation';

describe('validação do login', () => {
  it('remove espaços do e-mail antes de validar', () => {
    expect(loginSchema.parse({ email: '  Pessoa@Exemplo.com  ', password: 'senha' }).email)
      .toBe('Pessoa@Exemplo.com');
  });

  it('orienta e-mail vazio, inválido e senha vazia', () => {
    expect(loginSchema.safeParse({ email: '', password: 'senha' }).error?.issues[0].message)
      .toBe('Informe seu e-mail.');
    expect(loginSchema.safeParse({ email: 'sem-arroba', password: 'senha' }).error?.issues[0].message)
      .toBe('Digite um e-mail válido.');
    expect(loginSchema.safeParse({ email: 'pessoa@exemplo.com', password: '' }).error?.issues[0].message)
      .toBe('Informe sua senha.');
  });
});

describe('mensagens de erro de login', () => {
  it('não revela se o e-mail existe quando as credenciais não conferem', () => {
    expect(interpretarErroLogin({ message: 'Invalid login credentials' })).toEqual({
      message: 'E-mail ou senha incorretos. Tente de novo ou redefina sua senha.',
      canResendConfirmation: false,
    });
  });

  it('oferece reenvio somente para conta não confirmada', () => {
    expect(interpretarErroLogin({ code: 'email_not_confirmed' }).canResendConfirmation).toBe(true);
    expect(interpretarErroLogin({ message: 'Invalid login credentials' }).canResendConfirmation).toBe(false);
  });

  it('traduz limite de tentativas, suspensão, rede e erro desconhecido', () => {
    expect(interpretarErroLogin({ status: 429 }).message).toMatch(/Muitas tentativas/);
    expect(interpretarErroLogin({ code: 'over_request_rate_limit' }).message).toMatch(/Muitas tentativas/);
    expect(interpretarErroLogin({ message: 'User is banned' }).message).toMatch(/conta está suspensa/);
    expect(interpretarErroLogin(new TypeError('Failed to fetch')).message).toMatch(/Verifique sua internet/);
    expect(interpretarErroLogin({ message: 'internal server secret details' }).message)
      .not.toContain('internal server secret details');
  });
});
