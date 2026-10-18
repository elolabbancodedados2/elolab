import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const CLINIC_SCREEN_ROUTES = [
  '/dashboard', '/agenda', '/pacientes', '/prontuarios', '/laboratorio',
  '/mapa-coleta', '/financeiro', '/contas', '/relatorios', '/configuracoes',
  '/tarefas', '/analise-preditiva',
];

test.describe('Telas autenticadas com backend sintÃ©tico', () => {
  test('telas da clÃ­nica mostram tÃ­tulo, conteÃºdo e nÃ£o quebram em desktop', async ({ page }) => {
    test.setTimeout(60_000);
    const synthetic = await installSyntheticClinic(page);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto('/dashboard');
    if (!(await page.locator('main').count())) {
      throw new Error(`O layout autenticado nÃ£o abriu. Chamadas mockadas: ${synthetic.requests.join(' | ')}`);
    }
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByText('Acesso temporariamente suspenso')).toHaveCount(0);
    const failures: string[] = [];

    for (const route of CLINIC_SCREEN_ROUTES) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const pageContent = page.locator('#main-content');
      const heading = pageContent.locator('h1').first();
      await heading.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
      const hasHeading = await heading.isVisible().catch(() => false);
      const headingText = hasHeading ? (await heading.innerText()).trim() : "";
      const visibleContent = await pageContent.innerText().catch(() => '');
      const contentLength = visibleContent.trim().length;
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);

      if (!hasHeading) failures.push(`${route}: sem tÃ­tulo h1 visÃ­vel (URL ${new URL(page.url()).pathname}, título "${headingText}")`);
      if (contentLength < 40) failures.push(`${route}: Ã¡rea principal quase vazia (${contentLength} caracteres)`);
      if (visibleContent.includes('Acesso temporariamente suspenso')) failures.push(`${route}: backend sintÃ©tico incompleto (guard operacional bloqueou a tela)`);
      if (scrollWidth > 1441) failures.push(`${route}: overflow horizontal (${scrollWidth}px)`);
      if (pageErrors.length) failures.push(`${route}: erro JavaScript: ${pageErrors.at(-1)}`);
    }

    expect(failures, failures.join('\n')).toEqual([]);
    expect(synthetic.assertAllWritesAreMocked()).toBe(true);
    expect(pageErrors).toEqual([]);
  });
});
