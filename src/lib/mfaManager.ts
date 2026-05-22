/**
 * MFA (Multi-Factor Authentication) Manager
 * TOTP-based authentication for admin/medico users
 * Uses speakeasy for TOTP generation + qrcode for QR visualization
 */

import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';

function randomBase32(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let out = '';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % 32];
  return out;
}

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
  const secretBase32 = randomBase32(32);
  const totp = new OTPAuth.TOTP({
    issuer: appName,
    label: userEmail,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  const qrCodeUrl = await QRCode.toDataURL(totp.toString());

  // Gerar backup codes (10 códigos de 8 dígitos)
  const backupCodes = Array.from({ length: 10 }, () =>
    Math.random().toString(36).substring(2, 10).toUpperCase()
  );

  return { secret: secretBase32, qrCodeUrl, backupCodes };
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
    const totp = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token, window });
    return delta !== null;
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
  const totp = new OTPAuth.TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.generate();
}

/**
 * Check se MFA é obrigatório para role
 */
export const MFA_REQUIRED_ROLES = ['admin', 'medico'];

export function isMFARequired(role?: string): boolean {
  return role ? MFA_REQUIRED_ROLES.includes(role) : false;
}
