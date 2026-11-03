import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

for (const width of [1280, 390]) {
  test(`busca e navegação mantêm contexto e feedback em ${width}px`, async ({ page }, testInfo) => {
    const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
    await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
    await page.route('**/rest/v1/platform_admins*', route => route.fulfill({
      status: 200, contentType: 'application/json', body: 'null',
    }));
    const errors: string[] = [];
    const failures: string[] = [];
    const blockedResources: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && !message.text().includes('net::ERR_BLOCKED_BY_CLIENT')) errors.push(message.text());
    });
    page.on('requestfailed', request => {
      // A clínica sintética bloqueia fontes/recursos externos de propósito.
      if (request.failure()?.errorText.includes('net::ERR_BLOCKED_BY_CLIENT')) {
        blockedResources.push(request.url());
        return;
      }
      if (request.failure()?.errorText !== 'net::ERR_ABORTED') failures.push(`${request.method()} ${request.url()}`);
    });
    page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    let releaseSearch!: () => void;
    const pendingSearch = new Promise<void>(resolve => { releaseSearch = resolve; });
    await page.route('**/rest/v1/rpc/busca_global*', async route => {
      const term = route.request().postDataJSON().p_termo;
      if (term === 'bruno') await pendingSearch;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(term === 'ana' ? [
        { tipo: 'paciente', id: 'p1', titulo: 'Ana Souza', subtitulo: 'Paciente', href: '/pacientes/p1', data_referencia: null },
      ] : []) });
    });
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Abrir busca global/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Busca global' });
    const search = dialog.getByRole('combobox');
    await search.fill('ana');
    await expect(dialog.getByRole('option', { name: /Ana Souza/ })).toBeVisible();
    await search.fill('bruno');
    try {
      await expect(dialog.getByRole('status')).toContainText('Buscando');
      await expect(dialog.getByRole('option', { name: /Ana Souza/ })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`busca-pendente-${width}.png`) });
    } finally {
      releaseSearch();
    }
    await expect(dialog.getByText('Nenhum resultado encontrado nesta clínica.')).toBeVisible();
    await search.fill('preferências');
    await expect(dialog.getByRole('option', { name: /Minhas preferências/ })).toBeVisible();
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(page).toHaveURL(/\/preferencias$/);
    await expect(page.locator('#main-content').getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`preferencias-${width}.png`), fullPage: true });
    await testInfo.attach('recursos-externos-bloqueados', { body: JSON.stringify(blockedResources), contentType: 'application/json' });
    expect(errors).toEqual([]);
    expect(failures).toEqual([]);
    expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  });
}
