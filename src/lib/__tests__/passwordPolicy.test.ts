import { describe, it, expect } from 'vitest';
import { validatePassword, passwordSchema, PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy';

/**
 * A política existe num só lugar porque antes divergia entre as portas de
 * entrada: cadastro pedia 6 caracteres e o aceite de convite pedia 6 ou 8,
 * dependendo do fluxo. Como um convite pode conceder o papel `admin`, a conta
 * mais poderosa da clínica podia nascer com a senha mais fraca.
 */
describe('validatePassword', () => {
  it('aceita uma senha que cumpre todas as regras', () => {
    expect(validatePassword('SenhaForte123')).toBeNull();
  });

  it('rejeita senha curta', () => {
    expect(validatePassword('Abc123')).toMatch(/pelo menos/);
  });

  it('rejeita as senhas de 6 e 8 caracteres que os fluxos antigos aceitavam', () => {
    expect(validatePassword('Abc123')).not.toBeNull();
    expect(validatePassword('Abcd1234')).not.toBeNull();
  });

  it('exige letra minúscula', () => {
    expect(validatePassword('SENHAFORTE123')).toMatch(/minúscula/);
  });

  it('exige letra maiúscula', () => {
    expect(validatePassword('senhaforte123')).toMatch(/maiúscula/);
  });

  it('exige número', () => {
    expect(validatePassword('SenhaForteSemNum')).toMatch(/número/);
  });

  it('rejeita senha vazia', () => {
    expect(validatePassword('')).not.toBeNull();
  });

  it('exige no mínimo o comprimento declarado', () => {
    const noLimite = 'Aa1' + 'x'.repeat(PASSWORD_MIN_LENGTH - 3);
    expect(noLimite).toHaveLength(PASSWORD_MIN_LENGTH);
    expect(validatePassword(noLimite)).toBeNull();
    expect(validatePassword(noLimite.slice(0, -1))).not.toBeNull();
  });
});

describe('passwordSchema', () => {
  it('funciona como schema zod para react-hook-form', () => {
    expect(passwordSchema.safeParse('SenhaForte123').success).toBe(true);
    expect(passwordSchema.safeParse('fraca').success).toBe(false);
  });
});
