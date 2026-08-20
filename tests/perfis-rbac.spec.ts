import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type Role = 'admin' | 'medico' | 'recepcao' | 'enfermagem' | 'financeiro';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://gebygucrpipaufrlyqqj.supabase.co';
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0];

function anonKey(): string {
  if (process.env.VITE_SUPABASE_PUBLISHABLE_KEY) return process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (process.env.VITE_SUPABASE_ANON_KEY) return process.env.VITE_SUPABASE_ANON_KEY;
  try {
    return readFileSync('src/integrations/supabase/client.ts', 'utf8').match(/"(eyJ[A-Za-z0-9._-]+)"/)?.[1] ?? '';
  } catch { return ''; }
}

const ANON_KEY = anonKey();
const perfis: Array<{ role: Role; permitida: string; menu: string; negada: string }> = [
  { role: 'admin', permitida: '/configuracoes', menu: '/equipe', negada: '/painel-admin' },
  { role: 'medico', permitida: '/prontuarios', menu: '/documentos-clinicos', negada: '/financeiro' },
  { role: 'recepcao', permitida: '/pacientes', menu: '/recepcao', negada: '/prontuarios' },
  { role: 'enfermagem', permitida: '/mapa-coleta', menu: '/estoque', negada: '/financeiro' },
  { role: 'financeiro', permitida: '/financeiro', menu: '/contas', negada: '/pacientes' },
];

function credenciais(role: Role) {
  const prefixo = `E2E_${role.toUpperCase()}`;
  return { email: process.env[`${prefixo}_EMAIL`], senha: process.env[`${prefixo}_SENHA`] };
}

async function autenticar(request: APIRequestContext, role: Role) {
  const conta = credenciais(role);
  if (!conta.email || !conta.senha) throw new Error(`Credenciais E2E ausentes para ${role}`);
  const resposta = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    data: { email: conta.email, password: conta.senha },
  });
  expect(resposta.ok(), `login ${role}: ${await resposta.text()}`).toBe(true);
  return resposta.json();
}

async function instalarSessao(page: Page, session: unknown) {
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: `sb-${PROJECT_REF}-auth-token`, value: session },
  );
}

test.describe('RBAC real por perfil', () => {
  for (const perfil of perfis) {
    test(`${perfil.role}: login, menu, rota permitida e negativa cross-role`, async ({ page, request }) => {
      const conta = credenciais(perfil.role);
      test.skip(!conta.email || !conta.senha, `Defina E2E_${perfil.role.toUpperCase()}_EMAIL/SENHA com conta exclusiva de teste.`);
      const session = await autenticar(request, perfil.role);
      await instalarSessao(page, session);

      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(page.locator(`a[href="${perfil.menu}"]`).first()).toBeVisible();

      await page.goto(perfil.permitida);
      await expect(page.getByRole('heading', { name: 'Acesso Negado' })).toHaveCount(0);
      await expect(page).not.toHaveURL(/\/auth/);

      await page.goto(perfil.negada);
      if (perfil.negada === '/painel-admin') await expect(page).toHaveURL(/\/dashboard/);
      else await expect(page.getByRole('heading', { name: 'Acesso Negado' })).toBeVisible();
    });
  }
});

test.describe('Portal do paciente', () => {
  test('token real abre somente o portal correspondente', async ({ page }) => {
    const token = process.env.E2E_PACIENTE_TOKEN;
    test.skip(!token, 'Defina E2E_PACIENTE_TOKEN com token revogável de paciente de teste.');
    await page.goto(`/portal-paciente?token=${encodeURIComponent(token!)}`);
    await expect(page).toHaveURL(/\/portal-paciente/);
    await expect(page.getByText(/token inválido|acesso negado|erro ao acessar/i)).toHaveCount(0);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('token inválido não libera dados do paciente', async ({ page }) => {
    await page.goto('/portal-paciente?token=token-e2e-deliberadamente-invalido');
    await expect(page.getByText(/token inválido|inválido ou expirado|erro ao acessar/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /sair do portal/i })).toHaveCount(0);
  });
});
