export function isInvitationExpired(
  expiresAt: string | Date,
  now = Date.now(),
): boolean {
  const expiry = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
  return !Number.isFinite(expiry) || expiry <= now;
}
