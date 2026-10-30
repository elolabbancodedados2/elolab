import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('decisão LGPD usa página própria, mantém filtros e não salva evidência real', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: true, platformOnly: true });
  const networkEvents: string[] = [];
  page.on('requestfailed', request => networkEvents.push(`failed ${request.url()} ${request.failure()?.errorText}`));
  page.on('console', message => { if (message.type() === 'error') networkEvents.push(`console ${message.text()}`); });
  const request = {
    id: '00000000-0000-4000-8000-000000000201',
    clinica_id: '00000000-0000-4000-8000-000000000202',
    paciente_id: '00000000-0000-4000-8000-000000000203',
    request_type: 'export',
    status: 'pending',
    requested_at: '2026-10-29T10:00:00.000Z',
    prazo_em: '2026-11-28T23:59:59.000Z',
    fulfillment_date: null,
    updated_at: '2026-10-29T10:00:00.000Z',
    responsavel_id: null,
    base_legal: 'Atender a solicitação formal do titular.',
    evidencia: null,
  };
  const rpcCalls: unknown[] = [];

  await page.route('http://127.0.0.1:54321/rest/v1/lgpd_access_request_log*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([request]) });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/platform_retention_policies*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/platform_update_lgpd_request', async route => {
    rpcCalls.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/lgpd', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Registrar decisão' }), JSON.stringify(networkEvents)).toBeVisible({ timeout: 15000 });
  const search = page.getByRole('textbox', { name: 'Buscar solicitações LGPD' });
  await search.fill(request.paciente_id);
  await page.getByRole('button', { name: 'Registrar decisão' }).click();
  await expect(page).toHaveURL(`/admin/lgpd/${request.id}/decisao`);
  await expect(page.getByRole('heading', { name: 'Registrar decisão' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).not.toContainText(request.id);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('platform-lgpd-decision-workspace-mobile.png'), fullPage: true, animations: 'disabled' });
  const saveButton = page.getByRole('button', { name: 'Salvar decisão' });
  await saveButton.scrollIntoViewIfNeeded();
  const navigation = page.getByRole('navigation', { name: 'Navegação principal' });
  const [saveBox, navigationBox] = await Promise.all([saveButton.boundingBox(), navigation.boundingBox()]);
  expect(saveBox && navigationBox && saveBox.y + saveBox.height <= navigationBox.y, JSON.stringify({ saveBox, navigationBox })).toBe(true);

  await page.getByLabel('Resultado').click();
  await page.getByRole('option', { name: 'Negada' }).click();
  const evidence = 'Solicitação negada por documentação incompleta.';
  await page.getByLabel('Justificativa e evidência').fill(evidence);
  await page.getByRole('button', { name: 'Salvar decisão' }).click();
  await expect(page).toHaveURL('/admin/lgpd');
  await expect(page.getByRole('textbox', { name: 'Buscar solicitações LGPD' })).toHaveValue(request.paciente_id);
  expect(rpcCalls).toEqual([{ p_id: request.id, p_status: 'denied', p_evidence: evidence }]);

  await page.getByRole('button', { name: 'Registrar decisão' }).click();
  await page.getByLabel('Justificativa e evidência').fill('Rascunho ainda não registrado.');
  await page.getByRole('button', { name: 'Voltar à lista' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Descartar e sair' }).click();
  await expect(page).toHaveURL('/admin/lgpd');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
