import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

async function localResources(page: Page) {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('**/rest/v1/platform_admins*', route => route.fulfill({ json: null }));
  await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
}

test('conta sem função pode sair para entrar com outra conta', async ({ page }) => {
  await installSyntheticClinic(page, { platformAdmin: false });
  await localResources(page);
  await page.route('**/rest/v1/user_roles*', route => route.fulfill({ json: [] }));
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Acesso Pendente' })).toBeVisible();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page).toHaveURL(/\/auth(?:\?|$)/);
});

for (const width of [1280, 390]) {
  test(`404 acessado diretamente tem saída funcional em ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await installSyntheticClinic(page, { platformAdmin: false });
    await localResources(page);
    await page.goto('/pagina-qa-inexistente', { referer: 'https://example.test/' });
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`404-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Voltar', exact: true }).click();
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toHaveCount(0);
  });

  test(`acesso pendente pode ser atualizado sem recarregar em ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await installSyntheticClinic(page, { platformAdmin: false });
    await localResources(page);
    let granted = false;
    await page.route('**/rest/v1/user_roles*', route => route.fulfill({ json: granted ? [{ role: 'admin' }] : [] }));
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Acesso Pendente' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sair', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`pendente-${width}.png`), fullPage: true });
    granted = true;
    await page.getByRole('button', { name: 'Atualizar acesso' }).click();
    await expect(page.getByRole('heading', { name: 'Acesso Pendente' })).toHaveCount(0);
    await expect(page.locator('main')).toBeVisible();
  });

  test(`configuração, onboarding e acesso negado têm caminhos claros em ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const fixture = await installSyntheticClinic(page, { platformAdmin: false });
    await localResources(page);
    const failures: string[] = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    page.on('requestfailed', request => { if (request.failure()?.errorText !== 'net::ERR_ABORTED') failures.push(request.url()); });
    for (const [path, title] of [
      ['/configuracoes?tab=clinica', 'Configurações'],
      ['/configuracoes?tab=horarios', 'Configurações'],
      ['/onboarding', 'Prepare sua clínica para atender'],
      ['/preferencias', 'Minhas preferências'],
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
      await expect(page).toHaveURL(path);
      await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
      await page.screenshot({ path: info.outputPath(`${path.replaceAll(/[/?=]/g, '-')}-${width}.png`), fullPage: true });
    }
    expect(failures).toEqual([]);
    await page.route('**/rest/v1/user_roles*', route => route.fulfill({ json: [{ role: 'recepcao' }] }));
    await page.goto('/configuracoes');
    await expect(page.getByRole('heading', { name: 'Acesso Negado' })).toBeVisible();
    await page.getByRole('link', { name: 'Voltar ao início', exact: true }).click();
    await expect(page).toHaveURL('/dashboard');
    expect(fixture.assertAllWritesAreMocked()).toBe(true);
  });
}
