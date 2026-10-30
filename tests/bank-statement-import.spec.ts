import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const OFX = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTRS><BANKACCTFROM><BANKID>1<ACCTID>9<BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><DTPOSTED>20261002<TRNAMT>150.00<FITID>A1<MEMO>PIX QA</STMTTRN>
<STMTTRN><DTPOSTED>20261003<TRNAMT>-89.90<FITID>A2<MEMO>TARIFA QA</STMTTRN>
<STMTTRN><DTPOSTED>20261002<TRNAMT>150.00<FITID>A1<MEMO>PIX QA repetida</STMTTRN>
</BANKTRANLIST></STMTRS></BANKMSGSRSV1></OFX>`;

async function installStatementContext(page: Page) {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'financeiro' });
  const launchReadMethods: string[] = [];
  await page.route('http://127.0.0.1:54321/rest/v1/lancamentos**', route => {
    launchReadMethods.push(route.request().method());
    return route.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'content-range': '*/1' },
      body: JSON.stringify([{
        id: '00000000-0000-4000-9000-000000000101', tipo: 'receita', descricao: 'Consulta QA',
        valor: 150, valor_pago: 150, status: 'pago', data: '2026-10-01',
        data_pagamento: '2026-10-01', data_vencimento: null,
      }]),
    });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/extrato_bancario_transacoes**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', 'content-range': '*/1' },
    body: JSON.stringify([{ fitid: 'A2' }]),
  }));
  return { synthetic, launchReadMethods };
}

async function uploadOfx(page: Page, name: string, contents: string) {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Selecionar arquivo OFX' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name, mimeType: 'application/x-ofx', buffer: Buffer.from(contents) });
}

test('OFX import has its own page, preserves month, suggests matches, and retries safely', async ({ page }, testInfo) => {
  const { synthetic, launchReadMethods } = await installStatementContext(page);
  const payloads: Record<string, unknown>[] = [];
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/importar_extrato_bancario', async route => {
    payloads.push(route.request().postDataJSON() as Record<string, unknown>);
    if (payloads.length === 1) {
      await route.fulfill({ status: 503, json: { code: 'SYNTHETIC_FAILURE', message: 'Falha sintética após importar extrato' } });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ importadas: 1, repetidas: 1 }) });
  });

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/fluxo-caixa?mes=2026-10');
  await page.getByRole('link', { name: 'Importar extrato' }).click();
  await expect(page).toHaveURL('/fluxo-caixa/extrato?mes=2026-10');
  await expect(page.getByRole('heading', { name: 'Importar extrato bancário' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await uploadOfx(page, 'outubro.ofx', OFX);
  await expect(page.getByText('outubro.ofx · conta 1-9')).toBeVisible();
  await expect(page.getByText('3 transações', { exact: true })).toBeVisible();
  await expect(page.getByText('1 nova', { exact: true })).toBeVisible();
  await expect(page.getByText('1 já importada', { exact: true })).toBeVisible();
  await expect(page.getByText('1 repetida', { exact: true })).toBeVisible();
  await expect(page.getByText('Consulta QA').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('bank-statement-desktop.png'), animations: 'disabled' });
  const register = page.getByRole('button', { name: 'Registrar 1 transação nova' });
  await register.click();
  await expect(page.getByRole('alert')).toContainText('Falha sintética após importar extrato');
  await expect(page.getByText('3 transações', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#main-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(register).toBeInViewport();
  const actionBox = await register.boundingBox();
  const navigationBox = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
  expect(actionBox).not.toBeNull();
  expect(navigationBox).not.toBeNull();
  expect(actionBox!.y + actionBox!.height).toBeLessThan(navigationBox!.y);
  await page.screenshot({ path: testInfo.outputPath('bank-statement-mobile.png'), animations: 'disabled' });
  await register.click();
  await expect(page).toHaveURL('/fluxo-caixa?mes=2026-10');
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toMatchObject({
    p_conta: '1-9', p_transacoes: [{ fitid: 'A1', data: '2026-10-02', valor: 150, descricao: 'PIX QA' }],
  });
  expect(payloads[1]).toMatchObject(payloads[0]);
  expect(launchReadMethods.every(method => method === 'GET')).toBe(true);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('invalid OFX keeps the user on the page and shows a recoverable error', async ({ page }) => {
  const synthetic = await installStatementContext(page);
  await page.goto('/fluxo-caixa/extrato?mes=2026-10');
  await uploadOfx(page, 'invalido.ofx', 'arquivo inválido');
  await expect(page.getByRole('alert')).toContainText('Nenhuma transação encontrada');
  await expect(page.getByRole('button', { name: /Registrar/ })).toHaveCount(0);
  expect(synthetic.synthetic.assertAllWritesAreMocked()).toBe(true);
});
