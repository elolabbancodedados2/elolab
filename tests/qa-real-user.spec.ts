import { expect, test } from '@playwright/test';

const emailAdmin = process.env.E2E_ADMIN_EMAIL || '';
const senhaAdmin = process.env.E2E_ADMIN_SENHA || '';

const rotasPrincipais = [
  '/dashboard', '/agenda', '/fila', '/recepcao', '/gestao-fluxo', '/notificacoes',
  '/pacientes', '/retornos', '/convenios', '/prontuarios', '/documentos-clinicos',
  '/exames', '/laboratorio', '/mapa-coleta', '/guias-externas', '/laudos-lab',
  '/financeiro', '/contas', '/fluxo-caixa', '/precos-servicos', '/relatorios',
  '/faturamento-convenios', '/repasses-medicos', '/equipe', '/estoque', '/tarefas',
  '/todos-templates', '/analytics', '/configuracoes', '/onboarding', '/planos',
  '/configuracoes-avancadas', '/automacoes', '/suporte', '/seguranca',
  '/lgpd-pacientes', '/vitais-graficos', '/analise-preditiva', '/chat',
  '/preferencias', '/meu-historico', '/treinamento', '/feedback',
];

test.describe('QA — jornada real, sem criar dados', () => {
  test('cadastro de cliente não pede código de convite e mostra os campos essenciais', async ({ page }) => {
    await page.goto('/auth?cadastro=1&plano=elolab-ultra&modo=trial');
    await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible();
    await expect(page.getByLabel('Nome completo')).toBeVisible();
    await expect(page.getByLabel('E-mail')).toBeVisible();
    await expect(page.getByLabel('Telefone (opcional)')).toBeVisible();
    await expect(page.getByLabel('CPF ou CNPJ (opcional)')).toBeVisible();
    await expect(page.getByLabel('Senha', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Confirmar senha')).toBeVisible();
    await expect(page.getByText(/convite da equipe é enviado separadamente/i)).toBeVisible();
    await expect(page.getByLabel(/código de convite/i)).toHaveCount(0);
  });

  test('valida campos vazios sem chamar o serviço de login', async ({ page }) => {
    await page.goto('/auth');
    await page.locator('form').getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByText('Informe seu e-mail.')).toBeVisible();
    await expect(page.getByText('Informe sua senha.')).toBeVisible();
    await expect(page).toHaveURL(/\/auth/);
  });

  test('apresenta o formulário de recuperação sem disparar e-mail', async ({ page }) => {
    await page.goto('/redefinir-senha');
    await expect(page.getByRole('heading', { name: 'Redefinir senha' })).toBeVisible();
    await expect(page.getByLabel('E-mail')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar link' })).toBeVisible();
  });

  test('entra pela tela de login e carrega os módulos principais com perfil de clínica', async ({ page }) => {
    test.skip(
      process.env.QA_DEDICATED_CLINIC !== '1',
      'O login de ponta a ponta exige uma clínica exclusiva de QA, nunca uma conta de produção comum.',
    );
    test.skip(!emailAdmin || !senhaAdmin, 'O agente exige uma conta admin exclusiva da clínica de QA.');
    const excecoes: string[] = [];
    page.on('pageerror', (error) => excecoes.push(error.message));

    await page.goto('/auth');
    await page.getByLabel('E-mail').fill(emailAdmin);
    await page.getByLabel('Senha', { exact: true }).fill(senhaAdmin);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByPlaceholder('Buscar...').first()).toBeVisible({ timeout: 15_000 });

    for (const rota of rotasPrincipais) {
      const errosAntes = excecoes.length;
      const response = await page.goto(rota, { waitUntil: 'domcontentloaded' });
      expect.soft(response?.status(), `${rota}: resposta do servidor`).toBeLessThan(500);
      await expect.poll(async () => (await page.locator('body').innerText()).trim().length, {
        message: `${rota}: tela sem conteúdo`, timeout: 12_000,
      }).toBeGreaterThan(20);
      expect.soft(new URL(page.url()).pathname, `${rota}: voltou para o login`).not.toBe('/auth');
      expect.soft(excecoes.slice(errosAntes), `${rota}: erro ao abrir o módulo`).toHaveLength(0);
    }
  });
});
