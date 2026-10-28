import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { DEFAULT_LOCAL_SUPABASE_URL, resolveLocalQaSupabaseConfig } from '../scripts/test-supabase-env.ts';
import { PAPEIS, type Papel } from './fixtures/duasClinicas.ts';
import { decidirPortalEdge, sondarPortal } from './fixtures/portalEdge.ts';
import { configurarPonte, instalarPonteSupabase } from './fixtures/ponteSupabaseApp.ts';
import {
  decidirSkipDeConfiguracao,
  VARIAVEIS_BASE,
  variaveisAusentes,
} from './fixtures/suiteSeguranca.ts';

/**
 * RBAC por perfil e portal do paciente.
 *
 * Duas camadas:
 * 1. API (sempre que o Supabase local estiver configurado): cada conta do seed
 *    loga e o papel gravado em `user_roles` é exatamente o esperado. Não
 *    depende do app e roda já na fase 1 do job `security-e2e`.
 * 2. Interface: menu, rota permitida e rota negada. O app em `--mode test`
 *    usa uma chave sintética fixa (`vite.config.ts:152`, CLIN-QA-564), então
 *    a página passa pela ponte de `tests/fixtures/ponteSupabaseApp.ts`, que
 *    troca a chave pela do Supabase local antes de a requisição sair.
 *
 * Contas: `node tests/fixtures/seed-duas-clinicas.ts` grava QA_<PAPEL>_EMAIL/PASSWORD.
 */

type Role = Papel;
const QA_SUPABASE = resolveLocalQaSupabaseConfig(process.env);
const SUPABASE_URL = QA_SUPABASE?.url || DEFAULT_LOCAL_SUPABASE_URL;
const ANON_KEY = QA_SUPABASE?.anonKey || '';
// A sessão vai para a chave do localStorage que o supabase-js do app usa, que
// vem da URL do bundle (127.0.0.1) e não de QA_SUPABASE_URL.
const PONTE = configurarPonte(process.env);

const perfis: Array<{ role: Role; permitida: string; menu: string; menuLabel: string; negada: string }> = [
  { role: 'admin', permitida: '/configuracoes', menu: '/equipe', menuLabel: 'Equipe', negada: '/painel-admin' },
  { role: 'medico', permitida: '/prontuarios', menu: '/documentos-clinicos', menuLabel: 'Documentos Clínicos', negada: '/financeiro' },
  { role: 'recepcao', permitida: '/pacientes', menu: '/recepcao', menuLabel: 'Recepção', negada: '/prontuarios' },
  { role: 'enfermagem', permitida: '/mapa-coleta', menu: '/estoque', menuLabel: 'Estoque', negada: '/financeiro' },
  { role: 'financeiro', permitida: '/financeiro', menu: '/contas', menuLabel: 'Contas', negada: '/pacientes' },
];

function variaveisDoPapel(role: Role) {
  const prefixo = `QA_${role.toUpperCase()}`;
  return [`${prefixo}_EMAIL`, `${prefixo}_PASSWORD`];
}

function credenciais(role: Role) {
  const [email, senha] = variaveisDoPapel(role);
  return { email: process.env[email], senha: process.env[senha] };
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

async function ligarPonte(page: Page) {
  if (!PONTE) throw new Error('Ponte do Supabase sem configuração: rode exigirConfiguracao antes.');
  await instalarPonteSupabase(page, PONTE);
}

async function instalarSessao(page: Page, session: unknown) {
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: PONTE!.chaveSessao, value: session },
  );
}

function exigirConfiguracao(contexto: string, extras: string[] = []) {
  const motivo = decidirSkipDeConfiguracao(contexto, variaveisAusentes([...VARIAVEIS_BASE, ...extras]));
  test.skip(Boolean(motivo), motivo ?? '');
}

// Sem teste estático aqui de propósito: ele contaria como "executado" e o gate
// de skip deixaria de detectar a suíte inteira pulada.
if (perfis.map((p) => p.role).sort().join() !== [...PAPEIS].sort().join()) {
  throw new Error('perfis-rbac.spec.ts: a tabela de perfis não cobre exatamente os papéis do seed.');
}

test.describe('RBAC por perfil — API', () => {
  for (const perfil of perfis) {
    test(`${perfil.role}: login e papel exato em user_roles`, async ({ request }) => {
      exigirConfiguracao(`RBAC ${perfil.role}`, variaveisDoPapel(perfil.role));
      const session = await autenticar(request, perfil.role);
      const resposta = await request.get(
        `${SUPABASE_URL}/rest/v1/user_roles?select=role&user_id=eq.${session.user.id}`,
        { headers: { apikey: ANON_KEY, Authorization: `Bearer ${session.access_token}` } },
      );
      expect(resposta.ok(), await resposta.text()).toBe(true);
      const papeis = (await resposta.json()).map((linha: { role: string }) => linha.role);
      // Exatamente um papel: um seed que desse "admin" a todos faria a suíte
      // de interface passar em toda rota negada sem provar nada.
      expect(papeis, `papéis da conta ${perfil.role}`).toEqual([perfil.role]);
    });
  }
});

test.describe('RBAC real por perfil — interface', () => {
  for (const perfil of perfis) {
    test(`${perfil.role}: login, menu, rota permitida e negativa cross-role`, async ({ page, request }) => {
      exigirConfiguracao(`RBAC UI ${perfil.role}`, variaveisDoPapel(perfil.role));
      const session = await autenticar(request, perfil.role);
      await ligarPonte(page);
      await instalarSessao(page, session);

      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/dashboard/);
      const buscaMenu = page.getByPlaceholder('Buscar...').first();
      await expect(buscaMenu).toBeVisible({ timeout: 15_000 });
      await buscaMenu.fill(perfil.menuLabel);
      await expect(page.locator(`a[href="${perfil.menu}"]`).first()).toBeVisible({ timeout: 10_000 });

      await page.goto(perfil.permitida);
      await expect(page.getByRole('heading', { name: 'Acesso Negado' })).toHaveCount(0);
      await expect(page).not.toHaveURL(/\/auth/);

      await page.goto(perfil.negada);
      if (perfil.negada === '/painel-admin') await expect(page).toHaveURL(/\/dashboard/);
      else await expect(page.getByRole('heading', { name: 'Acesso Negado' })).toBeVisible();
    });
  }
});

// O portal lê pela edge function `patient-portal`, que só usa o banco local.
// Ela tem variável própria (QA_PORTAL_EDGE_LOCAL, ver tests/fixtures/portalEdge.ts),
// separada do stub de WhatsApp/IA: no CI, sem ela, é falha e não skip.
test.describe('Portal do paciente', () => {
  test.beforeEach(() => {
    exigirConfiguracao('Portal do paciente', ['QA_E2E_PACIENTE_TOKEN', 'QA_E2E_PACIENTE_NOME']);
    const motivo = decidirPortalEdge(process.env);
    test.skip(Boolean(motivo), motivo ?? '');
  });

  test.beforeEach(async () => {
    // Função não servida faria o teste do token inválido passar por engano
    // (a tela de erro aparece igual); a sonda separa as duas situações.
    const sonda = await sondarPortal(SUPABASE_URL, ANON_KEY);
    expect(sonda.ok, sonda.motivo ?? '').toBe(true);
  });

  test.beforeEach(async ({ page }) => {
    await ligarPonte(page);
  });

  test('token real abre somente o portal correspondente', async ({ page }) => {
    const token = process.env.QA_E2E_PACIENTE_TOKEN!;
    await page.goto(`/portal-paciente?token=${encodeURIComponent(token)}`);
    await expect(page).toHaveURL(/\/portal-paciente/);
    await expect(page.getByText(/token inválido|acesso negado|erro ao acessar/i)).toHaveCount(0);
    // Antes bastava a página não estar vazia; uma tela de erro genérica passava.
    await expect(page.getByText(process.env.QA_E2E_PACIENTE_NOME!).first()).toBeVisible({ timeout: 15_000 });
  });

  test('token inválido não libera dados do paciente', async ({ page }) => {
    await page.goto('/portal-paciente?token=token-e2e-deliberadamente-invalido');
    await expect(page.getByText(/token inválido|inválido ou expirado|erro ao acessar/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /sair do portal/i })).toHaveCount(0);
    await expect(page.getByText(process.env.QA_E2E_PACIENTE_NOME!)).toHaveCount(0);
  });
});
