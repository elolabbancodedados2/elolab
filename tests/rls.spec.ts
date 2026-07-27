import { test, expect } from '@playwright/test';

/**
 * Testes de RLS contra a API REST do Supabase usando apenas a chave anon.
 *
 * A versão anterior destes testes aceitava qualquer HTTP 200 desde que o corpo
 * fosse um array — ou seja, um vazamento total de dados passaria. Agora exigimos
 * explicitamente ZERO linhas para quem não está autenticado.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://gebygucrpipaufrlyqqj.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

/** Tabelas que jamais podem devolver linhas para um visitante anônimo. */
const PRIVATE_TABLES = [
  'pacientes',
  'medicos',
  'agendamentos',
  'prontuarios',
  'prescricoes',
  'atestados',
  'exames',
  'lancamentos',
  'estoque',
  'funcionarios',
  'profiles',
  'user_roles',
  'employee_invitations',
  'registros_pendentes',
  'audit_log',
];

test.beforeAll(() => {
  test.skip(!SUPABASE_ANON_KEY, 'VITE_SUPABASE_PUBLISHABLE_KEY não configurada');
});

test.describe('RLS — leitura anônima', () => {
  for (const table of PRIVATE_TABLES) {
    test(`${table}: anônimo não lê nenhuma linha`, async ({ request }) => {
      const response = await request.get(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=5`, {
        headers,
      });

      if (response.ok()) {
        const data = await response.json();
        expect(Array.isArray(data), `${table} deveria devolver um array`).toBe(true);
        expect(data, `VAZAMENTO: ${table} devolveu ${data.length} linha(s) para anônimo`).toHaveLength(0);
      } else {
        // Erro explícito também é aceitável (401/403/404/406)
        expect([401, 403, 404, 406]).toContain(response.status());
      }
    });
  }
});

test.describe('RLS — escrita anônima', () => {
  test('insert de paciente é bloqueado', async ({ request }) => {
    const response = await request.post(`${SUPABASE_URL}/rest/v1/pacientes`, {
      headers: { ...headers, Prefer: 'return=representation' },
      data: { nome: 'RLS Test — deve falhar', cpf: '00000000000' },
    });

    expect(response.ok(), 'anônimo conseguiu inserir paciente').toBe(false);
  });

  test('update de paciente não afeta linhas', async ({ request }) => {
    const response = await request.patch(`${SUPABASE_URL}/rest/v1/pacientes?nome=neq.`, {
      headers: { ...headers, Prefer: 'return=representation' },
      data: { observacoes: 'rls-test' },
    });

    if (response.ok()) {
      const data = await response.json();
      expect(data, 'anônimo alterou linhas de pacientes').toHaveLength(0);
    } else {
      expect([401, 403, 404, 405, 406]).toContain(response.status());
    }
  });

  test('delete de paciente não remove linhas', async ({ request }) => {
    const response = await request.delete(`${SUPABASE_URL}/rest/v1/pacientes?nome=neq.`, {
      headers: { ...headers, Prefer: 'return=representation' },
    });

    if (response.ok()) {
      const data = await response.json();
      expect(data, 'anônimo removeu linhas de pacientes').toHaveLength(0);
    } else {
      expect([401, 403, 404, 405, 406]).toContain(response.status());
    }
  });
});

test.describe('RLS — catálogo público', () => {
  test('planos ativos continuam visíveis (página de preços)', async ({ request }) => {
    const response = await request.get(`${SUPABASE_URL}/rest/v1/planos?select=id,nome,ativo`, {
      headers,
    });
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    // Se algum plano vier, precisa estar ativo — inativos não devem vazar.
    for (const plano of data) {
      expect(plano.ativo).toBe(true);
    }
  });
});
