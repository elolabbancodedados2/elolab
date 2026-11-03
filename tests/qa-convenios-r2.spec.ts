import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const loteId = '00000000-0000-4000-9000-000000000221';

async function silenceSyntheticResources(page: Page) {
  // Recursos externos e ausência de perfil de plataforma são intencionais na fixture.
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('**/rest/v1/platform_admins*', route => route.fulfill({ json: null }));
  await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
}

for (const width of [1280, 390]) {
  test(`retorno TISS exige valor explícito e aceita zero em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'financeiro' });
    await silenceSyntheticResources(page);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => errors.push(`${request.method()} ${request.url()} ${request.failure()?.errorText}`));
    const payloads: Record<string, unknown>[] = [];
    await page.route('http://127.0.0.1:54321/rest/v1/lotes_tiss**', route => route.fulfill({
      status: 200, json: new URL(route.request().url()).searchParams.has('id') ? {
        id: loteId, numero_lote: 'QA-R2-221', competencia: '2026-11-01',
        convenio_id: '00000000-0000-4000-9000-000000000201', valor_apresentado: 1000,
        valor_pago: 0, valor_conciliado_financeiro: 0, retorno_em: null,
        status: 'enviado', convenios: { nome: 'Convênio sintético QA' },
      } : [],
    }));
    await page.route('http://127.0.0.1:54321/rest/v1/rpc/registrar_retorno_lote_tiss', route => {
      payloads.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, json: { success: true, status: 'processando', valor_pago: 0 } });
    });
    await page.goto(`/faturamento-convenios/lotes/${loteId}/retorno`);
    const amount = page.getByLabel('Valor total recebido até agora (R$)');
    await expect(amount).toHaveValue('0');
    await amount.fill('');
    await expect(page.getByRole('button', { name: 'Salvar retorno' })).toBeDisabled();
    expect(payloads).toHaveLength(0);
    await page.screenshot({ path: testInfo.outputPath(`retorno-vazio-${width}.png`), fullPage: true });
    await amount.fill('0');
    await expect(page.getByRole('button', { name: 'Salvar retorno' })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.getByRole('button', { name: 'Salvar retorno' }).click();
    await expect(page).toHaveURL('/faturamento-convenios');
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ p_valor_pago: 0, p_registrar_financeiro: false });
    expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  });

  test(`convênios, lotes e glosas permanecem legíveis em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'admin', conveniosPopulated: true });
    await silenceSyntheticResources(page);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => {
      if (request.failure()?.errorText !== 'net::ERR_ABORTED') errors.push(`${request.method()} ${request.url()} ${request.failure()?.errorText}`);
    });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    for (const path of ['/convenios', '/convenios/novo', '/faturamento-convenios', '/faturamento-convenios/lotes/novo', '/faturamento-convenios/glosas/nova']) {
      await page.goto(path);
      await expect(page.locator('main h1').first()).toBeVisible();
      await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
      const unnamedButtons = await page.locator('main button:visible').evaluateAll(buttons => buttons.filter(button =>
        !button.textContent?.trim() && !button.getAttribute('aria-label') && !button.getAttribute('aria-labelledby') && !button.getAttribute('title')
      ).length);
      expect(unnamedButtons, path).toBe(0);
      if (path === '/convenios') {
        const label = page.getByRole('heading', { name: 'Com tabela de exames', exact: true });
        expect(await label.evaluate(element => element.scrollWidth <= element.clientWidth), 'Nome completo do filtro').toBe(true);
      }
      await page.screenshot({ path: testInfo.outputPath(`${path.replaceAll('/', '-')}-${width}.png`), fullPage: true });
    }
    expect(errors).toEqual([]);
    expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  });
}
