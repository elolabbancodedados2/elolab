import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const loteId = '00000000-0000-4000-9000-000000000241';
const convenioId = '00000000-0000-4000-9000-000000000201';
const lotesPadrao = () => [{
  id: loteId, numero_lote: 'QA-GLOSA-2026-01', convenio_id: convenioId,
  competencia: '2026-10-01', quantidade_guias: 4, valor_apresentado: 1000, valor_pago: 0,
  valor_conciliado_financeiro: 0, status: 'enviado', versao_tiss: '04.01.00',
  convenios: { nome: 'Convenio QA', registro_ans: '000000' },
}];

async function installGlosaContext(page: Page, options: { glosas?: Record<string, unknown>[]; lots?: Record<string, unknown>[] } = {}) {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'financeiro' });
  const lots = options.lots ?? lotesPadrao();
  const glosas = options.glosas ?? [];
  await page.route('http://127.0.0.1:54321/rest/v1/convenios**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '*/1' },
    body: JSON.stringify([{ id: convenioId, nome: 'Convenio QA', versao_tiss: '04.01.00' }]),
  }));
  await page.route('http://127.0.0.1:54321/rest/v1/lotes_tiss**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': `0-${Math.max(0, lots.length - 1)}/${lots.length}` },
    body: JSON.stringify(lots),
  }));
  await page.route('http://127.0.0.1:54321/rest/v1/glosas_convenio**', async route => {
    const url = new URL(route.request().url());
    const loteFilter = url.searchParams.get('lote_id')?.replace(/^eq\./, '');
    const rows = loteFilter ? glosas.filter(item => item.lote_id === loteFilter) : glosas;
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': `*/${rows.length}` }, body: JSON.stringify(rows) });
  });
  return { synthetic };
}

test('glosa registration uses a dedicated page and retries with the same idempotency key', async ({ page }) => {
  const { synthetic } = await installGlosaContext(page);
  const payloads: Record<string, unknown>[] = [];
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/registrar_glosa_convenio', async route => {
    payloads.push(route.request().postDataJSON() as Record<string, unknown>);
    if (payloads.length === 1) {
      await route.fulfill({ status: 503, json: { code: 'SYNTHETIC_FAILURE', message: 'Falha sintética ao registrar a glosa' } });
      return;
    }
    await route.fulfill({ status: 200, json: { success: true, repetido: false, id: '00000000-0000-4000-9000-000000000242', total_glosado: 125, saldo_apresentado: 875 } });
  });

  await page.goto('/faturamento-convenios');
  await page.getByRole('tab', { name: /Lotes/ }).click();
  await page.getByLabel(/Buscar lote por/).fill('QA-GLOSA');
  await page.getByRole('link', { name: 'Registrar glosa' }).click();
  await expect(page).toHaveURL('/faturamento-convenios/glosas/nova');
  await expect(page.getByRole('heading', { name: 'Registrar glosa' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Lote enviado').click();
  await page.getByRole('option', { name: /QA-GLOSA-2026-01/ }).click();
  await page.getByLabel('Código da glosa').fill('G-42');
  await page.getByLabel('Guia de referência (opcional)').fill('GUIA-77');
  await page.getByLabel('Valor glosado (R$)').fill('125');
  await page.getByLabel('Motivo informado pela operadora').fill('Procedimento sem autorização prévia no demonstrativo.');
  await page.screenshot({ path: 'test-results/tiss-glosa-page-desktop.png', fullPage: true });
  await page.locator('#main-content').getByRole('button', { name: 'Registrar glosa' }).click();
  await expect(page.getByRole('alert')).toContainText('Falha sintética ao registrar a glosa');
  await expect(page.getByLabel('Código da glosa')).toHaveValue('G-42');
  await expect(page.getByLabel('Valor glosado (R$)')).toHaveValue('125');
  await page.getByRole('button', { name: 'Repetir a mesma tentativa' }).click();
  await expect(page).toHaveURL('/faturamento-convenios');
  await expect(page.getByLabel(/Buscar lote por/)).toHaveValue('QA-GLOSA');
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toMatchObject({
    p_lote_id: loteId, p_codigo_glosa: 'G-42', p_motivo: 'Procedimento sem autorização prévia no demonstrativo.',
    p_guia_referencia: 'GUIA-77', p_valor_glosado: 125,
  });
  expect(payloads[0].p_chave_idempotencia).toEqual(expect.any(String));
  expect(payloads[1]).toEqual(payloads[0]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('glosa amount cannot exceed the remaining batch balance', async ({ page }) => {
  const { synthetic } = await installGlosaContext(page, { glosas: [{ id: 'prior-glosa', lote_id: loteId, valor_glosado: 950, status: 'pendente' }] });
  let calls = 0;
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/registrar_glosa_convenio', async route => {
    calls++;
    await route.fulfill({ status: 200, json: { success: true } });
  });

  await page.goto('/faturamento-convenios/glosas/nova');
  await page.getByLabel('Lote enviado').click();
  await page.getByRole('option', { name: /QA-GLOSA-2026-01/ }).click();
  await expect(page.getByText('R$ 50,00')).toBeVisible();
  await page.getByLabel('Código da glosa').fill('G-43');
  await page.getByLabel('Valor glosado (R$)').fill('50.01');
  await page.getByLabel('Motivo informado pela operadora').fill('Valor excede o saldo restante do lote.');
  await expect(page.locator('#main-content').getByRole('button', { name: 'Registrar glosa' })).toBeDisabled();
  expect(calls).toBe(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('glosa form keeps its save action reachable on mobile', async ({ page }) => {
  const { synthetic } = await installGlosaContext(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/faturamento-convenios/glosas/nova');
  const salvar = page.locator('#main-content').getByRole('button', { name: 'Registrar glosa' });
  await salvar.scrollIntoViewIfNeeded();
  await expect(salvar).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/tiss-glosa-page-mobile.png', fullPage: true });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

for (const width of [1280, 390]) {
  test(`glosa preserva os dados e exige carregar as guias em ${width}px`, async ({ page }, testInfo) => {
    const { synthetic } = await installGlosaContext(page);
    await page.setViewportSize({ width, height: 844 });
    await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
    await page.route('**/rest/v1/platform_admins*', route => route.fulfill({ json: null }));
    const errors: string[] = [];
    const failures: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && !message.text().includes('400 (Bad Request)')) errors.push(message.text());
    });
    page.on('requestfailed', request => failures.push(request.url()));
    page.on('response', response => {
      if (response.status() >= 400 && !(response.status() === 400 && response.url().includes('/lote_tiss_guias'))) failures.push(`${response.status()} ${response.url()}`);
    });
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    let fail = true;
    let writes = 0;
    await page.route('**/rest/v1/lote_tiss_guias**', async route => {
      await pending;
      await route.fulfill(fail ? { status: 400, json: { message: 'Falha sintética ao carregar guias' } } : { json: [{
        id: '00000000-0000-4000-9000-000000000251', numero_guia: 'GUIA-40',
        valor_total: 40, data_atendimento: '2026-10-01', codigo_procedimento: '40304361',
      }] });
    });
    await page.route('**/rest/v1/rpc/registrar_glosa_convenio', route => {
      writes++;
      return route.fulfill({ json: { success: true } });
    });
    await page.goto('/faturamento-convenios/glosas/nova');
    await page.getByLabel('Lote enviado').click();
    await page.getByRole('option', { name: /QA-GLOSA-2026-01/ }).click();
    await page.getByLabel('Código da glosa').fill('G-43');
    await page.getByLabel('Motivo informado pela operadora').fill('Motivo preservado durante a recuperação.');
    await page.getByLabel('Valor glosado (R$)').fill('100');
    const save = page.locator('#main-content').getByRole('button', { name: 'Registrar glosa', exact: true });
    try {
      await expect(save).toBeDisabled();
      await expect(page.getByRole('status').filter({ hasText: 'Carregando guias do lote' })).toBeVisible();
    } finally { release(); }
    await expect(page.getByRole('heading', { name: 'Não foi possível carregar as guias do lote' })).toBeVisible({ timeout: 15_000 });
    await expect(save).toBeDisabled();
    await expect(page.getByLabel('Guia de referência (opcional)')).toBeDisabled();
    expect(writes).toBe(0);
    fail = false;
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await page.getByLabel('Guia de referência (opcional)').click();
    await page.getByRole('option', { name: /Guia GUIA-40/ }).click();
    await expect(page.getByLabel('Motivo informado pela operadora')).toHaveValue('Motivo preservado durante a recuperação.');
    await expect(page.getByLabel('Valor glosado (R$)')).toHaveValue('100');
    await expect(save).toBeDisabled();
    await page.getByLabel('Valor glosado (R$)').fill('40');
    await expect(save).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('main').first().getByRole('button', { name: '', exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`glosa-guias-recuperadas-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
    expect(failures).toEqual([]);
    expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  });
}
