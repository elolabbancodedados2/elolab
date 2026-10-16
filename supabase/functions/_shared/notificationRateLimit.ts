type RateLimitClient = {
  rpc: (
    functionName: 'checar_rate_limit',
    parameters: { p_chave: string; p_limite: number; p_janela_segundos: number },
  ) => Promise<{ data: boolean | null; error: { message: string } | null }>;
};

export type NotificationRateLimit = 'clinic' | 'recipient' | null;

const WINDOW_SECONDS = 60;
const CLINIC_SENDS_PER_MINUTE = 50;
const WHATSAPP_SENDS_PER_NUMBER_PER_MINUTE = 1;

async function isRateLimited(client: RateLimitClient, key: string, limit: number): Promise<boolean> {
  const { data, error } = await client.rpc('checar_rate_limit', {
    p_chave: key,
    p_limite: limit,
    p_janela_segundos: WINDOW_SECONDS,
  });
  if (error || typeof data !== 'boolean') {
    throw new Error('Não foi possível confirmar o limite de envios.');
  }
  return !data;
}

async function digest(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const result = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Aplica limites atômicos de clínica e destinatário sem gravar o telefone em claro. */
export async function checkNotificationSendLimits(
  client: RateLimitClient,
  input: { clinicId: string | null; channel: string; destination: string | null; hashSecret?: string },
): Promise<NotificationRateLimit> {
  const clinicKey = `notification:clinic:${input.clinicId ?? 'unassigned'}`;
  if (await isRateLimited(client, clinicKey, CLINIC_SENDS_PER_MINUTE)) return 'clinic';

  if (input.channel !== 'whatsapp' || !input.destination) return null;
  const rawDigits = input.destination.replace(/\D/g, '');
  const digits = rawDigits.startsWith('55') && rawDigits.length >= 12
    ? rawDigits.slice(2)
    : rawDigits;
  if (!digits) return null;

  try {
    if (!input.hashSecret) throw new Error('Secret key unavailable.');
    const recipientHash = await digest(`${input.clinicId ?? 'unassigned'}:${digits}`, input.hashSecret);
    const recipientKey = `notification:whatsapp:${input.clinicId ?? 'unassigned'}:${recipientHash}`;
    return await isRateLimited(client, recipientKey, WHATSAPP_SENDS_PER_NUMBER_PER_MINUTE)
      ? 'recipient'
      : null;
  } catch {
    throw new Error('Não foi possível confirmar o limite de envios.');
  }
}
