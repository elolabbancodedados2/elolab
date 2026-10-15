import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
test.describe.configure({ retries: 0 });

const ROLE_MATRIX = [
  {
    role: 'recepcao',
    allowed: ['/agenda', '/pacientes', '/fila', '/recepcao', '/gestao-fluxo', '/tarefas', '/analise-preditiva'],
    denied: ['/prontuarios', '/estoque', '/financeiro', '/configuracoes'],
  },
  {
    role: 'medico',
    allowed: ['/agenda', '/fila', '/prontuarios', '/documentos-clinicos', '/exames', '/laboratorio', '/vitais-graficos', '/tarefas'],
    denied: ['/pacientes', '/recepcao', '/estoque', '/financeiro', '/configuracoes'],
  },
  {
    role: 'enfermagem',
    allowed: ['/agenda', '/pacientes', '/fila', '/estoque', '/exames', '/laboratorio', '/mapa-coleta', '/vitais-graficos', '/tarefas'],
    denied: ['/prontuarios', '/recepcao', '/financeiro', '/configuracoes'],
  },
  {
    role: 'financeiro',
    allowed: ['/recepcao', '/convenios', '/financeiro', '/contas', '/faturamento-convenios', '/repasses-medicos', '/tarefas', '/suporte'],
    denied: ['/agenda', '/pacientes', '/fila', '/prontuarios', '/estoque', '/configuracoes'],
  },
] as const;

for (const profile of ROLE_MATRIX) {
  test(`role ${profile.role} sees allowed screens and is denied restricted screens`, async ({ page }) => {
    test.setTimeout(45_000);
    await installSyntheticClinic(page, { role: profile.role, platformAdmin: false });
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard');
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 5_000 });

    for (const route of profile.allowed) {
      const errorsBefore = pageErrors.length;
      await page.evaluate(path => {
        window.history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, route);
      await page.waitForTimeout(300);
      const text = await page.locator('body').innerText();
      const heading = page.locator('#main-content h1').first();
      expect(text, `${profile.role} should open ${route}`).not.toContain('Acesso Negado');
      await expect(heading, `${profile.role} should see a title on ${route}`).toBeVisible({ timeout: 1_500 });
      expect(pageErrors.slice(errorsBefore), `${route} JavaScript errors`).toEqual([]);
    }

    for (const route of profile.denied) {
      await page.evaluate(path => {
        window.history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, route);
      await page.waitForTimeout(300);
      await expect(page.getByRole('heading', { name: 'Acesso Negado' }), `${profile.role} should be denied ${route}`).toBeVisible({ timeout: 1_500 });
    }
  });
}

test('clinic admin cannot open platform-only screens', async ({ page }) => {
  await installSyntheticClinic(page, { role: 'admin', platformAdmin: false });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dashboard');
  await page.evaluate(() => {
    window.history.pushState({}, '', '/admin/clinicas');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 3_000 }).toBe('/dashboard');
});

test('global search is accent-insensitive and limits destinations to the active role', async ({ page }) => {
  await installSyntheticClinic(page, { role: 'enfermagem', platformAdmin: false });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /Abrir busca global/ }).click();
  const search = page.getByPlaceholder('Nome, CPF, telefone, exame, tarefa...');
  await search.fill('laboratorio');
  const labDestination = page.getByRole('option', { name: 'Laborat\u00f3rio' });
  await expect(labDestination).toBeVisible({ timeout: 4_000 });
  await expect(page.getByRole('option', { name: 'Configura\u00e7\u00f5es' })).toHaveCount(0);
  await labDestination.click();
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 4_000 }).toBe('/laboratorio');
});
