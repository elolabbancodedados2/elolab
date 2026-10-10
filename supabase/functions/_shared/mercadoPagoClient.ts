// Cliente HTTP mínimo para a API do Mercado Pago usado pelo checkout dos
// planos. Só repete a chamada em falhas de comunicação, 429 e 5xx; erros 4xx
// voltam na primeira tentativa. A mesma X-Idempotency-Key é reenviada em todas
// as tentativas para que o Mercado Pago não crie o mesmo pedido duas vezes.

export const MP_API_BASE = 'https://api.mercadopago.com';

export class MercadoPagoApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly body: unknown,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'MercadoPagoApiError';
  }

  /** Falha de rede ou indisponibilidade: o estado no gateway é desconhecido. */
  get isCommunicationFailure() {
    return this.status === null || this.status >= 500 || this.status === 429;
  }
}

export interface MercadoPagoRequest {
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  body?: unknown;
  idempotencyKey?: string;
  /** Device ID do MercadoPago.js V2 (cabeçalho X-Meli-Session-Id). */
  deviceId?: string | null;
}

export interface MercadoPagoClientOptions {
  accessToken: string;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createMercadoPagoClient(options: MercadoPagoClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxAttempts = options.maxAttempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 15000;
  const sleep = options.sleep ?? defaultSleep;

  async function request<T = Record<string, unknown>>(req: MercadoPagoRequest): Promise<T> {
    let lastError: MercadoPagoApiError | null = null;
    // A API de Orders exige X-Idempotency-Key em todo POST (inclusive cancelar).
    const idempotencyKey = req.idempotencyKey ?? (req.method === 'POST' ? crypto.randomUUID() : undefined);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let response: Response;
      try {
        response = await fetchImpl(`${MP_API_BASE}${req.path}`, {
          method: req.method,
          headers: {
            Authorization: `Bearer ${options.accessToken}`,
            Accept: 'application/json',
            ...(req.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
            ...(req.deviceId ? { 'X-Meli-Session-Id': req.deviceId } : {}),
          },
          body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        lastError = new MercadoPagoApiError(
          `Falha de comunicação com o Mercado Pago: ${error instanceof Error ? error.message : String(error)}`,
          null,
          null,
          true,
        );
        if (attempt < maxAttempts) await sleep(500 * 2 ** (attempt - 1));
        continue;
      }

      const text = await response.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text.slice(0, 500);
      }

      if (response.ok) return body as T;

      const retryable = response.status === 429 || response.status >= 500;
      const parsed = (body || {}) as { message?: unknown; errors?: { message?: unknown }[] };
      const message = typeof parsed.message === 'string'
        ? parsed.message
        : typeof parsed.errors?.[0]?.message === 'string'
        ? String(parsed.errors[0].message)
        : `Mercado Pago respondeu HTTP ${response.status}`;
      lastError = new MercadoPagoApiError(message, response.status, body, retryable);
      if (!retryable) throw lastError;
      if (attempt < maxAttempts) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** (attempt - 1));
      }
    }

    throw lastError ?? new MercadoPagoApiError('Falha de comunicação com o Mercado Pago', null, null, true);
  }

  return { request };
}

export type MercadoPagoClient = ReturnType<typeof createMercadoPagoClient>;
