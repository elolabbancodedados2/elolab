import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

for (const width of [1280, 390]) {
  test(`payable header includes overdue balances at ${width}px`, async ({ page }, info) => {
    await installSyntheticClinic(page, { platformAdmin: false, accountsPopulated: true });
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/contas?tab=pagar');
    await expect(page.getByText(/1\.920,00 em aberto/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`payable-open-balance-${width}.png`) });
  });

  test(`recurring account shortcut keeps the requested recurrence at ${width}px`, async ({ page }, info) => {
    const synthetic = await installSyntheticClinic(page, { platformAdmin: false, accountsPopulated: true });
    await page.route('**/rest/v1/platform_admins*', route => route.fulfill({ json: null }));
    await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
    const errors: string[] = [];
    const failedRequests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    // Recursos externos são bloqueados intencionalmente pela fixture.
    page.on('console', message => {
      if (message.type() !== 'error' || message.text().includes('ERR_BLOCKED_BY_CLIENT')) return;
      errors.push(message.text());
    });
    page.on('requestfailed', request => {
      if (!/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/.test(request.failure()?.errorText ?? '')) failedRequests.push(request.url());
    });
    const payloads: Record<string, unknown>[] = [];
    await page.route('**/rest/v1/lancamentos*', route => {
      if (route.request().method() !== 'POST') return route.fallback();
      payloads.push(...[route.request().postDataJSON()].flat());
      return route.fulfill({ status: 201, json: [] });
    });
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/financeiro/recorrencias');
    await expect(page.getByRole('heading', { name: 'Contas recorrentes', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`recurrences-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Nova conta recorrente' }).click();
    await expect(page).toHaveURL('/contas/pagar/nova');
    await expect(page.getByRole('switch', { name: 'Marcar como despesa recorrente' })).toBeChecked();
    await expect(page.getByLabel('Frequência', { exact: true })).toContainText('Mensal');
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Marcar como despesa recorrente' })).toBeChecked();
    await page.getByLabel('Descrição *').fill('Aluguel recorrente QA');
    await page.getByLabel('Valor *', { exact: true }).fill('1200,50');
    await page.getByRole('button', { name: 'Salvar conta', exact: true }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`recurrence-form-${width}.png`) });
    await page.getByRole('button', { name: 'Salvar conta', exact: true }).click();
    await expect(page).toHaveURL('/contas?tab=pagar');
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ descricao: 'Aluguel recorrente QA', valor: 1200.5, recorrente: true, frequencia_recorrencia: 'mensal' });
    expect(errors).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  });
}
