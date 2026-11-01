import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const todaySaoPaulo = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

async function installOpenCash(page: Page) {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'recepcao' });
  const today = todaySaoPaulo();
  await page.route('http://127.0.0.1:54321/rest/v1/caixa_diario**', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const requestedDate = url.searchParams.get('data');
    const requestedId = url.searchParams.get('id');
    const matches = (!requestedDate || requestedDate === `eq.${today}`)
      && (!requestedId || requestedId === 'eq.00000000-0000-4000-9000-000000000081');
    const rows = matches ? [{
      id: '00000000-0000-4000-9000-000000000081', data: today, aberto: true,
      valor_abertura: 125, valor_fechamento: null, operador_abertura: 'Conta QA sintética',
      operador_fechamento: null, clinica_id: synthetic.clinicId,
    }] : [];
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': `*/${rows.length}` }, body: JSON.stringify(rows) });
  });
  return synthetic;
}

async function installMovementWrites(page: Page, failFirst = false) {
  const payloads: Record<string, unknown>[] = [];
  await page.route('http://127.0.0.1:54321/rest/v1/lancamentos**', async route => {
    if (route.request().method() !== 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '*/0' }, body: '[]' });
    }
    const body = route.request().postDataJSON();
    payloads.push((Array.isArray(body) ? body[0] : body) as Record<string, unknown>);
    if (failFirst && payloads.length === 1) {
      return route.fulfill({ status: 503, json: { code: 'SYNTHETIC_FAILURE', message: 'Falha sintética ao registrar movimento' } });
    }
    return route.fulfill({ status: 201, body: '', headers: { 'access-control-allow-origin': '*' } });
  });
  return payloads;
}

test('cash withdrawal opens a page and keeps its reason and idempotency key after an error', async ({ page }) => {
  const synthetic = await installOpenCash(page);
  const payloads = await installMovementWrites(page, true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/caixa-diario');
  await page.getByRole('button', { name: 'Sangria', exact: true }).click();
  await expect(page).toHaveURL('/recepcao/caixa/sangria');
  await expect(page.getByRole('heading', { name: 'Registrar sangria' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Valor da retirada (R$)').fill('32,501');
  await expect(page.getByRole('button', { name: 'Registrar sangria' })).toBeDisabled();
  await page.getByLabel('Valor da retirada (R$)').fill('32,50');
  const confirm = page.getByRole('button', { name: 'Registrar sangria' });
  await expect(confirm).toBeDisabled();
  await page.getByLabel('Motivo da retirada').fill('Troco para o balcão');
  await expect(confirm).toBeEnabled();
  await page.locator('#main-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(confirm).toBeInViewport();
  const actionBox = await confirm.boundingBox();
  const mobileNavigation = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
  expect(actionBox).not.toBeNull();
  expect(mobileNavigation).not.toBeNull();
  expect(actionBox!.y + actionBox!.height).toBeLessThan(mobileNavigation!.y);
  await page.getByRole('button', { name: 'Voltar ao caixa diário' }).click();
  const discard = page.getByRole('alertdialog');
  await expect(discard).toContainText('Alterações não salvas');
  await discard.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(discard).toHaveCount(0);
  await expect(page.getByLabel('Motivo da retirada')).toHaveValue('Troco para o balcão');
  await confirm.click();
  await expect(page.getByRole('alert')).toContainText('Falha sintética ao registrar movimento');
  await expect(page.getByLabel('Valor da retirada (R$)')).toHaveValue('32,50');
  await expect(page.getByLabel('Motivo da retirada')).toHaveValue('Troco para o balcão');
  await confirm.click();
  await expect(page).toHaveURL('/caixa-diario');
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toMatchObject({
    tipo: 'sangria', valor: 32.5, descricao: 'Sangria — Troco para o balcão', forma_pagamento: 'dinheiro', status: 'pago',
  });
  expect(payloads[1]).toMatchObject(payloads[0]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('cash replenishment stays on its own page and preserves the optional description default', async ({ page }) => {
  const synthetic = await installOpenCash(page);
  const payloads = await installMovementWrites(page);

  await page.goto('/recepcao/caixa/suprimento');
  await expect(page.getByRole('heading', { name: 'Registrar suprimento' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Valor do suprimento (R$)').fill('25,00');
  await expect(page.getByRole('button', { name: 'Adicionar suprimento' })).toBeEnabled();
  await page.getByRole('button', { name: 'Adicionar suprimento' }).click();
  await expect(page).toHaveURL('/caixa-diario');
  expect(payloads).toHaveLength(1);
  expect(payloads[0]).toMatchObject({ tipo: 'suprimento', valor: 25, descricao: 'Suprimento de Caixa', forma_pagamento: 'dinheiro', status: 'pago' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('cash expense preserves category and payment method on its own page', async ({ page }, testInfo) => {
  // 22:30 em São Paulo já é o dia seguinte em UTC: a despesa precisa ficar no caixa de hoje.
  await page.clock.setFixedTime(new Date(`${todaySaoPaulo()}T22:30:00-03:00`));
  const synthetic = await installOpenCash(page);
  const payloads = await installMovementWrites(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/recepcao/caixa/despesa');
  await expect(page.getByRole('heading', { name: 'Registrar despesa' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Valor da despesa (R$)').fill('60,90');
  await page.getByLabel('Descrição da despesa').fill('Material de limpeza');
  await page.getByLabel('Categoria da despesa').click();
  await page.getByRole('option', { name: 'Limpeza' }).click();
  await page.getByLabel('Forma de pagamento').click();
  await page.getByRole('option', { name: 'PIX', exact: true }).click();
  const confirm = page.locator('#main-content').getByRole('button', { name: 'Registrar despesa' });
  await expect(confirm).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('cash-expense-mobile.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#main-content').evaluate(element => { element.scrollTop = 0; });
  await expect(page.getByRole('heading', { name: 'Registrar despesa' })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('cash-expense-desktop.png'), fullPage: true, animations: 'disabled' });
  await confirm.click();
  await expect(page).toHaveURL('/caixa-diario');
  expect(payloads).toHaveLength(1);
  expect(payloads[0]).toMatchObject({ tipo: 'despesa', valor: 60.9, descricao: 'Material de limpeza', categoria: 'Limpeza', forma_pagamento: 'pix', status: 'pago' });
  expect(payloads[0]).toMatchObject({ data: todaySaoPaulo(), data_pagamento: todaySaoPaulo() });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('cash movement pages do not accept an inaccessible or closed register', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'recepcao' });
  await page.route('http://127.0.0.1:54321/rest/v1/caixa_diario**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '*/0' }, body: '[]',
  }));

  await page.goto('/recepcao/caixa/despesa');
  await expect(page.getByRole('heading', { name: 'Caixa não disponível para movimentos' })).toBeVisible();
  await expect(page.locator('#main-content').getByRole('button', { name: 'Registrar despesa' })).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
