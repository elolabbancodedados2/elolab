import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('atualização de incidente usa página própria, mantém a linha do tempo e protege o rascunho', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: true, platformOnly: true });
  const incident = {
    id: '00000000-0000-4000-8000-000000000101',
    title: 'Falha no envio de notificações',
    summary: 'Algumas notificações externas estão atrasadas. Nenhum dado clínico foi incluído.',
    severity: 'critical',
    status: 'investigating',
    affected_services: ['notifications'],
    started_at: '2026-10-30T10:00:00.000Z',
    resolved_at: null,
  };
  const updates = [{
    id: '00000000-0000-4000-8000-000000000102',
    incident_id: incident.id,
    message: 'A equipe iniciou a análise da fila externa.',
    status: 'investigating',
    created_at: '2026-10-30T10:05:00.000Z',
  }];
  const rpcCalls: unknown[] = [];

  await page.route('http://127.0.0.1:54321/rest/v1/platform_incidents*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([incident]) });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/platform_incident_updates*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updates) });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/platform_update_incident', async route => {
    rpcCalls.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/incidentes');
  await expect(page.getByRole('heading', { name: incident.title })).toBeVisible();
  await page.getByRole('button', { name: 'Ativos (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Atualizar status' }).click();
  await expect(page).toHaveURL(`/admin/incidentes/${incident.id}/atualizar`);
  await expect(page.getByRole('heading', { name: 'Atualizar incidente' })).toBeVisible();
  await expect(page.getByText('A equipe iniciou a análise da fila externa.')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('platform-incident-update-workspace-mobile.png'), fullPage: true, animations: 'disabled' });
  const saveButton = page.getByRole('button', { name: 'Salvar atualização' });
  await saveButton.scrollIntoViewIfNeeded();
  const navigation = page.getByRole('navigation', { name: 'Navegação principal' });
  const [saveBox, navigationBox] = await Promise.all([saveButton.boundingBox(), navigation.boundingBox()]);
  expect(saveBox && navigationBox && saveBox.y + saveBox.height <= navigationBox.y, JSON.stringify({ saveBox, navigationBox })).toBe(true);

  await page.getByLabel('Novo status').click();
  await page.getByRole('option', { name: 'Causa identificada' }).click();
  await page.getByLabel('O que mudou? *').fill('Causa confirmada: falha temporária na fila externa.');
  await page.getByRole('button', { name: 'Salvar atualização' }).click();
  await expect(page).toHaveURL('/admin/incidentes');
  await expect(page.getByRole('button', { name: 'Ativos (1)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(rpcCalls).toEqual([{
    p_id: incident.id,
    p_status: 'identified',
    p_message: 'Causa confirmada: falha temporária na fila externa.',
  }]);

  await page.getByRole('button', { name: 'Atualizar status' }).click();
  await page.getByLabel('O que mudou? *').fill('Atualização não salva');
  await page.getByRole('button', { name: 'Voltar à lista' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Descartar e sair' }).click();
  await expect(page).toHaveURL('/admin/incidentes');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
