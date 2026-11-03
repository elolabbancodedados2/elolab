import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

for (const width of [1280, 390]) {
  test(`relatórios e indicadores funcionam sem erros em ${width}px`, async ({ page }, testInfo) => {
    const synthetic = await installSyntheticClinic(page, { analyticsPopulated: true, accountsPopulated: true });
    await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
    const errors: string[] = [];
    const failures: string[] = [];
    const blockedResources: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && !message.text().includes('net::ERR_BLOCKED_BY_CLIENT')) errors.push(message.text());
    });
    page.on('requestfailed', request => {
      const error = request.failure()?.errorText;
      if (error?.includes('ERR_BLOCKED_BY_CLIENT')) blockedResources.push(request.url());
      else if (error !== 'net::ERR_ABORTED') failures.push(`${request.method()} ${request.url()}`);
    });
    page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    await page.setViewportSize({ width, height: 844 });
    for (const path of ['/analytics', '/indicadores', '/financeiro/dre', '/relatorios/salvos', '/relatorios']) {
      await page.goto(path);
      await expect(page.locator('#main-content').getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator('#main-content')).not.toContainText('Carregando...');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${path.replaceAll('/', '-')}-${width}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: 'Gerar relatório', exact: true }).click();
    await expect(page.getByRole('button', { name: 'CSV', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'resultados').toBe(true);
    const balance = page.getByText(/^Saldo:/).last();
    await expect(balance).toBeVisible();
    expect(await balance.evaluate(element => element.getBoundingClientRect().right <= innerWidth), 'saldo visível sem corte').toBe(true);
    const csvPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV', exact: true }).click();
    const csv = await csvPromise;
    expect(csv.suggestedFilename()).toMatch(/^relatorio-lancamentos-.*\.csv$/);
    await page.screenshot({ path: testInfo.outputPath(`resultados-${width}.png`), fullPage: true });
    await testInfo.attach('recursos-externos-bloqueados', { body: JSON.stringify(blockedResources), contentType: 'application/json' });
    expect(errors).toEqual([]);
    expect(failures).toEqual([]);
    expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  });
}

test('impede exportação vazia ao desmarcar todas as colunas e explica como recuperar', async ({ page }) => {
  await installSyntheticClinic(page, { accountsPopulated: true });
  await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
  await page.goto('/relatorios');
  await page.getByRole('button', { name: 'Gerar relatório', exact: true }).click();
  await expect(page.getByRole('button', { name: 'CSV', exact: true })).toBeEnabled();
  for (const checkbox of await page.locator('#main-content').getByRole('checkbox').all()) await checkbox.uncheck();
  for (const name of ['CSV', 'Excel', 'Imprimir / PDF']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'Selecione ao menos uma coluna' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Descrição', exact: true }).check();
  await expect(page.getByRole('button', { name: 'CSV', exact: true })).toBeEnabled();
});

test('informa quando o navegador impede abrir a impressão do relatório', async ({ page }) => {
  await installSyntheticClinic(page, { accountsPopulated: true });
  await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
  await page.goto('/relatorios');
  await page.getByRole('button', { name: 'Gerar relatório', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Imprimir / PDF', exact: true })).toBeEnabled();
  await page.evaluate(() => { window.open = () => null; });
  await page.getByRole('button', { name: 'Imprimir / PDF', exact: true }).click();
  await expect(page.getByText('Permita pop-ups para abrir a impressão do relatório.')).toBeVisible();
});
