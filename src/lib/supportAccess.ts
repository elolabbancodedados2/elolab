export type SupportAccessStatus = 'requested' | 'approved' | 'denied' | 'revoked' | 'expired';

export function getSupportAccessStatus(
  status: SupportAccessStatus,
  expiresAt: string | null,
  now = Date.now(),
): SupportAccessStatus {
  if (status !== 'approved' || !expiresAt) return status;
  const expiry = new Date(expiresAt).getTime();
  return Number.isFinite(expiry) && expiry <= now ? 'expired' : status;
}
