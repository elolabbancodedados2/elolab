import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const todaySaoPaulo = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

test('cash reopening is an audited page, retains its reason on failure, and retries the same payload', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'admin' });
  const today = todaySaoPaulo();
  const cashId = '00000000-0000-4000-9000-000000000082';
  const payloads: Record<string, unknown>[] = [];
  let opened = false;

  await page.route('http://127.0.0.1:54321/rest/v1/caixa_diario**', async route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('clinica_id')).toBe(`eq.${synthetic.clinicId}`);
    const row = {
      id: cashId, data: today, aberto: opened, valor_abertura: 100, operador_abertura: 'Operador QA',
      clinica_id: synthetic.clinicId,
    };
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/1' }, body: JSON.stringify([row]) });
  });
  await page.route('**/rest/v1/rpc/reabrir_caixa_diario', async route => {
    payloads.push(route.request().postDataJSON());
    if (payloads.length === 1) return route.fulfill({ status: 400, json: { code: 'P0001', message: 'Falha sintética ao reabrir o caixa' } });
    opened = true;
    return route.fulfill({ status: 200, json: { code: 'reaberto', caixa_id: cashId, data: today } });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/recepcao/caixa/reabrir', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Reabrir caixa fechado' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Confirmar reabertura' })).toBeDisabled();
  await page.getByLabel(/Motivo da reabertura/).fill('Correção de lançamento após conferência.');
  const action = page.getByRole('button', { name: 'Confirmar reabertura' });
  await expect(action).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('cash-reopen-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: testInfo.outputPath('cash-reopen-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await action.scrollIntoViewIfNeeded();
  const actionBounds = await action.boundingBox();
  const mobileNavigation = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
  expect(actionBounds).not.toBeNull();
  expect(mobileNavigation).not.toBeNull();
  expect(actionBounds!.y + actionBounds!.height).toBeLessThan(mobileNavigation!.y);
  await page.screenshot({ path: testInfo.outputPath('cash-reopen-mobile-action.png'), animations: 'disabled' });

  await action.click();
  await expect(page.getByText('Falha sintética ao reabrir o caixa')).toBeVisible();
  await expect(page.getByLabel(/Motivo da reabertura/)).toHaveValue('Correção de lançamento após conferência.');
  await action.click();
  await expect(page).toHaveURL('/recepcao?tab=caixa');
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toMatchObject({ p_motivo: 'Correção de lançamento após conferência.' });
  expect(payloads[1]).toMatchObject(payloads[0]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('cash reopening recognizes a committed RPC when the response is lost', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'financeiro' });
  const today = todaySaoPaulo();
  const cashId = '00000000-0000-4000-9000-000000000083';
  let opened = false;
  let attempts = 0;

  await page.route('http://127.0.0.1:54321/rest/v1/caixa_diario**', async route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/1' },
    body: JSON.stringify([{ id: cashId, data: today, aberto: opened, valor_abertura: 80, operador_abertura: 'Operador QA', clinica_id: synthetic.clinicId }]),
  }));
  await page.route('**/rest/v1/rpc/reabrir_caixa_diario', async route => {
    attempts += 1;
    opened = true;
    return route.fulfill({ status: 400, json: { code: 'NETWORK', message: 'Resposta perdida após salvar' } });
  });

  await page.goto('/recepcao/caixa/reabrir');
  await page.getByLabel(/Motivo da reabertura/).fill('A reabertura foi registrada.');
  await page.getByRole('button', { name: 'Confirmar reabertura' }).click();
  await expect(page).toHaveURL('/recepcao?tab=caixa');
  expect(attempts).toBe(1);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
