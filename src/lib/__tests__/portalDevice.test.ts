import { beforeAll, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { assinarAparelhoPortal, verificarAparelhoPortal, bloqueioPortalAtivo } from '../../../supabase/functions/_shared/portalDevice';
beforeAll(() => vi.stubGlobal('crypto', webcrypto));
const now = Date.parse('2026-11-03T12:00:00Z');
it('lembra aparelho com assinatura vinculada ao token e prazo', async () => {
  const proof = await assinarAparelhoPortal('token-id', now + 1000, 'segredo-teste');
  expect(await verificarAparelhoPortal(proof, 'token-id', 'segredo-teste', now)).toBe(true);
  expect(await verificarAparelhoPortal(proof, 'outro-token', 'segredo-teste', now)).toBe(false);
  expect(await verificarAparelhoPortal(proof, 'token-id', 'outro-segredo', now)).toBe(false);
  expect(await verificarAparelhoPortal(proof, 'token-id', 'segredo-teste', now + 1000)).toBe(false);
  expect(await verificarAparelhoPortal(proof + '0', 'token-id', 'segredo-teste', now)).toBe(false);
});
it('respeita bloqueio persistido até o instante de expiração', () => {
  const blockedUntil = new Date(now + 15 * 60_000).toISOString();
  expect(bloqueioPortalAtivo(blockedUntil, now)).toBe(true);
  expect(bloqueioPortalAtivo(blockedUntil, now + 15 * 60_000)).toBe(false);
  expect(bloqueioPortalAtivo(null, now)).toBe(false);
});
