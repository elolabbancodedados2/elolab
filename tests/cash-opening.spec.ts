import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('cash opening has a protected page and retains the counted amount after an RPC error', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const payloads: Record<string, unknown>[] = [];
  let opened = false;

  await page.route('http://127.0.0.1:54321/rest/v1/caixa_diario**', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const isToday = url.searchParams.get('data') === `eq.${today}`;
    const caixa = {
      id: '00000000-0000-4000-9000-000000000061', data: today, aberto: true,
      valor_abertura: 100, operador_abertura: 'Conta QA sintética',
      operador_fechamento: null, valor_fechamento: null,
      clinica_id: synthetic.clinicId, created_at: new Date().toISOString(),
    };
    const rows = opened && isToday ? [caixa] : [];
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': `*/${rows.length}` }, body: JSON.stringify(rows) });
  });
  await page.route('**/rest/v1/rpc/abrir_caixa_diario', async route => {
    payloads.push(route.request().postDataJSON());
    if (payloads.length === 1) return route.fulfill({ status: 400, json: { code: 'P0001', message: 'Falha sintética ao abrir o caixa' } });
    opened = true;
    return route.fulfill({ status: 200, json: { code: 'aberto', caixa_id: '00000000-0000-4000-9000-000000000061', data: today } });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/caixa-diario');
  await page.getByRole('button', { name: 'Abrir Caixa' }).first().click();
  await expect(page).toHaveURL('/recepcao/caixa/abrir');
  await expect(page.getByRole('heading', { name: 'Abrir caixa' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByLabel('Valor inicial em caixa (R$)').fill('100,00');
  await page.getByRole('button', { name: 'Confirmar abertura' }).scrollIntoViewIfNeeded();
  const actionBox = await page.getByRole('button', { name: 'Confirmar abertura' }).boundingBox();
  const navBox = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
  expect(actionBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  expect(actionBox!.y + actionBox!.height).toBeLessThan(navBox!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('cash-opening-mobile.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('cash-opening-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.getByRole('button', { name: 'Voltar ao caixa diário' }).click();
  const discard = page.getByRole('alertdialog');
  await expect(discard).toContainText('Alterações não salvas');
  await discard.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByLabel('Valor inicial em caixa (R$)')).toHaveValue('100,00');

  await page.getByRole('button', { name: 'Confirmar abertura' }).click();
  await expect(page.getByText('Falha sintética ao abrir o caixa')).toBeVisible();
  await expect(page.getByLabel('Valor inicial em caixa (R$)')).toHaveValue('100,00');
  await page.getByRole('button', { name: 'Confirmar abertura' }).click();
  await expect(page).toHaveURL('/caixa-diario');
  await expect(page.getByRole('button', { name: 'Nova Venda' }).first()).toBeVisible();
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toMatchObject({ p_valor_abertura: 100 });
  expect(payloads[1]).toMatchObject(payloads[0]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('cash opening prevents a second register for a day already closed', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  await page.route('http://127.0.0.1:54321/rest/v1/caixa_diario**', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/1' },
      body: JSON.stringify([{
        id: '00000000-0000-4000-9000-000000000062', data: today, aberto: false,
        valor_abertura: 80, valor_fechamento: 82, operador_abertura: 'Conta QA sintética',
        operador_fechamento: 'Conta QA sintética', clinica_id: synthetic.clinicId,
      }]),
    });
  });

  await page.goto('/recepcao/caixa/abrir');
  await expect(page.getByRole('heading', { name: 'O caixa de hoje já foi encerrado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar abertura' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ir ao caixa diário' })).toBeVisible();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('cash opening keeps the warning about older open registers', async ({ page }) => {
  await installSyntheticClinic(page, { platformAdmin: false });
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const oldDate = '2026-10-29';
  await page.route('http://127.0.0.1:54321/rest/v1/caixa_diario**', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const olderQuery = url.searchParams.get('data') === `lt.${today}`;
    const rows = olderQuery ? [{
      id: '00000000-0000-4000-9000-000000000063', data: oldDate, aberto: true,
      valor_abertura: 60, operador_abertura: 'Conta QA sintética',
    }] : [];
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': `*/${rows.length}` }, body: JSON.stringify(rows) });
  });

  await page.goto('/recepcao/caixa/abrir');
  await expect(page.getByRole('heading', { name: 'Há caixas de dias anteriores ainda abertos' })).toBeVisible();
  await expect(page.getByText('A abertura de hoje continua disponível, como no fluxo atual.')).toBeVisible();
  await expect(page.getByLabel('Valor inicial em caixa (R$)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar abertura' })).toBeDisabled();
});
