export type MercadoPagoConnectionResult =
  | { healthy: true; code: 'ok' }
  | { healthy: false; code: 'credential_rejected' | 'identity_mismatch' | 'provider_unavailable' };

/** Confirma a identidade da conta vinculada sem criar ou alterar recursos. */
export async function testarConexaoMercadoPago(
  accessToken: string,
  expectedSellerId: string,
  fetcher: typeof fetch = fetch,
): Promise<MercadoPagoConnectionResult> {
  try {
    const response = await fetcher('https://api.mercadopago.com/users/me', {
      method: 'GET',
      headers: { accept: 'application/json', Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(6_000),
    });
    if (response.status === 401 || response.status === 403) {
      return { healthy: false, code: 'credential_rejected' };
    }
    if (!response.ok) return { healthy: false, code: 'provider_unavailable' };

    const account = await response.json().catch(() => null) as { id?: string | number } | null;
    if (!account || !expectedSellerId || String(account.id ?? '') !== expectedSellerId) {
      return { healthy: false, code: 'identity_mismatch' };
    }
    return { healthy: true, code: 'ok' };
  } catch {
    return { healthy: false, code: 'provider_unavailable' };
  }
}
