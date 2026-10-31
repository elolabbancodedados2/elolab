import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';
import { PROTECTED_ROUTES } from './helpers/protectedRoutes';

test.use({ serviceWorkers: 'block' });

test.describe('Auditoria autenticada de todas as rotas em desktop', () => {
  test.describe.configure({ retries: 0, mode: 'parallel' });

  // Lotes de rotas: cada teste cabe no tempo limite e os lotes rodam em paralelo.
  const LOTE = 15;
  for (let inicio = 0; inicio < PROTECTED_ROUTES.length; inicio += LOTE) {
  const routes = PROTECTED_ROUTES.slice(inicio, inicio + LOTE);
  test(`rotas de clínica, plataforma e aliases renderizam sem falhas (${inicio + 1}-${inicio + routes.length})`, async ({ page }) => {
    test.setTimeout(150_000);
    const synthetic = await installSyntheticClinic(page);
    const failures: string[] = [];
    const viewports = [{ width: 1440, height: 900 }, { width: 1280, height: 800 }];

    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto('/dashboard');
      await expect(page.locator('#main-content')).toBeVisible({ timeout: 5_000 });

      for (const route of routes) {
        const previousErrorCount = pageErrors.length;
        await page.goto(route);
        const content = route === '/painel-tv' ? page.locator('body') : page.locator('#main-content');
        await expect(content).toBeVisible({ timeout: 8_000 });
        const heading = content.locator('h1').first();
        await expect(heading, `${route} should finish loading a visible page title`).toBeVisible({ timeout: 8_000 });
        const title = await heading.innerText();
        const text = await content.innerText({ timeout: 1_000 }).catch(() => '');
        const titleVisible = title.trim().length > 0;
        const width = await page.evaluate(() => document.documentElement.scrollWidth);
        const pathname = new URL(page.url()).pathname;

        if (text.trim().length < 40) failures.push(`${viewport.width}px ${route}: conteudo principal vazio (${text.trim().length} caracteres)`);
        if (!titleVisible || !title.trim()) failures.push(`${viewport.width}px ${route}: sem titulo principal visivel; URL final ${pathname}`);
        if (/Acesso (Negado|Pendente)|Acesso temporariamente suspenso/.test(text)) {
          failures.push(`${viewport.width}px ${route}: perfil sintetico sem acesso ou backend de QA incompleto; URL final ${pathname}`);
        }
        if (width > viewport.width + 1) failures.push(`${viewport.width}px ${route}: overflow horizontal (${width}px)`);
        if (pageErrors.length > previousErrorCount) failures.push(`${viewport.width}px ${route}: erro JavaScript ${pageErrors.slice(previousErrorCount).join(' | ')}`);
      }
    }

    expect(synthetic.assertAllWritesAreMocked()).toBe(true);
    expect(failures, failures.join('\n')).toEqual([]);
  });
  }

  test('accessibility preferences change the tablet interface and save only to the synthetic backend', async ({ page }) => {
    test.setTimeout(30_000);
    const synthetic = await installSyntheticClinic(page);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/preferencias');

    await page.getByRole('combobox', { name: 'Tamanho do texto' }).click();
    await page.getByRole('option', { name: 'Maior' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.textSize)).toBe('large');

    await page.getByRole('switch', { name: 'Alto contraste' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.contrast)).toBe('high');
    await page.getByRole('combobox', { name: 'Formato curto de data' }).click();
    await page.getByRole('option', { name: 'AAAA-MM-DD' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.dateFormat)).toBe('YYYY-MM-DD');
    await page.getByRole('combobox', { name: 'Página inicial' }).click();
    await page.getByRole('option', { name: 'Tarefas' }).click();
    await page.getByRole('button', { name: 'Salvar preferências' }).click();

    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(769);
    expect(synthetic.assertAllWritesAreMocked()).toBe(true);

    await page.goto('/dashboard');
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 5_000 }).toBe('/tarefas');
  });
});
