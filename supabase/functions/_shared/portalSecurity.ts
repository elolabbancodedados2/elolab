/** Somente estes campos podem sair da ficha pelo portal. */
export function perfilPublicoPortal(profile: Record<string, unknown>) {
  const allowed = ['id', 'nome', 'nome_social', 'email', 'telefone', 'foto_url', 'data_nascimento', 'sexo', 'alergias', 'clinica_id'];
  const result: Record<string, unknown> = {};
  for (const key of allowed) if (key in profile) result[key] = profile[key];
  const digits = String(profile.cpf ?? '').replace(/\D/g, '');
  result.cpf = digits.length === 11 ? `***.***.***-${digits.slice(-2)}` : null;
  return result;
}

export async function hashPortalToken(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function autenticarTokenPortal<T>(raw: unknown, findByHash: (hash: string) => Promise<T | null>) {
  if (typeof raw !== 'string' || !/^[a-f0-9]{64}$/i.test(raw)) return { status: 401 as const, tokenData: null };
  const tokenData = await findByHash(await hashPortalToken(raw));
  return tokenData ? { status: 200 as const, tokenData } : { status: 401 as const, tokenData: null };
}
