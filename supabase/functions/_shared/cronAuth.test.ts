import { describe, expect, it } from 'vitest';
import { clinicaAdminDoChamador, usuarioTemAlgumPapel } from './cronAuth';

function requestFor(role: string, sub: string) {
  const payload = btoa(JSON.stringify({ role, sub }));
  return new Request('https://local.test/function', {
    headers: { Authorization: `Bearer header.${payload}.signature` },
  });
}

function supabaseMock(options: { clinic?: string | null; role?: string | null; error?: boolean } = {}) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            limit: () => ({ maybeSingle: async () => ({ data: options.role ? { role: options.role } : null, error: options.error ? new Error('denied') : null }) }),
          }),
          maybeSingle: async () => ({ data: options.clinic ? { clinica_id: options.clinic } : null, error: null }),
        }),
      }),
    }),
  } as any;
}

describe('autorização das execuções manuais de automação', () => {
  it('exige papel administrativo, além do JWT autenticado', async () => {
    expect(await usuarioTemAlgumPapel(requestFor('authenticated', 'user-1'), supabaseMock({ role: 'admin' }), ['admin'])).toBe(true);
    expect(await usuarioTemAlgumPapel(requestFor('authenticated', 'user-1'), supabaseMock({ role: 'medico' }), ['admin'])).toBe(false);
    expect(await usuarioTemAlgumPapel(requestFor('authenticated', 'user-1'), supabaseMock({ role: 'admin', error: true }), ['admin'])).toBe(false);
  });

  it('retorna a clínica somente para administrador autenticado vinculado', async () => {
    const req = requestFor('authenticated', 'user-1');
    expect(await clinicaAdminDoChamador(req, supabaseMock({ clinic: 'clinic-1', role: 'admin' }))).toBe('clinic-1');
    expect(await clinicaAdminDoChamador(req, supabaseMock({ clinic: 'clinic-1', role: 'recepcao' }))).toBeNull();
    expect(await clinicaAdminDoChamador(req, supabaseMock({ role: 'admin' }))).toBeNull();
  });
});
