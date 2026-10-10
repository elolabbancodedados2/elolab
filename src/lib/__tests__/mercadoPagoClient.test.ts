import { describe, expect, it, vi } from 'vitest';
import { createMercadoPagoClient, MercadoPagoApiError } from '../../../supabase/functions/_shared/mercadoPagoClient';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const noSleep = () => Promise.resolve();

describe('cliente da API do Mercado Pago', () => {
  it('repete após falha de comunicação e mantém a mesma chave de idempotência', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(json(503, { message: 'unavailable' }))
      .mockResolvedValueOnce(json(201, { id: 'ORD1' }));
    const client = createMercadoPagoClient({ accessToken: 'TOKEN', fetchImpl, sleep: noSleep });

    await expect(client.request({ method: 'POST', path: '/v1/orders', body: {}, idempotencyKey: 'chave-1' }))
      .resolves.toEqual({ id: 'ORD1' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const keys = fetchImpl.mock.calls.map(([, init]) => (init as RequestInit & { headers: Record<string, string> }).headers['X-Idempotency-Key']);
    expect(keys).toEqual(['chave-1', 'chave-1', 'chave-1']);
  });

  it('desiste após as tentativas e sinaliza falha de comunicação', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('timeout'));
    const client = createMercadoPagoClient({ accessToken: 'TOKEN', fetchImpl, sleep: noSleep, maxAttempts: 3 });

    const error = await client.request({ method: 'GET', path: '/v1/orders/1' }).catch((e) => e);
    expect(error).toBeInstanceOf(MercadoPagoApiError);
    expect(error.isCommunicationFailure).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('não repete erro 4xx e preserva o corpo (order recusada vem em data)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(402, { errors: [{ code: 'failed' }], data: { id: 'ORD9', status: 'failed' } }));
    const client = createMercadoPagoClient({ accessToken: 'TOKEN', fetchImpl, sleep: noSleep });

    const error = await client.request({ method: 'POST', path: '/v1/orders', body: {} }).catch((e) => e);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(error.status).toBe(402);
    expect(error.isCommunicationFailure).toBe(false);
    expect(error.body.data.status).toBe('failed');
  });

  it('gera X-Idempotency-Key em POST sem chave (exigido para cancelar orders), estável entre tentativas', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(json(200, { status: 'canceled' }));
    await createMercadoPagoClient({ accessToken: 'TOKEN', fetchImpl, sleep: noSleep })
      .request({ method: 'POST', path: '/v1/orders/ORD1/cancel' });
    const keys = fetchImpl.mock.calls.map(([, init]) => (init as RequestInit & { headers: Record<string, string> }).headers['X-Idempotency-Key']);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
  });

  it('usa a mensagem de errors[] da API de Orders', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(400, { errors: [{ code: 'empty_required_header', message: 'Missing HTTP header' }] }));
    const error = await createMercadoPagoClient({ accessToken: 'TOKEN', fetchImpl }).request({ method: 'GET', path: '/x' }).catch((e) => e);
    expect(error.message).toBe('Missing HTTP header');
  });

  it('envia o access token só no cabeçalho Authorization', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, {}));
    await createMercadoPagoClient({ accessToken: 'TOKEN', fetchImpl }).request({ method: 'GET', path: '/v1/orders/ABC' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/v1/orders/ABC');
    expect(String(url)).not.toContain('TOKEN');
    expect((init as RequestInit & { headers: Record<string, string> }).headers.Authorization).toBe('Bearer TOKEN');
  });
});
