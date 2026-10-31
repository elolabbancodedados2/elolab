import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const todaySaoPaulo = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

test('cash closing is a protected page, requires a reason for differences and retries the same payload', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'admin' });
  const today = todaySaoPaulo();
  const cashId = '00000000-0000-4000-9000-000000000071';
  const movements = [
    { id: 'movement-1', tipo: 'receita', valor: 40, forma_pagamento: 'dinheiro', descricao: 'Consulta QA', created_at: `${today}T09:00:00Z` },
    { id: 'movement-2', tipo: 'sangria', valor: 10, forma_pagamento: 'dinheiro', descricao: 'Sangria QA', created_at: `${today}T10:00:00Z` },
    { id: 'movement-3', tipo: 'suprimento', valor: 5, forma_pagamento: 'dinheiro', descricao: 'Suprimento QA', created_at: `${today}T11:00:00Z` },
    { id: 'movement-4', tipo: 'despesa', valor: 2, forma_pagamento: 'dinheiro', descricao: 'Despesa QA', created_at: `${today}T12:00:00Z` },
  ];
  const payloads: Record<string, unknown>[] = [];
  let closed = false;

  await page.route('http://127.0.0.1:54321/rest/v1/caixa_diario**', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    expect(url.searchParams.get('id')).toBe(`eq.${cashId}`);
    expect(url.searchParams.get('clinica_id')).toBe(`eq.${synthetic.clinicId}`);
    const row = {
      id: cashId, data: today, aberto: !closed, valor_abertura: 100,
      operador_abertura: 'Conta QA sintética', operador_fechamento: closed ? 'Conta QA sintética' : null,
      valor_fechamento: closed ? 130 : null, clinica_id: synthetic.clinicId,
    };
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/1' }, body: JSON.stringify([row]) });
  });
  await page.route('**/rest/v1/rpc/movimentos_caixa_diario**', async route => {
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(movements) });
  });
  await page.route('**/rest/v1/rpc/fechar_caixa_diario', async route => {
    payloads.push(route.request().postDataJSON());
    if (payloads.length === 1) return route.fulfill({ status: 400, json: { code: 'P0001', message: 'Falha sintética ao fechar o caixa' } });
    closed = true;
    return route.fulfill({ status: 200, json: { code: 'fechado', caixa_id: cashId, data: today } });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/recepcao/caixa/${cashId}/fechar`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Fechar caixa' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Dinheiro esperado', { exact: true }).locator('..')).toContainText('R$ 133,00');
  await expect(page.getByLabel('Dinheiro contado na gaveta (R$)')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('cash-closing-mobile.png'), fullPage: true, animations: 'disabled' });

  await page.getByLabel('Dinheiro contado na gaveta (R$)').fill('130,00');
  const confirm = page.getByRole('button', { name: 'Confirmar fechamento' });
  await page.getByLabel('Dinheiro contado na gaveta (R$)').fill('130,001');
  await expect(page.getByLabel('Dinheiro contado na gaveta (R$)')).toHaveAttribute('aria-invalid', 'true');
  await expect(confirm).toBeDisabled();
  await page.getByLabel('Dinheiro contado na gaveta (R$)').fill('130,00');
  await page.getByLabel(/Observações/).fill('Diferença de troco');
  await expect(confirm).toBeEnabled();
  await page.getByRole('button', { name: 'Voltar ao caixa diário' }).click();
  const discard = page.getByRole('alertdialog');
  await expect(discard).toContainText('Alterações não salvas');
  await discard.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(discard).toHaveCount(0);
  await expect(page.getByLabel('Dinheiro contado na gaveta (R$)')).toHaveValue('130,00');
  await confirm.scrollIntoViewIfNeeded();
  const actionBox = await confirm.boundingBox();
  const mobileNavigation = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
  expect(actionBox).not.toBeNull();
  expect(mobileNavigation).not.toBeNull();
  expect(actionBox!.y + actionBox!.height).toBeLessThan(mobileNavigation!.y);
  await page.screenshot({ path: testInfo.outputPath('cash-closing-mobile-action.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#main-content').evaluate(element => { element.scrollTop = 0; });
  await expect(page.getByRole('heading', { name: 'Fechar caixa' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('cash-closing-desktop.png'), fullPage: true, animations: 'disabled' });

  await confirm.click();
  await expect(page.getByText('Falha sintética ao fechar o caixa')).toBeVisible();
  await expect(page.getByLabel('Dinheiro contado na gaveta (R$)')).toHaveValue('130,00');
  await expect(page.getByLabel(/Observações/)).toHaveValue('Diferença de troco');
  await confirm.click();
  await expect(page).toHaveURL('/caixa-diario');
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toMatchObject({ p_caixa_id: cashId, p_valor_contado: 130, p_observacoes: 'Diferença de troco' });
  expect(payloads[1]).toMatchObject(payloads[0]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('cash closing refuses a register already closed in another session', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'recepcao' });
  const cashId = '00000000-0000-4000-9000-000000000072';
  let closeAttempts = 0;

  await page.route('http://127.0.0.1:54321/rest/v1/caixa_diario**', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/1' }, body: JSON.stringify([{
      id: cashId, data: todaySaoPaulo(), aberto: false, valor_abertura: 100, valor_fechamento: 100,
      operador_abertura: 'Conta QA sintética', operador_fechamento: 'Conta QA sintética', clinica_id: synthetic.clinicId,
    }]) });
  });
  await page.route('**/rest/v1/rpc/movimentos_caixa_diario**', route => route.fulfill({ status: 200, json: [] }));
  await page.route('**/rest/v1/rpc/fechar_caixa_diario', async route => {
    closeAttempts += 1;
    return route.fulfill({ status: 400, json: { code: 'P0001', message: 'This register is already closed.' } });
  });

  await page.goto(`/recepcao/caixa/${cashId}/fechar`);
  await expect(page.getByRole('heading', { name: 'Este caixa já foi fechado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar fechamento' })).toHaveCount(0);
  expect(closeAttempts).toBe(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('cash closing keeps older registers distinct and allows a balanced count without a reason', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'recepcao' });
  const today = todaySaoPaulo();
  const oldDateObject = new Date(`${today}T12:00:00-03:00`);
  oldDateObject.setDate(oldDateObject.getDate() - 1);
  const oldDate = oldDateObject.toISOString().slice(0, 10);
  const cashId = '00000000-0000-4000-9000-000000000073';
  const payloads: Record<string, unknown>[] = [];
  let closed = false;

  await page.route('http://127.0.0.1:54321/rest/v1/caixa_diario**', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/1' }, body: JSON.stringify([{
      id: cashId, data: oldDate, aberto: !closed, valor_abertura: 70, valor_fechamento: closed ? 70 : null,
      operador_abertura: 'Conta QA sintética', operador_fechamento: closed ? 'Conta QA sintética' : null, clinica_id: synthetic.clinicId,
    }]) });
  });
  await page.route('**/rest/v1/rpc/movimentos_caixa_diario**', route => route.fulfill({ status: 200, json: [] }));
  await page.route('**/rest/v1/rpc/fechar_caixa_diario**', async route => {
    payloads.push(route.request().postDataJSON());
    closed = true;
    return route.fulfill({ status: 200, json: { code: 'fechado', caixa_id: cashId, data: oldDate } });
  });

  await page.goto(`/recepcao/caixa/${cashId}/fechar`);
  await expect(page.getByRole('heading', { name: 'Regularização de caixa anterior' })).toBeVisible();
  await page.getByLabel('Dinheiro contado na gaveta (R$)').fill('70,00');
  const confirm = page.getByRole('button', { name: 'Confirmar fechamento' });
  await expect(confirm).toBeEnabled();
  await expect(page.getByLabel(/Observações/)).toBeVisible();
  await expect(page.getByLabel(/Observações/)).toHaveValue('');
  await confirm.click();
  await expect(page).toHaveURL('/caixa-diario');
  expect(payloads).toHaveLength(1);
  expect(payloads[0]).toMatchObject({ p_caixa_id: cashId, p_valor_contado: 70, p_observacoes: null });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
