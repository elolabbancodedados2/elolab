import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';
import { PROTECTED_ROUTES } from './helpers/protectedRoutes';

test.use({ serviceWorkers: 'block' });
test.describe.configure({ retries: 0 });

const CANONICAL_PATHS: Record<string, string> = {
  '/atestados': '/documentos-clinicos',
  '/encaminhamentos': '/documentos-clinicos',
  '/caixa': '/recepcao',
  '/caixa-diario': '/recepcao',
  '/contas-receber': '/contas',
  '/contas-pagar': '/contas',
  '/pagamentos': '/contas',
  '/medicos': '/equipe',
  '/funcionarios': '/equipe',
  '/prescricoes': '/documentos-clinicos',
  '/templates': '/todos-templates',
  '/tipos-consulta': '/precos-servicos',
  '/precos-exames': '/precos-servicos',
  '/templates-email': '/todos-templates',
};

test('all protected routes fit tablet width with synthetic data', async ({ page }) => {
  test.setTimeout(180_000);
  const synthetic = await installSyntheticClinic(page);
  const failures: string[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/dashboard');
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 5_000 });

  for (const [index, route] of PROTECTED_ROUTES.entries()) {
    if (index % 20 === 0) console.log(`Tablet routes checked: ${index}/${PROTECTED_ROUTES.length}`);
    const errorCount = pageErrors.length;
    await page.goto(route);
    const content = route === '/painel-tv' ? page.locator('body') : page.locator('#main-content');
    await expect(content).toBeVisible({ timeout: 8_000 });
    const expectedPath = CANONICAL_PATHS[route] ?? route;
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 5_000 }).toBe(expectedPath);
    await page.waitForTimeout(350);
    const title = content.locator('h1:visible').first();
    await expect(title).toBeVisible({ timeout: 5_000 });
    const text = await content.innerText({ timeout: 1_000 }).catch(() => '');
    const heading = await title.innerText({ timeout: 500 }).catch(() => '');
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    const pathname = new URL(page.url()).pathname;

    if (text.trim().length < 40) failures.push(`${route}: empty content (${text.trim().length} characters)`);
    if (!heading.trim() || !(await title.isVisible().catch(() => false))) failures.push(`${route}: no visible h1; final URL ${pathname}`);
    if (/Acesso (Negado|Pendente)|Acesso temporariamente suspenso/.test(text)) failures.push(`${route}: authorization or synthetic backend blocked content`);
    if (width > 769) failures.push(`${route}: horizontal overflow (${width}px)`);
    if (pageErrors.length > errorCount) failures.push(`${route}: JavaScript error ${pageErrors.slice(errorCount).join(' | ')}`);
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(failures, failures.join('\n')).toEqual([]);
});
