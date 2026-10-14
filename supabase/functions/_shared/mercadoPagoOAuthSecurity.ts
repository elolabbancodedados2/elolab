const REDIRECT_ORIGIN = 'https://api.elolab.com.br';
const REDIRECT_PATH = '/functions/v1/mercadopago-oauth';
const APP_RETURN_ORIGIN = 'https://app.elolab.com.br';
const APP_RETURN_PATH = '/configuracoes';
const OAUTH_STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function validarRedirectMercadoPago(value: string): string {
  const parsed = new URL(value);
  if (
    parsed.protocol !== 'https:' ||
    parsed.origin !== REDIRECT_ORIGIN ||
    parsed.pathname !== REDIRECT_PATH ||
    parsed.username || parsed.password || parsed.search || parsed.hash
  ) throw new Error('URL de retorno OAuth não aprovada.');
  return parsed.toString();
}

export function retornoMercadoPagoSeguro(value: string, status: 'conectado' | 'cancelado' | 'erro'): string {
  const parsed = new URL(value);
  if (
    parsed.protocol !== 'https:' ||
    parsed.origin !== APP_RETURN_ORIGIN ||
    parsed.pathname !== APP_RETURN_PATH ||
    parsed.username || parsed.password || parsed.search || parsed.hash
  ) throw new Error('URL de retorno da aplicação não aprovada.');
  parsed.searchParams.set('tab', 'integracoes');
  parsed.searchParams.set('mercado_pago', status);
  return parsed.toString();
}

export function callbackMercadoPagoSeguro(params: URLSearchParams): {
  state: string;
  code: string | null;
  error: string | null;
} | null {
  for (const key of ['state', 'code', 'error']) {
    if (params.getAll(key).length > 1) return null;
  }
  const state = params.get('state') ?? '';
  const code = params.get('code') || null;
  const error = params.get('error') || null;
  if (!OAUTH_STATE_PATTERN.test(state) || (code && code.length > 4_000) || (error && error.length > 200)) return null;
  return { state, code, error };
}
