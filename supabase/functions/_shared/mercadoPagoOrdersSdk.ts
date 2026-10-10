// Criação de Orders via SDK oficial de backend do Mercado Pago.
// GET/cancel mantêm o cliente HTTP com retry já usado pelas Edge Functions.

import { MercadoPagoConfig, Order } from 'npm:mercadopago@3.6.1';
import { MercadoPagoApiError } from './mercadoPagoClient.ts';

export async function createOrderWithMercadoPagoSdk(
  accessToken: string,
  body: Record<string, unknown>,
  idempotencyKey: string,
  deviceId?: string | null,
): Promise<Record<string, unknown>> {
  const config = new MercadoPagoConfig({
    accessToken,
    options: {
      timeout: 15_000,
      idempotencyKey,
      maxRetries: 2,
      retryOn: [429, 500, 502, 503, 504],
      initialDelay: 500,
      maxDelay: 4_000,
    },
  });

  try {
    const order = new Order(config);
    return await order.create({ body: body as never, requestOptions: {
        idempotencyKey,
        // Device ID do MercadoPago.js V2, enviado como X-Meli-Session-Id.
        ...(deviceId ? { meliSessionId: deviceId } : {}),
      } }) as unknown as Record<string, unknown>;
  } catch (error) {
    const sdkError = error as { message?: unknown; status?: unknown; error?: unknown; causes?: unknown };
    const status = typeof sdkError.status === 'number' && sdkError.status > 0 ? sdkError.status : null;
    const message = typeof sdkError.message === 'string' ? sdkError.message : 'Falha no SDK do Mercado Pago';
    const errorBody = {
      message,
      ...(typeof sdkError.error === 'string' ? { error: sdkError.error } : {}),
      ...(Array.isArray(sdkError.causes) ? { causes: sdkError.causes } : {}),
    };
    throw new MercadoPagoApiError(message, status, errorBody, status === null || status === 429 || status >= 500);
  }
}
