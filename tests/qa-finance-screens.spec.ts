import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

for (const width of [1280, 390]) {
  test(`financial screens stay readable and free of runtime failures at ${width}px`, async ({ page }, info) => {
    const synthetic = await installSyntheticClinic(page, { platformAdmin: false, accountsPopulated: true, conveniosPopulated: true });
    await page.route('**/rest/v1/platform_admins*', route => route.fulfill({ json: null }));
    await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
    const failures: string[] = [];
    const blockedExternal: string[] = [];
    page.on('pageerror', error => failures.push(error.message));
    // Recursos externos são bloqueados intencionalmente pela fixture.
    page.on('console', message => {
      if (message.type() !== 'error' || message.text().includes('ERR_BLOCKED_BY_CLIENT')) return;
      failures.push(message.text());
    });
    page.on('response', response => {
      if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
    });
    page.on('requestfailed', request => {
      if (request.failure()?.errorText.includes('ERR_BLOCKED_BY_CLIENT')) blockedExternal.push(request.url());
      else if (request.failure()?.errorText !== 'net::ERR_ABORTED') failures.push(request.url());
    });
    await page.setViewportSize({ width, height: 844 });
    for (const [path, heading, name] of [
      ['/financeiro', 'Painel Financeiro', 'overview'],
      ['/fluxo-caixa', 'Fluxo de caixa', 'cashflow'],
      ['/contas?tab=receber', 'Contas a receber', 'receivables'],
      ['/contas?tab=pagar', 'Contas a pagar', 'payables'],
      ['/caixa-diario', 'Caixa Diário', 'cash'],
      ['/convenios', 'Convênios', 'agreements'],
    ]) {
      await page.goto(path);
      const main = page.locator('#main-content');
      await expect(main.getByRole('heading', { name: new RegExp(`^${heading}$`, 'i') }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
      const unlabeledButtons = await main.getByRole('button').evaluateAll(buttons => buttons
        .filter(button => !button.textContent?.trim() && !button.getAttribute('aria-label') && !button.getAttribute('aria-labelledby'))
        .map(button => button.outerHTML));
      expect(unlabeledButtons, path).toEqual([]);
      await page.screenshot({ path: info.outputPath(`${name}-${width}.png`) });
    }
    await info.attach('network.json', { body: JSON.stringify({ failures, blockedExternal }, null, 2), contentType: 'application/json' });
    expect(failures).toEqual([]);
    expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  });
}
