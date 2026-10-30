import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const loteId = '00000000-0000-4000-9000-000000000221';
const convenioId = '00000000-0000-4000-9000-000000000201';
const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

function loteTiss(overrides: Record<string, unknown> = {}) {
  return {
    id: loteId, numero_lote: 'QA-RET-2026-01', competencia: `${today().slice(0, 7)}-01`, convenio_id: convenioId,
    valor_apresentado: 1000, valor_pago: 500, valor_conciliado_financeiro: 0, retorno_em: null,
    status: 'enviado', convenios: { nome: 'Convenio QA' }, ...overrides,
  };
}

async function installReturnContext(page: Page, lote = loteTiss()) {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'financeiro' });
  await page.route('http://127.0.0.1:54321/rest/v1/convenios**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '*/1' },
    body: JSON.stringify([{ id: convenioId, nome: 'Convenio QA', versao_tiss: '04.01.00' }]),
  }));
  await page.route('http://127.0.0.1:54321/rest/v1/lotes_tiss**', async route => {
    const url = new URL(route.request().url());
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
    if (id) {
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/1' }, body: JSON.stringify(id === lote.id ? lote : null) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/1' }, body: JSON.stringify([lote]) });
  });
  return { synthetic, lote };
}

test('TISS return is a dedicated page and retries the same atomic reconciliation payload', async ({ page }) => {
  const { synthetic } = await installReturnContext(page);
  const payloads: Record<string, unknown>[] = [];
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/registrar_retorno_lote_tiss', async route => {
    payloads.push(route.request().postDataJSON() as Record<string, unknown>);
    if (payloads.length === 1) {
      await route.fulfill({ status: 503, json: { code: 'SYNTHETIC_FAILURE', message: 'Falha sintética ao registrar retorno' } });
      return;
    }
    await route.fulfill({ status: 200, json: { success: true, status: 'pago_parcial', valor_pago: 850, valor_conciliado_financeiro: 850, variacao_financeira: 850 } });
  });

  await page.goto('/faturamento-convenios');
  await page.getByLabel(/Buscar lote por/).fill('QA-RET');
  await page.getByRole('link', { name: 'Registrar retorno' }).click();
  await expect(page).toHaveURL(`/faturamento-convenios/lotes/${loteId}/retorno`);
  await expect(page.getByRole('heading', { name: 'Registrar retorno da operadora' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Valor total recebido até agora (R$)').fill('850');
  await page.getByLabel('Conciliar a diferença no Fluxo de Caixa').check();
  await page.screenshot({ path: 'test-results/tiss-return-page-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Salvar retorno' }).click();
  await expect(page.getByRole('alert')).toContainText('Falha sintética ao registrar retorno');
  await expect(page.getByLabel('Valor total recebido até agora (R$)')).toHaveValue('850');
  await expect(page.getByLabel('Conciliar a diferença no Fluxo de Caixa')).toBeChecked();
  await page.getByRole('button', { name: 'Repetir a mesma tentativa' }).click();
  await expect(page).toHaveURL('/faturamento-convenios');
  await expect(page.getByLabel(/Buscar lote por/)).toHaveValue('QA-RET');
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toMatchObject({
    p_lote_id: loteId, p_valor_pago: 850, p_motivo_ajuste: null,
    p_data_pagamento: today(), p_registrar_financeiro: true,
  });
  expect(payloads[1]).toEqual(payloads[0]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('TISS reductions require a reason and use the financial correction path', async ({ page }) => {
  const { synthetic } = await installReturnContext(page, loteTiss({ valor_pago: 800, valor_conciliado_financeiro: 750, retorno_em: '2026-10-29T13:00:00Z', status: 'pago_parcial' }));
  let payload: Record<string, unknown> | null = null;
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/registrar_retorno_lote_tiss', async route => {
    payload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, json: { success: true, status: 'pago_parcial', valor_pago: 700, valor_conciliado_financeiro: 700, variacao_financeira: -50 } });
  });

  await page.goto(`/faturamento-convenios/lotes/${loteId}/retorno`);
  await page.getByLabel('Valor total recebido até agora (R$)').fill('700');
  await page.getByLabel('Conciliar a diferença no Fluxo de Caixa').check();
  await expect(page.getByLabel('Motivo da correção')).toBeVisible();
  const salvar = page.getByRole('button', { name: 'Salvar retorno' });
  await expect(salvar).toBeDisabled();
  await page.getByLabel('Motivo da correção').fill('Correção confirmada com o demonstrativo da operadora.');
  await expect(salvar).toBeEnabled();
  await salvar.click();
  await expect(page).toHaveURL('/faturamento-convenios');
  expect(payload).toMatchObject({
    p_lote_id: loteId, p_valor_pago: 700,
    p_motivo_ajuste: 'Correção confirmada com o demonstrativo da operadora.',
    p_registrar_financeiro: true,
  });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('TISS return page blocks a draft lot before rendering the form', async ({ page }) => {
  const { synthetic } = await installReturnContext(page, loteTiss({ status: 'rascunho' }));
  let calls = 0;
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/registrar_retorno_lote_tiss', async route => {
    calls++;
    await route.fulfill({ status: 200, json: { success: true } });
  });

  await page.goto(`/faturamento-convenios/lotes/${loteId}/retorno`);
  await expect(page.getByRole('heading', { name: 'Retorno indisponível' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar retorno' })).toHaveCount(0);
  expect(calls).toBe(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('TISS return page keeps its save action reachable on mobile', async ({ page }) => {
  const { synthetic } = await installReturnContext(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/faturamento-convenios/lotes/${loteId}/retorno`);
  const salvar = page.getByRole('button', { name: 'Salvar retorno' });
  await salvar.scrollIntoViewIfNeeded();
  await expect(salvar).toBeInViewport();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/tiss-return-page-mobile.png', fullPage: true });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
