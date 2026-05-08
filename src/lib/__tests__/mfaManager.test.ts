import { describe, it, expect } from 'vitest';
import {
  validateTOTPToken,
  validateBackupCode,
  consumeBackupCode,
  generateTOTPTokenForTesting,
  isMFARequired,
  MFA_REQUIRED_ROLES,
} from '@/lib/mfaManager';

describe('validateTOTPToken', () => {
  // Secret base32 válido para testes (30 chars)
  const validSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3P';

  it('valida token TOTP gerado para o mesmo secret', () => {
    const token = generateTOTPTokenForTesting(validSecret);
    expect(validateTOTPToken(token, validSecret)).toBe(true);
  });

  it('rejeita token incorreto', () => {
    expect(validateTOTPToken('000000', validSecret)).toBe(false);
  });

  it('rejeita token vazio', () => {
    expect(validateTOTPToken('', validSecret)).toBe(false);
  });

  it('retorna false em vez de lançar quando secret é inválido', () => {
    // Implementação tem try/catch e retorna false em erro
    expect(validateTOTPToken('123456', '')).toBe(false);
  });

  it('aceita janela de tempo (window=2 por padrão)', () => {
    // Tokens gerados muito recentemente (mesma janela) devem validar
    const token = generateTOTPTokenForTesting(validSecret);
    expect(validateTOTPToken(token, validSecret, 2)).toBe(true);
  });
});

describe('validateBackupCode', () => {
  const codes = ['ABC12345', 'DEF67890', 'XYZ00111'];

  it('valida código existente (exact match)', () => {
    expect(validateBackupCode('ABC12345', codes)).toBe(true);
  });

  it('valida código com casing diferente (normalizado para upper)', () => {
    expect(validateBackupCode('abc12345', codes)).toBe(true);
  });

  it('rejeita código inexistente', () => {
    expect(validateBackupCode('FAKE0000', codes)).toBe(false);
  });

  it('rejeita lista vazia', () => {
    expect(validateBackupCode('ABC12345', [])).toBe(false);
  });
});

describe('consumeBackupCode', () => {
  const codes = ['ABC12345', 'DEF67890', 'XYZ00111'];

  it('remove o código consumido da lista', () => {
    const remaining = consumeBackupCode('ABC12345', codes);
    expect(remaining).not.toContain('ABC12345');
    expect(remaining).toHaveLength(codes.length - 1);
  });

  it('mantém os outros códigos intactos', () => {
    const remaining = consumeBackupCode('ABC12345', codes);
    expect(remaining).toContain('DEF67890');
    expect(remaining).toContain('XYZ00111');
  });

  it('é case-insensitive ao remover', () => {
    const remaining = consumeBackupCode('abc12345', codes);
    expect(remaining).not.toContain('ABC12345');
  });

  it('não modifica array original (imutabilidade)', () => {
    const original = [...codes];
    consumeBackupCode('ABC12345', codes);
    expect(codes).toEqual(original);
  });

  it('retorna lista inalterada se código não existe', () => {
    const remaining = consumeBackupCode('NAOEXISTE', codes);
    expect(remaining).toEqual(codes);
  });
});

describe('isMFARequired', () => {
  it('retorna true para admin', () => {
    expect(isMFARequired('admin')).toBe(true);
  });

  it('retorna true para medico', () => {
    expect(isMFARequired('medico')).toBe(true);
  });

  it('retorna false para recepcao', () => {
    expect(isMFARequired('recepcao')).toBe(false);
  });

  it('retorna false para enfermagem', () => {
    expect(isMFARequired('enfermagem')).toBe(false);
  });

  it('retorna false para financeiro', () => {
    expect(isMFARequired('financeiro')).toBe(false);
  });

  it('retorna false para role undefined', () => {
    expect(isMFARequired(undefined)).toBe(false);
  });
});

describe('MFA_REQUIRED_ROLES export', () => {
  it('expõe lista de roles que exigem MFA', () => {
    expect(MFA_REQUIRED_ROLES).toContain('admin');
    expect(MFA_REQUIRED_ROLES).toContain('medico');
  });
});
