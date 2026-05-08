/**
 * MFA (Multi-Factor Authentication) Manager
 * TOTP-based authentication for admin/medico users
 * Uses speakeasy for TOTP generation + qrcode for QR visualization
 */

import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export interface MFASetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface MFAValidation {
  isValid: boolean;
  remainingAttempts: number;
}

/**
 * Gerar novo setup de MFA
 */
export async function generateMFASetup(
  userEmail: string,
  appName: string = 'EloLab'
): Promise<MFASetup> {
  // Gerar secret TOTP
  const secret = speakeasy.generateSecret({
    name: `${appName} (${userEmail})`,
    issuer: appName,
    length: 32,
  });

  // Gerar QR code
  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url || '');

  // Gerar backup codes (10 códigos de 8 dígitos)
  const backupCodes = Array.from({ length: 10 }, () =>
    Math.random().toString(36).substring(2, 10).toUpperCase()
  );

  return {
    secret: secret.base32,
    qrCodeUrl,
    backupCodes,
  };
}

/**
 * Validar token TOTP
 */
export function validateTOTPToken(
  token: string,
  secret: string,
  window: number = 2 // Allow ±2 time windows (30s each)
): boolean {
  try {
    const isValid = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window,
    });
    return isValid;
  } catch (error) {
    console.error('TOTP validation error:', error);
    return false;
  }
}

/**
 * Validar backup code
 */
export function validateBackupCode(
  code: string,
  backupCodes: string[]
): boolean {
  const upperCode = code.toUpperCase();
  return backupCodes.includes(upperCode);
}

/**
 * Remover um backup code após uso
 */
export function consumeBackupCode(code: string, backupCodes: string[]): string[] {
  const upperCode = code.toUpperCase();
  return backupCodes.filter(c => c !== upperCode);
}

/**
 * Gerar token TOTP para testes
 * ⚠️ SÓ para testes/desenvolvimento
 */
export function generateTOTPTokenForTesting(secret: string): string {
  return speakeasy.totp({
    secret,
    encoding: 'base32',
  });
}

/**
 * Check se MFA é obrigatório para role
 */
export const MFA_REQUIRED_ROLES = ['admin', 'medico'];

export function isMFARequired(role?: string): boolean {
  return role ? MFA_REQUIRED_ROLES.includes(role) : false;
}
