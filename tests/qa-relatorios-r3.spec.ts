import { expect, test, type Request } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block', trace: 'retain-on-failure' });

test('exige gerar novamente depois de editar filtros antes de exportar', async ({ page, context }, testInfo) => {
  await context.addInitScript(() => { window.print = () => {}; });
  await installSyntheticClinic(page, { accountsPopulated: true });
  await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
  await page.goto('/relatorios');
  await page.getByRole('button', { name: 'Gerar relatório', exact: true }).click();
  await expect(page.getByRole('button', { name: 'CSV', exact: true })).toBeEnabled();
  await page.getByRole('textbox', { name: 'Data inicial do relatorio' }).fill('2026-01-01');
  for (const name of ['CSV', 'Excel', 'Imprimir / PDF']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  }
  await expect(page.getByRole('status').filter({ hasText: 'filtros foram alterados' })).toBeVisible();
  await page.getByRole('button', { name: 'Gerar relatório', exact: true }).click();
  await expect(page.getByRole('button', { name: 'CSV', exact: true })).toBeEnabled();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Imprimir / PDF', exact: true }).click();
  const print = await popupPromise;
  await expect(print.locator('.meta')).toContainText('Período: 2026-01-01');
  await expect(print.getByRole('table')).toContainText('Valor');
  await expect(print.getByRole('table').locator('tbody tr')).not.toHaveCount(0);
  await print.screenshot({ path: testInfo.outputPath('impressao.png'), fullPage: true });
  await print.pdf({ path: testInfo.outputPath('relatorio.pdf'), format: 'A4' });
  await print.close();
});

for (const width of [1280, 390]) {
test(`DRE só permite exportar valores carregados e confere CSV mensal e anual em ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 844 });
  const errors: string[] = [];
  const pendingRequests = new Map<Request, string>();
  const networkFailures: string[] = [];
  page.on('request', request => pendingRequests.set(request, `${request.method()} ${new URL(request.url()).pathname} (${request.resourceType()})`));
  page.on('requestfinished', request => pendingRequests.delete(request));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('ERR_BLOCKED_BY_CLIENT')) errors.push(message.text()); });
  page.on('requestfailed', request => {
    const reason = request.failure()?.errorText;
    networkFailures.push(`${pendingRequests.get(request)}: ${reason}`);
    pendingRequests.delete(request);
    if (!reason?.includes('ERR_BLOCKED_BY_CLIENT') && reason !== 'net::ERR_ABORTED') errors.push(`Falha de rede: ${request.url()}`);
  });
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  await installSyntheticClinic(page);
  await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
  await page.route('**/rest/v1/plano_contas?*', route => route.fulfill({ json: [
    { id: 'receita', codigo: '1', nome: 'Consultas', natureza: 'receita', grupo_dre: 'receita_bruta', pai_id: null, ativo: true },
  ] }));
  await page.route('**/rest/v1/plano_contas_categorias?*', route => route.fulfill({ json: [
    { id: 'vinculo', natureza: 'receita', categoria: 'consulta', conta_id: 'receita' },
  ] }));
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/rest/v1/lancamentos?*', async route => {
    await pending;
    await route.fulfill({ json: [{ id: 'l1', tipo: 'receita', categoria: 'consulta', descricao: 'Consulta QA', status: 'pago', valor: 1250.50, valor_pago: 1250.50, data: '2026-10-05', data_pagamento: '2026-10-05' }] });
  });
  try {
    await page.goto('/financeiro/dre?mes=2026-10');
    await page.getByRole('button', { name: 'Mais ações da DRE' }).click();
    await expect(page.getByRole('menuitem', { name: 'Exportar CSV' })).toBeDisabled();
  } finally {
    release();
    const documentState = await page.evaluate(() => ({
      readyState: document.readyState,
      initialLoaderPresent: !!document.getElementById('initial-loader'),
      appMainPresent: !!document.getElementById('main-content'),
    })).catch(() => null);
    const diagnosticPath = testInfo.outputPath('diagnostico-abertura-dre.json');
    await writeFile(diagnosticPath, JSON.stringify({ documentState, errors, networkFailures, pendingRequests: [...pendingRequests.values()] }, null, 2), 'utf8');
    await testInfo.attach('diagnostico-abertura-dre', { path: diagnosticPath, contentType: 'application/json' });
  }
  await expect(page.getByRole('menuitem', { name: 'Exportar CSV' })).toBeEnabled();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Exportar CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('dre-gerencial-2026-10.csv');
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain('Valor 2026-10');
  expect(csv).toContain('"Receita bruta";"";"1250,50"');
  expect(csv).toContain('Resultado líquido');
  await page.getByRole('tab', { name: 'DRE anual', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'DRE anual de 2026' })).toBeVisible();
  await expect(page.getByRole('row', { name: /^Receita bruta/ })).toContainText('1.250,50');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`dre-anual-${width}.png`), fullPage: true });
  await page.getByRole('button', { name: 'Mais ações da DRE' }).click();
  const annualPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Exportar CSV' }).click();
  const annual = await annualPromise;
  expect(annual.suggestedFilename()).toBe('dre-anual-2026.csv');
  const annualCsv = await readFile((await annual.path())!, 'utf8');
  expect(annualCsv.split('\r\n')[0]).toContain('"2026-01"');
  expect(annualCsv.split('\r\n')[0]).toContain('"Total 2026"');
  expect(annualCsv.split('\r\n')[1]).toBe('"Receita bruta";"0,00";"0,00";"0,00";"0,00";"0,00";"0,00";"0,00";"0,00";"0,00";"1250,50";"0,00";"0,00";"1250,50"');
  expect(errors).toEqual([]);
});
}
