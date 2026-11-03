import { beforeAll, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { autenticarTokenPortal, perfilPublicoPortal, hashPortalToken } from '../../../supabase/functions/_shared/portalSecurity';
beforeAll(() => vi.stubGlobal('crypto', webcrypto));

it('token legado recebe 401; hash válido preserva o acesso existente', async () => {
  const raw = 'a'.repeat(64);
  const hash = await hashPortalToken(raw);
  const lookup = async (value: string) => value === raw ? { id: 'legado' } : null;
  expect((await autenticarTokenPortal(raw, lookup)).status).toBe(401);
  expect(await autenticarTokenPortal(raw, async value => value === hash ? { id: 'atual' } : null))
    .toMatchObject({ status: 200, tokenData: { id: 'atual' } });
});

it('perfil público usa lista permitida e mascara CPF no servidor', () => {
  expect(perfilPublicoPortal({ id: 'p', nome: 'Ana', cpf: '123.456.789-09', observacoes: 'privado', interno: true }))
    .toEqual({ id: 'p', nome: 'Ana', cpf: '***.***.***-09' });
  expect(perfilPublicoPortal({ cpf: null }).cpf).toBeNull();
  expect(perfilPublicoPortal({ cpf: '123' }).cpf).toBeNull();
});

describe('segurança do perfil e credencial do portal', () => {
  const edge = readFileSync('supabase/functions/patient-portal/index.ts', 'utf8');
  it('não busca observações internas na ficha do portal', () => {
    expect(edge).not.toMatch(/alergias, observacoes/);
  });
  it('não consulta token legado em texto puro', () => {
    expect(edge).not.toContain('.eq("token", String(token))');
  });
});
