// Validação do cabeçalho x-signature dos webhooks do Mercado Pago.
// Regra oficial: manifest `id:[data.id];request-id:[x-request-id];ts:[ts];`,
// com data.id da query string em minúsculas (IDs de order são alfanuméricos)
// e omitindo as partes ausentes. HMAC-SHA256 em hexadecimal com a chave
// secreta exibida em "Suas integrações > Webhooks".

export interface MercadoPagoSignatureInput {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secret: string;
}

export function parseSignatureHeader(header: string | null): { ts: string; v1: string } | null {
  if (!header) return null;
  let ts = '';
  let v1 = '';
  for (const part of header.split(',')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === 'ts') ts = value;
    if (key === 'v1') v1 = value;
  }
  return ts && v1 ? { ts, v1 } : null;
}

export function buildSignatureManifest(dataId: string | null, xRequestId: string | null, ts: string): string {
  const parts: string[] = [];
  if (dataId) parts.push(`id:${dataId.toLowerCase()}`);
  if (xRequestId) parts.push(`request-id:${xRequestId}`);
  parts.push(`ts:${ts}`);
  return `${parts.join(';')};`;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidMercadoPagoSignature(input: MercadoPagoSignatureInput): Promise<boolean> {
  const parsed = parseSignatureHeader(input.xSignature);
  if (!parsed || !input.secret || !input.dataId) return false;
  const manifest = buildSignatureManifest(input.dataId, input.xRequestId, parsed.ts);
  const expected = await hmacSha256Hex(input.secret, manifest);
  return timingSafeEqual(expected, parsed.v1.toLowerCase());
}

/** Usado apenas em testes e na simulação local de webhooks. */
export async function signMercadoPagoNotification(
  secret: string,
  dataId: string,
  xRequestId: string,
  ts: string,
): Promise<string> {
  const v1 = await hmacSha256Hex(secret, buildSignatureManifest(dataId, xRequestId, ts));
  return `ts=${ts},v1=${v1}`;
}
