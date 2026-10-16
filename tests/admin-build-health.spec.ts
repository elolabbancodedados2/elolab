import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('painel admin mostra SHA, horário do build e resultados dos checks públicos', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: true });
  const databaseChecks: Array<{ method: string; body: unknown }> = [];
  await page.route('**/version.json', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ build_id: 'sha-qa-100', built_at: '2026-10-14T13:00:00.000Z' }) });
  });
  await page.route('**/auth/v1/health', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ name: 'GoTrue', version: 'synthetic' }) });
  });
  await page.route('**/rest/v1/rpc/public_availability_check', async route => {
    databaseChecks.push({ method: route.request().method(), body: route.request().postDataJSON() });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, checked_at: '2026-10-14T13:01:00.000Z' }) });
  });

  await page.goto('/painel-admin');
  const card = page.getByRole('region', { name: 'Versão e disponibilidade' });
  await expect(card).toBeVisible();
  await expect(card.getByText('sha-qa-100')).toBeVisible();
  await expect(card.getByText('14/10/2026, 10:00')).toBeVisible();
  await expect(card.getByText('Aplicação EloLab')).toBeVisible();
  await expect(card.getByText('Autenticação')).toBeVisible();
  await expect(card.getByText('API e banco de dados')).toBeVisible();
  await expect(card.getByText('Disponível')).toHaveCount(3);
  expect(databaseChecks).toEqual([{ method: 'POST', body: {} }]);
  await card.getByRole('button', { name: 'Atualizar' }).click();
  await expect.poll(() => databaseChecks.length).toBe(2);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
