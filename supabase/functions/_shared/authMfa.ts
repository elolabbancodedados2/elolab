interface MfaUser { factors?: Array<{ status: string }> }

/** Call only after auth.getUser has validated the bearer token. */
export function mfaRequiredResponse(req: Request, user: MfaUser, headers: Record<string, string>): Response | null {
  if (!user.factors?.some(factor => factor.status === 'verified')) return null;
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  try {
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    if (claims.aal === 'aal2') return null;
  } catch { /* Invalid assurance remains blocked. Signature was checked by Auth. */ }
  return new Response(JSON.stringify({ error: 'Confirme o segundo fator para continuar.', code: 'MFA_REQUIRED' }), {
    status: 403,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
