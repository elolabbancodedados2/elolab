import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('bulk cleanup uses a contextual page, preserves filters and audits the reason', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'admin' });
  let previewCount = 3;
  const previewRequests: string[] = [];
  const rpcCalls: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/coletas_laboratorio*', async route => {
    const request = route.request();
    if (request.method() === 'HEAD' || request.headers().prefer?.includes('count=exact')) {
      previewRequests.push(request.url());
      return route.fulfill({
        status: 200,
        headers: {
          'content-range': `*/${previewCount}`,
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'content-range',
        },
        body: '',
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.route('**/rest/v1/laboratorio_setores*', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/rpc/cancelar_coletas_pendentes_antigas*', route => {
    rpcCalls.push(route.request().postDataJSON() as Record<string, unknown>);
    previewCount = 0;
    return route.fulfill({ json: 2 });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/laboratorio?status=pendente&periodo=7dias');
  await page.getByRole('link', { name: 'Limpar fila antiga' }).click();

  await expect(page).toHaveURL('/laboratorio/coletas/limpar');
  await expect(page.getByTestId('lab-bulk-cleanup-page')).toBeVisible();
  await expect(page.getByText('3 coleta(s) pendente(s) da sua clínica correspondem ao corte.')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const submit = page.getByRole('button', { name: 'Cancelar 3 coleta(s)', exact: true });
  await expect(submit).toBeDisabled();
  await page.screenshot({ path: info.outputPath('lab-bulk-cleanup-mobile.png'), fullPage: true, animations: 'disabled' });

  await page.getByLabel('Mais antigas que (dias)').fill('45');
  await expect.poll(() => previewRequests.length).toBeGreaterThan(1);
  await expect(page.getByText('3 coleta(s) pendente(s) da sua clínica correspondem ao corte.')).toBeVisible();
  await page.getByLabel('Motivo obrigatório para auditoria').fill('Fila migrada sem coleta física');
  const enabledSubmit = page.getByRole('button', { name: 'Cancelar 3 coleta(s)', exact: true });
  await expect(enabledSubmit).toBeEnabled();
  await enabledSubmit.scrollIntoViewIfNeeded();
  await page.locator('main#main-content').evaluate(element => element.scrollTo(0, element.scrollHeight));
  const submitBounds = await enabledSubmit.boundingBox();
  const bottomNavigation = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
  expect(submitBounds).not.toBeNull();
  expect(bottomNavigation).not.toBeNull();
  expect(submitBounds!.y + submitBounds!.height).toBeLessThanOrEqual(bottomNavigation!.y);
  await page.screenshot({ path: info.outputPath('lab-bulk-cleanup-mobile-action.png'), fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('main#main-content').evaluate(element => element.scrollTo(0, 0));
  const pageTitle = await page.getByRole('heading', { level: 1 }).boundingBox();
  expect(pageTitle).not.toBeNull();
  expect(pageTitle!.y).toBeGreaterThanOrEqual(140);
  await page.screenshot({ path: info.outputPath('lab-bulk-cleanup-desktop.png'), fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await enabledSubmit.click();

  await expect(page).toHaveURL('/laboratorio?status=pendente&periodo=7dias');
  await expect(page.getByRole('link', { name: 'Limpar fila antiga' })).toBeFocused();
  expect(rpcCalls).toEqual([{ p_dias: 45, p_motivo: 'Fila migrada sem coleta física' }]);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('bulk cleanup keeps the reason and task open when the server rejects the operation', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'admin' });
  await page.route('**/rest/v1/coletas_laboratorio*', route => route.request().method() === 'HEAD' || route.request().headers().prefer?.includes('count=exact')
    ? route.fulfill({
      status: 200,
      headers: { 'content-range': '*/2', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' },
      body: '',
    })
    : route.fulfill({ json: [] }));
  await page.route('**/rest/v1/laboratorio_setores*', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/rpc/cancelar_coletas_pendentes_antigas*', route => route.fulfill({ status: 400, json: { message: 'Falha de autorização do servidor' } }));

  await page.goto('/laboratorio/coletas/limpar');
  await expect(page.getByTestId('lab-bulk-cleanup-page')).toBeVisible();
  await page.getByLabel('Motivo obrigatório para auditoria').fill('Carga antiga fora do fluxo');
  await page.getByRole('button', { name: 'Cancelar 2 coleta(s)', exact: true }).click();

  await expect(page.getByRole('alert')).toContainText('Falha de autorização do servidor');
  await expect(page.getByLabel('Motivo obrigatório para auditoria')).toHaveValue('Carga antiga fora do fluxo');
  await expect(page.getByTestId('lab-bulk-cleanup-page')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
