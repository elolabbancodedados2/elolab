import { describe, expect, it } from 'vitest';
import { callbackMercadoPagoSeguro, retornoMercadoPagoSeguro, validarRedirectMercadoPago } from '../../../supabase/functions/_shared/mercadoPagoOAuthSecurity';
import { readFileSync } from 'node:fs';

const endpoint = readFileSync('supabase/functions/mercadopago-oauth/index.ts', 'utf8');

describe('validação de domínio e retorno OAuth do Mercado Pago', () => {
  const canonical = 'https://api.elolab.com.br/functions/v1/mercadopago-oauth';

  it('aceita somente HTTPS no domínio e caminho de callback cadastrados', () => {
    expect(validarRedirectMercadoPago(canonical)).toBe(canonical);
    for (const value of [
      'http://api.elolab.com.br/functions/v1/mercadopago-oauth',
      'https://api.elolab.com.br.evil.invalid/functions/v1/mercadopago-oauth',
      'https://evil.invalid/functions/v1/mercadopago-oauth',
      'https://api.elolab.com.br:8443/functions/v1/mercadopago-oauth',
      'https://user:secret@api.elolab.com.br/functions/v1/mercadopago-oauth',
      `${canonical}?next=https://evil.invalid`,
      `${canonical}#fragment`,
      'https://api.elolab.com.br/functions/v1/other',
    ]) expect(() => validarRedirectMercadoPago(value)).toThrow();
  });

  it('aceita callback de state único e 43 caracteres base64url', () => {
    const valid = callbackMercadoPagoSeguro(new URLSearchParams({ state: 'a'.repeat(43), code: 'synthetic-code' }));
    expect(valid).toEqual({ state: 'a'.repeat(43), code: 'synthetic-code', error: null });
    expect(callbackMercadoPagoSeguro(new URLSearchParams({ state: 'short', code: 'synthetic-code' }))).toBeNull();
    expect(callbackMercadoPagoSeguro(new URLSearchParams('state=' + 'a'.repeat(43) + '&state=' + 'b'.repeat(43) + '&code=x'))).toBeNull();
    expect(callbackMercadoPagoSeguro(new URLSearchParams({ state: 'a'.repeat(43), code: 'one', error: 'access_denied' })))
      .toEqual({ state: 'a'.repeat(43), code: 'one', error: 'access_denied' });
    expect(callbackMercadoPagoSeguro(new URLSearchParams('state=' + 'a'.repeat(43) + '&code=a&code=b'))).toBeNull();
  });

  it('mantém o retorno da aplicação fixo e aplica a validação antes do state OAuth', () => {
    expect(retornoMercadoPagoSeguro('https://app.elolab.com.br/configuracoes', 'conectado'))
      .toBe('https://app.elolab.com.br/configuracoes?tab=integracoes&mercado_pago=conectado');
    expect(() => retornoMercadoPagoSeguro('https://evil.invalid/configuracoes', 'erro')).toThrow();
    expect(endpoint).toContain('return validarRedirectMercadoPago(value)');
    expect(endpoint).toContain('callbackMercadoPagoSeguro(url.searchParams)');
    const startEndpoint = endpoint.slice(endpoint.indexOf("if (req.method !== 'POST')"));
    expect(startEndpoint.indexOf('redirectUriValue = redirectUri()')).toBeLessThan(startEndpoint.indexOf("from('mercadopago_oauth_states').insert"));
  });
});
