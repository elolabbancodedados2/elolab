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
