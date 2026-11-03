const encoder = new TextEncoder();
async function signingKey(secret: string) {
  if (!secret) throw new Error('Chave de assinatura indisponível');
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function assinarAparelhoPortal(tokenId: string, expiresAt: number, secret: string): Promise<string> {
  const payload = btoa(JSON.stringify({ v: 1, tokenId, expiresAt, nonce: crypto.randomUUID() }));
  const signature = await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(`portal-device:${payload}`));
  return `${payload}.${Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, '0')).join('')}`;
}

export async function verificarAparelhoPortal(proof: unknown, tokenId: string, secret: string, now = Date.now()): Promise<boolean> {
  if (typeof proof !== 'string' || proof.length > 2048) return false;
  try {
    const parts = proof.split('.');
    if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1])) return false;
    const [payload, hex] = parts;
    const data = JSON.parse(atob(payload));
    if (data.v !== 1 || data.tokenId !== tokenId || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= now) return false;
    return await crypto.subtle.verify('HMAC', await signingKey(secret),
      Uint8Array.from(hex.match(/../g)!, pair => parseInt(pair, 16)), encoder.encode(`portal-device:${payload}`));
  } catch { return false; }
}

export function bloqueioPortalAtivo(blockedUntil: string | null, now = Date.now()): boolean {
  return Boolean(blockedUntil && Date.parse(blockedUntil) > now);
}
