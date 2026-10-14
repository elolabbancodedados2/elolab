import { clinicaAdminDoChamador } from './cronAuth.ts';

function requestFor(sub: string) {
  const payload = btoa(JSON.stringify({ role: 'authenticated', sub }));
  return new Request('https://local.test/function', {
    headers: { Authorization: `Bearer header.${payload}.signature` },
  });
}

function dbMock(profile: { clinica_id: string | null; ativo: boolean } | null, role: string | null = 'admin') {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                in() {
                  return { limit: () => ({ maybeSingle: async () => ({ data: role ? { role } : null, error: null }) }) };
                },
                maybeSingle: async () => ({ data: table === 'profiles' ? profile : null, error: null }),
              };
            },
          };
        },
      };
    },
  } as never;
}

Deno.test('cron manual nega usuário administrador inativo', async () => {
  const clinic = await clinicaAdminDoChamador(requestFor('inactive-user'), dbMock({ clinica_id: 'clinic-a', ativo: false }));
  if (clinic !== null) throw new Error('Perfil inativo recebeu autorização para executar automação.');
});

Deno.test('cron manual mantém administrador ativo restrito à própria clínica', async () => {
  const clinic = await clinicaAdminDoChamador(requestFor('active-user'), dbMock({ clinica_id: 'clinic-a', ativo: true }));
  if (clinic !== 'clinic-a') throw new Error('Administrador ativo não recebeu o escopo da própria clínica.');
});

Deno.test('cron manual nega falha ou ausência de vínculo de clínica', async () => {
  const clinic = await clinicaAdminDoChamador(requestFor('orphan-user'), dbMock(null));
  if (clinic !== null) throw new Error('Usuário sem vínculo recebeu escopo global.');
});
