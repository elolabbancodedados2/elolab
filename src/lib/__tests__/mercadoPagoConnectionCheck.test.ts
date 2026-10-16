import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { testarConexaoMercadoPago } from '../../../supabase/functions/_shared/mercadoPagoConnectionCheck';

const endpoint = readFileSync('supabase/functions/clinic-integrations/index.ts', 'utf8');
const ui = readFileSync('src/components/configuracoes/IntegracoesClinica.tsx', 'utf8');

describe('teste somente leitura da conexão Mercado Pago', () => {
  it('faz GET /users/me e valida o vendedor vinculado', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: 12345 }), { status: 200 }));
    const result = await testarConexaoMercadoPago('synthetic-token', '12345', fetcher);

    expect(result).toEqual({ healthy: true, code: 'ok' });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe('https://api.mercadopago.com/users/me');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'GET', headers: { accept: 'application/json' } });
    expect(fetcher.mock.calls[0][1]).not.toHaveProperty('body');
  });

  it('retorna códigos seguros para credencial rejeitada, vendedor divergente e falha de rede', async () => {
    const rejected = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 401 }));
    const mismatch = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: 67890 }), { status: 200 }));
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new Error('private endpoint response with synthetic-token'));

    await expect(testarConexaoMercadoPago('synthetic-token', '12345', rejected)).resolves.toEqual({ healthy: false, code: 'credential_rejected' });
    await expect(testarConexaoMercadoPago('synthetic-token', '12345', mismatch)).resolves.toEqual({ healthy: false, code: 'identity_mismatch' });
    await expect(testarConexaoMercadoPago('synthetic-token', '12345', offline)).resolves.toEqual({ healthy: false, code: 'provider_unavailable' });
  });

  it('restringe o teste ao admin, usa segredo somente no servidor e mostra correções comuns', () => {
    expect(endpoint.indexOf('if (!adminRole)')).toBeGreaterThan(-1);
    expect(endpoint.indexOf("if (action === 'test')")).toBeGreaterThan(endpoint.indexOf('if (!adminRole)'));
    expect(endpoint).toContain('credencialDaClinica(service, clinicaId, provedor)');
    expect(endpoint).toContain('testarConexaoMercadoPago(accessToken, sellerId)');
    expect(endpoint).not.toContain('accessTokenMercadoPagoClinica');
    const testAction = endpoint.slice(endpoint.indexOf("if (action === 'test')"), endpoint.indexOf("if (provedor === 'mercado_pago' && action === 'connect')"));
    expect(testAction).not.toMatch(/pagamentos_mercadopago|mercadopago_point_orders|\.from\(['"]lancamentos/);
    expect(ui).toContain('Testar conexão');
    expect(ui).toContain('credential_expired');
    expect(ui).toContain('provider_unavailable');
  });
});
