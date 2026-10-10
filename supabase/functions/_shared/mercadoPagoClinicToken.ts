import { cifrar, decifrar } from './integracoes.ts';

const API_BASE = 'https://api.mercadopago.com';

type OAuthSecret = {
  access_token: string;
  refresh_token: string;
  mp_user_id: string;
  public_key?: string | null;
  token_expires_at?: string | null;
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshToken(refreshToken: string, expectedUserId: string): Promise<OAuthSecret> {
  const clientId = Deno.env.get('MERCADOPAGO_CLIENT_ID');
  const clientSecret = Deno.env.get('MERCADOPAGO_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('OAuth do Mercado Pago não está configurado.');
  const response = await fetch(`${API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Não foi possível renovar a autorização (HTTP ${response.status}).`);
  if (!body.access_token || !body.refresh_token || String(body.user_id) !== expectedUserId) {
    throw new Error('A renovação retornou dados de conta inválidos.');
  }
  const seconds = Number(body.expires_in);
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    mp_user_id: expectedUserId,
    public_key: typeof body.public_key === 'string' ? body.public_key : null,
    token_expires_at: Number.isFinite(seconds) && seconds > 0
      ? new Date(Date.now() + seconds * 1000).toISOString()
      : null,
  };
}

/** Recupera e renova a autorização OAuth da clínica, sem devolver segredos ao cliente. */
export async function accessTokenMercadoPagoClinica(service: any, clinicaId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const { data: row, error } = await service.from('integracoes_clinica')
      .select('id, status, config, segredo_cifrado')
      .eq('clinica_id', clinicaId).eq('provedor', 'mercado_pago').is('referencia_id', null)
      .maybeSingle();
    if (error) throw error;
    if (!row || row.status !== 'conectado' || !row.segredo_cifrado) return null;

    const secret = JSON.parse(await decifrar(row.segredo_cifrado)) as OAuthSecret;
    if (!secret.access_token || !secret.refresh_token || !secret.mp_user_id) {
      throw new Error('A autorização da conta Mercado Pago está incompleta.');
    }
    const expires = Date.parse(String(secret.token_expires_at ?? row.config?.token_expires_at ?? ''));
    if (!Number.isFinite(expires) || expires > Date.now() + 5 * 60_000) return secret.access_token;

    const lockId = crypto.randomUUID();
    const { data: acquired, error: lockError } = await service.rpc('claim_mercadopago_oauth_refresh_lock', {
      p_clinica_id: clinicaId,
      p_lock_id: lockId,
      p_lock_until: new Date(Date.now() + 30_000).toISOString(),
    });
    if (lockError) throw lockError;
    if (!acquired) {
      await delay(500);
      continue;
    }

    try {
      // Releia após obter o lock: outra execução pode ter atualizado enquanto
      // esta aguardava.
      const { data: latest, error: latestError } = await service.from('integracoes_clinica')
        .select('id, config, segredo_cifrado').eq('id', row.id).maybeSingle();
      if (latestError) throw latestError;
      if (!latest?.segredo_cifrado) return null;
      const latestSecret = JSON.parse(await decifrar(latest.segredo_cifrado)) as OAuthSecret;
      const latestExpires = Date.parse(String(latestSecret.token_expires_at ?? latest.config?.token_expires_at ?? ''));
      if (Number.isFinite(latestExpires) && latestExpires > Date.now() + 5 * 60_000) return latestSecret.access_token;

      const renewed = await refreshToken(latestSecret.refresh_token, latestSecret.mp_user_id);
      const config = { ...(latest.config ?? {}), token_expires_at: renewed.token_expires_at };
      const { data: saved, error: saveError } = await service.from('integracoes_clinica').update({
        segredo_cifrado: await cifrar(JSON.stringify(renewed)),
        config,
        updated_at: new Date().toISOString(),
        ultimo_erro: null,
      })
        .eq('id', latest.id)
        .eq('status', 'conectado')
        .eq('segredo_cifrado', latest.segredo_cifrado)
        .select('id')
        .maybeSingle();
      if (saveError) throw saveError;
      // A clínica pode desconectar enquanto o refresh está em andamento. A
      // atualização condicional impede que a rotação ressuscite credenciais.
      if (!saved) return null;
      return renewed.access_token;
    } finally {
      await service.rpc('release_mercadopago_oauth_refresh_lock', {
        p_clinica_id: clinicaId,
        p_lock_id: lockId,
      });
    }
  }
  throw new Error('A renovação da autorização está em andamento. Tente novamente em instantes.');
}
