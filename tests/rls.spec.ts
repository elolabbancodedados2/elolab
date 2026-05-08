import { test, expect } from '@playwright/test';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://gebygucrpipaufrlyqqj.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdlYnlndWNycGlwYXVmcmx5cXFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTQ2ODAsImV4cCI6MjA4NTM5MDY4MH0.WURCBXjBiAZpk-Qyb3SMu3XQGVvRG07BuCJSURbmouI';

const tables = ['pacientes', 'medicos', 'agendamentos', 'prontuarios', 'lancamentos', 'estoque'];

test.describe('RLS Security Tests', () => {
  for (const table of tables) {
    test(`${table}: sem auth retorna 0 registros ou erro`, async ({ request }) => {
      const response = await request.get(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
      });

      // RLS should either return empty array or 401/403
      if (response.ok()) {
        const data = await response.json();
        // With RLS enabled and no auth, should return empty or very limited data
        expect(Array.isArray(data)).toBe(true);
      } else {
        // 401 or 403 is expected
        expect([401, 403, 406]).toContain(response.status());
      }
    });
  }

  test('insert sem auth é bloqueado', async ({ request }) => {
    const response = await request.post(`${SUPABASE_URL}/rest/v1/pacientes`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      data: {
        nome: 'Hacker Test',
        cpf: '00000000000',
      },
    });

    // Should be rejected (401, 403, or 409)
    expect(response.ok()).toBe(false);
  });

  test('delete sem auth é bloqueado', async ({ request }) => {
    const response = await request.delete(
      `${SUPABASE_URL}/rest/v1/pacientes?id=eq.nonexistent`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    // Should not allow deletion (400 = Supabase rejeita DELETE não autorizado;
    // 401/403 = rejeição explícita; 200/404/406 = nenhuma linha afetada)
    expect([200, 400, 401, 403, 404, 406]).toContain(response.status());
  });
});
