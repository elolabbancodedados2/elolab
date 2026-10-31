import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const todaySaoPaulo = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

async function installTissContext(page: Page, initialLots: Record<string, unknown>[] = []) {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'financeiro' });
  const lots = [...initialLots];
  await page.route('http://127.0.0.1:54321/rest/v1/convenios**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '*/1' },
    body: JSON.stringify([{ id: '00000000-0000-4000-9000-000000000201', nome: 'Convênio QA', versao_tiss: '04.01.00' }]),
  }));
  await page.route('http://127.0.0.1:54321/rest/v1/lotes_tiss**', async route => {
    const url = new URL(route.request().url());
    const numberFilter = url.searchParams.get('numero_lote');
    if (!numberFilter) {
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': `*/${lots.length}` }, body: JSON.stringify(lots) });
      return;
    }
    const number = numberFilter.replace(/^eq\./, '');
    const existing = lots.find(lot => lot.numero_lote === number
      && lot.convenio_id === url.searchParams.get('convenio_id')?.replace(/^eq\./, ''));
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': existing ? '0-0/1' : '*/0' }, body: JSON.stringify(existing ?? null) });
  });
  return { synthetic, lots };
}

test('TISS lot creation uses its own page and preserves the form after an uncertain response', async ({ page }) => {
  const { synthetic } = await installTissContext(page);
  const payloads: Record<string, unknown>[] = [];
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/criar_lote_tiss', async route => {
    payloads.push(route.request().postDataJSON() as Record<string, unknown>);
    if (payloads.length === 1) {
      await route.fulfill({ status: 503, json: { code: 'SYNTHETIC_FAILURE', message: 'Falha sintética ao criar o lote' } });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ success: true, id: '00000000-0000-4000-9000-000000000202', status: 'rascunho' }) });
  });

  await page.goto('/faturamento-convenios');
  await page.getByRole('tab', { name: /Glosas/ }).click();
  await page.getByLabel(/Buscar glosa por/).fill('glosa-restaurada');
  await page.getByRole('link', { name: 'Novo lote' }).click();
  await expect(page).toHaveURL('/faturamento-convenios/lotes/novo');
  await expect(page.getByRole('heading', { name: 'Novo lote TISS' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('#main-content').getByLabel('Convênio').click();
  await page.getByRole('option', { name: 'Convênio QA' }).click();
  await page.getByLabel('Número do lote').fill('QA-2026-100');
  await page.getByLabel('Quantidade de guias').fill('4');
  await page.getByLabel('Valor apresentado').fill('1500.55');
  await page.screenshot({ path: 'test-results/tiss-lot-page-desktop.png', fullPage: true });
  const save = page.getByRole('button', { name: 'Criar lote' });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByRole('alert')).toContainText('Falha sintética ao criar o lote');
  await expect(page.getByLabel('Número do lote')).toHaveValue('QA-2026-100');
  await expect(page.getByLabel('Quantidade de guias')).toHaveValue('4');
  await save.click();
  await expect(page).toHaveURL('/faturamento-convenios');
  await expect(page.getByRole('tab', { name: /Glosas/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel(/Buscar glosa por/)).toHaveValue('glosa-restaurada');
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toMatchObject({
    p_convenio_id: '00000000-0000-4000-9000-000000000201',
    p_competencia: `${todaySaoPaulo().slice(0, 7)}-01`,
    p_numero_lote: 'QA-2026-100', p_quantidade_guias: 4, p_valor_apresentado: 1500.55,
  });
  expect(payloads[1]).toMatchObject(payloads[0]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('TISS lot page fits a mobile viewport and keeps the primary action reachable', async ({ page }) => {
  const { synthetic } = await installTissContext(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/faturamento-convenios/lotes/novo');
  await page.locator('#main-content').getByLabel('Convênio').click();
  await page.getByRole('option', { name: 'Convênio QA' }).click();
  await page.getByLabel('Número do lote').fill('QA-MOBILE-1');
  await page.getByLabel('Quantidade de guias').fill('1');
  await page.getByLabel('Valor apresentado').fill('90.00');
  const criar = page.getByRole('button', { name: 'Criar lote' });
  await criar.scrollIntoViewIfNeeded();
  await expect(criar).toBeInViewport();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/tiss-lot-page-mobile.png', fullPage: true });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('TISS lot creation rejects a duplicate before calling the creation RPC', async ({ page }) => {
  const { synthetic } = await installTissContext(page, [{
    id: '00000000-0000-4000-9000-000000000203', convenio_id: '00000000-0000-4000-9000-000000000201',
    numero_lote: 'QA-2026-101', competencia: `${todaySaoPaulo().slice(0, 7)}-01`, quantidade_guias: 2, valor_apresentado: 300,
  }]);
  let calls = 0;
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/criar_lote_tiss', async route => {
    calls++;
    await route.fulfill({ status: 200, json: { success: true, id: 'unexpected', status: 'rascunho' } });
  });

  await page.goto('/faturamento-convenios/lotes/novo');
  await page.locator('#main-content').getByLabel('Convênio').click();
  await page.getByRole('option', { name: 'Convênio QA' }).click();
  await page.getByLabel('Número do lote').fill('QA-2026-101');
  await page.getByLabel('Quantidade de guias').fill('2');
  await page.getByLabel('Valor apresentado').fill('300.00');
  await page.getByRole('button', { name: 'Criar lote' }).click();
  await expect(page.getByRole('alert')).toContainText('Este número de lote já está cadastrado');
  expect(calls).toBe(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
