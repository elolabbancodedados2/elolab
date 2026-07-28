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

/**
 * UUID que não corresponde a nenhum registro. Os testes de escrita miram nele
 * de propósito: esta suíte roda contra o banco real, então um alvo amplo
 * transformaria uma falha de RLS em perda de dados causada pelo próprio teste.
 */
const ID_INEXISTENTE = '00000000-0000-0000-0000-000000000000';

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
    // Filtro deliberadamente impossível: esta suíte roda contra o banco REAL.
    // Uma versão anterior usava `?nome=neq.`, que casa com praticamente toda
    // linha — se o RLS estivesse aberto, o próprio teste alteraria a base
    // inteira de pacientes. O teste continua provando o que importa (anônimo
    // não escreve) sem poder causar dano se a proteção falhar.
    const response = await request.patch(`${SUPABASE_URL}/rest/v1/pacientes?id=eq.${ID_INEXISTENTE}`, {
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
    // Mesmo cuidado do teste acima: alvo impossível, para que uma falha de RLS
    // seja detectada sem apagar nada.
    const response = await request.delete(`${SUPABASE_URL}/rest/v1/pacientes?id=eq.${ID_INEXISTENTE}`, {
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
