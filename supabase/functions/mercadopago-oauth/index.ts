import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsPadrao } from '../_shared/cors.ts';
import { cifrar, decifrar } from '../_shared/integracoes.ts';

const MP_AUTH_URL = 'https://auth.mercadopago.com/authorization';
const MP_TOKEN_URL = 'https://api.mercadopago.com/oauth/token';
const MP_USER_URL = 'https://api.mercadopago.com/users/me';
const DEFAULT_REDIRECT_URI = 'https://api.elolab.com.br/functions/v1/mercadopago-oauth';
const APP_RETURN_URL = 'https://app.elolab.com.br/configuracoes';
const PROVIDER = 'mercado_pago';

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  user_id?: number | string;
  expires_in?: number;
  public_key?: string;
  live_mode?: boolean;
  scope?: string;
  token_type?: string;
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

function redirect(status: 'conectado' | 'cancelado' | 'erro') {
  const destination = new URL(APP_RETURN_URL);
  destination.searchParams.set('tab', 'integracoes');
  destination.searchParams.set('mercado_pago', status);
  return new Response(null, {
    status: 302,
    headers: {
      Location: destination.toString(),
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function mpJson(url: string, init: RequestInit): Promise<any> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Mercado Pago respondeu HTTP ${response.status}`);
  return body;
}

function clientCredentials() {
  const clientId = Deno.env.get('MERCADOPAGO_CLIENT_ID');
  const clientSecret = Deno.env.get('MERCADOPAGO_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('OAuth do Mercado Pago não está configurado.');
  return { clientId, clientSecret };
}

function redirectUri() {
  const value = Deno.env.get('MERCADOPAGO_OAUTH_REDIRECT_URI') || DEFAULT_REDIRECT_URI;
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.search || parsed.hash) {
    throw new Error('A URL de retorno OAuth precisa ser HTTPS, fixa e sem parâmetros.');
  }
  return parsed.toString();
}

async function consumeState(service: any, state: string) {
  const hash = await sha256Hex(state);
  const { data, error } = await service.from('mercadopago_oauth_states')
    .delete()
    .eq('state_hash', hash)
    .gt('expires_at', new Date().toISOString())
    .select('clinica_id, user_id, code_verifier_cifrado')
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function saveConnection(service: any, clinicaId: string, userId: string, config: Record<string, unknown>, secret: Record<string, unknown>) {
  const now = new Date().toISOString();
  const row = {
    clinica_id: clinicaId,
    provedor: PROVIDER,
    referencia_id: null,
    status: 'conectado',
    config,
    segredo_cifrado: await cifrar(JSON.stringify(secret)),
    segredo_dica: null,
    ultimo_erro: null,
    conectado_por: userId,
    conectado_em: now,
    updated_at: now,
  };
  const { data: existing, error: findError } = await service.from('integracoes_clinica')
    .select('id').eq('clinica_id', clinicaId).eq('provedor', PROVIDER).is('referencia_id', null).maybeSingle();
  if (findError) throw findError;
  const result = existing
    ? await service.from('integracoes_clinica').update(row).eq('id', existing.id).select('id').maybeSingle()
    : await service.from('integracoes_clinica').insert(row).select('id').maybeSingle();
  if (result.error?.code === '23505' && !existing) {
    const { data: raced, error } = await service.from('integracoes_clinica')
      .select('id').eq('clinica_id', clinicaId).eq('provedor', PROVIDER).is('referencia_id', null).maybeSingle();
    if (error || !raced) throw error ?? result.error;
    const retried = await service.from('integracoes_clinica').update(row).eq('id', raced.id).select('id').maybeSingle();
    if (retried.error || !retried.data) throw retried.error ?? new Error('Não foi possível salvar a conexão.');
  } else if (result.error || !result.data) {
    throw result.error ?? new Error('Não foi possível salvar a conexão.');
  }
}

Deno.serve(async (req) => {
  const corsHeaders = corsPadrao(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return req.method === 'GET' ? redirect('erro') : json({ error: 'Serviço indisponível.' }, 503, corsHeaders);
  const service = createClient(supabaseUrl, serviceKey);

  // Callback do Mercado Pago. O state de uso único vincula o retorno à clínica
  // e ao administrador que iniciou o consentimento.
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const state = url.searchParams.get('state') || '';
    const code = url.searchParams.get('code') || '';
    const oauthError = url.searchParams.get('error');
    if (!state || state.length > 200) return redirect(oauthError ? 'cancelado' : 'erro');
    try {
      const oauthState = await consumeState(service, state);
      if (!oauthState) return redirect('erro');
      if (oauthError || !code || code.length > 4000) return redirect('cancelado');

      const verifier = await decifrar(oauthState.code_verifier_cifrado);
      const { clientId, clientSecret } = clientCredentials();
      const redirectUriValue = redirectUri();
      const token: TokenResponse = await mpJson(MP_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUriValue,
          code_verifier: verifier,
        }),
      });
      if (!token.access_token || !token.refresh_token || !token.user_id) throw new Error('Resposta OAuth incompleta.');

      const mpUser = await mpJson(MP_USER_URL, {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (String(mpUser.id) !== String(token.user_id)) throw new Error('A conta autorizada não corresponde ao retorno OAuth.');

      const expiresIn = Number(token.expires_in);
      const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null;
      const config = {
        mp_user_id: String(mpUser.id),
        nickname: typeof mpUser.nickname === 'string' ? mpUser.nickname.slice(0, 120) : null,
        site_id: typeof mpUser.site_id === 'string' ? mpUser.site_id : null,
        live_mode: token.live_mode === true,
        token_expires_at: expiresAt,
        scopes: typeof token.scope === 'string' ? token.scope.slice(0, 500) : null,
      };
      await saveConnection(service, oauthState.clinica_id, oauthState.user_id, config, {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        public_key: token.public_key ?? null,
        token_expires_at: expiresAt,
        mp_user_id: String(mpUser.id),
      });
      await service.from('audit_log').insert({
        action: 'update', collection: 'integracoes_clinica',
        record_id: `${PROVIDER}:clinica`, record_name: 'Conta Mercado Pago conectada via OAuth',
        user_id: oauthState.user_id, clinica_id: oauthState.clinica_id,
      });
      return redirect('conectado');
    } catch (error) {
      console.error('[mercadopago-oauth] callback falhou:', error instanceof Error ? error.message : 'erro');
      return redirect('erro');
    }
  }

  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405, corsHeaders);
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Faça login para conectar a conta.' }, 401, corsHeaders);
    const [{ data: profile }, { data: role }] = await Promise.all([
      service.from('profiles').select('clinica_id').eq('id', user.id).maybeSingle(),
      service.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle(),
    ]);
    const clinicId = profile?.clinica_id;
    if (!clinicId || !role) return json({ error: 'Somente o administrador da clínica pode conectar a conta.' }, 403, corsHeaders);

    const { clientId } = clientCredentials();
    const redirectUriValue = redirectUri();
    const requestState = base64Url(crypto.getRandomValues(new Uint8Array(32)));
    const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const stateHash = await sha256Hex(requestState);
    const { error } = await service.from('mercadopago_oauth_states').insert({
      state_hash: stateHash,
      clinica_id: clinicId,
      user_id: user.id,
      code_verifier_cifrado: await cifrar(verifier),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (error) throw error;
    await service.from('mercadopago_oauth_states').delete().lt('expires_at', new Date().toISOString());

    const authorize = new URL(MP_AUTH_URL);
    authorize.searchParams.set('client_id', clientId);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('platform_id', 'mp');
    authorize.searchParams.set('state', requestState);
    authorize.searchParams.set('redirect_uri', redirectUriValue);
    authorize.searchParams.set('code_challenge', challenge);
    authorize.searchParams.set('code_challenge_method', 'S256');
    return json({ authorization_url: authorize.toString() }, 200, corsHeaders);
  } catch (error) {
    console.error('[mercadopago-oauth] início falhou:', error instanceof Error ? error.message : 'erro');
    if (String(error).includes('INTEGRACOES_CHAVE_CRIPTO')) {
      return json({ error: 'A conexão segura ainda está sendo preparada.' }, 503, corsHeaders);
    }
    return json({ error: 'Não foi possível iniciar a conexão com o Mercado Pago.' }, 500, corsHeaders);
  }
});
