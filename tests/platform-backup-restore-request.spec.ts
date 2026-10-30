import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('solicitação de restauração usa página própria e preserva a aprovação independente', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: true, platformOnly: true });
  const rpcCalls: unknown[] = [];
  const backup = { name: 'backup-2026-10-30.json', created_at: '2026-10-30T12:00:00.000Z', updated_at: '2026-10-30T12:00:00.000Z', size_bytes: 2_097_152 };

  await page.route('http://127.0.0.1:54321/rest/v1/rpc/platform_get_backup_overview', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ generated_at: backup.created_at, retention_days: 90, backup_schedule: 'Diário', verification_schedule: 'Diário', files: [backup], logs: [] }) });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/platform_restore_requests*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/platform_request_restore', async route => {
    rpcCalls.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/backups', { waitUntil: 'domcontentloaded' });
  const openRequest = page.getByRole('button', { name: 'Solicitar restauração' });
  await expect(openRequest).toBeVisible({ timeout: 15000 });
  await openRequest.click();
  await expect(page).toHaveURL('/admin/backups/restaurar');
  await expect(page.getByRole('heading', { name: 'Solicitar restauração' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(backup.name)).toBeVisible();
  await expect(page).not.toHaveURL(new RegExp(backup.name));

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('platform-backup-restore-request-mobile.png'), fullPage: true, animations: 'disabled' });

  const reason = 'Incidente operacional confirmado; recuperar o estado consistente anterior à falha.';
  await page.getByLabel('Justificativa (20 a 1.000 caracteres)').fill(reason);
  const submit = page.getByRole('button', { name: 'Enviar para aprovação' });
  await submit.scrollIntoViewIfNeeded();
  const navigation = page.getByRole('navigation', { name: 'Navegação principal' });
  const [submitBox, navigationBox] = await Promise.all([submit.boundingBox(), navigation.boundingBox()]);
  expect(submitBox && navigationBox && submitBox.y + submitBox.height <= navigationBox.y, JSON.stringify({ submitBox, navigationBox })).toBe(true);
  await submit.click();
  await expect(page).toHaveURL('/admin/backups');
  expect(rpcCalls).toEqual([{ p_backup_name: backup.name, p_reason: reason, p_scope: 'full', p_scope_ref: null }]);

  await page.getByRole('button', { name: 'Solicitar restauração' }).click();
  await page.getByLabel('Justificativa (20 a 1.000 caracteres)').fill('Rascunho operacional não enviado.');
  await page.getByRole('link', { name: 'Voltar aos backups' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Descartar e sair' }).click();
  await expect(page).toHaveURL('/admin/backups');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
