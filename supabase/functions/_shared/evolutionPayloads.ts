function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function extractEvolutionQr(payload: unknown): string | null {
  const root = object(payload);
  const qr = object(root.qrcode);
  const legacy = object(root.qr);
  for (const value of [root.base64, qr.base64, legacy.base64, root.code, qr.code, legacy.code]) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

export function parseEvolutionState(payload: unknown) {
  const root = object(payload);
  const instance = object(root.instance);
  const raw = instance.state ?? root.state;
  const state = typeof raw === 'string' ? raw : 'unknown';
  const connected = state === 'open' || state === 'connected';
  const status = connected ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected';
  const owner = instance.ownerJid ?? instance.owner ?? root.ownerJid;
  const phoneNumber = typeof owner === 'string' ? owner.split('@')[0].replace(/\D/g, '') || undefined : undefined;
  return { state, connected, status, phoneNumber };
}

export function evolutionWebhookPayload(url: string, key: string) {
  return { webhook: {
    enabled: true, url, byEvents: false, base64: false,
    headers: { 'x-webhook-token': key },
    events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
  } };
}
