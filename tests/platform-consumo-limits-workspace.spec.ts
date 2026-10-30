import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

async function setup(page: Parameters<typeof installSyntheticClinic>[0], appOrigin: string, failUsageAttempts = 0) {
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: true, platformOnly: true });
  const updateCalls: unknown[] = [];
  let usageCalls = 0;
  const clinic = {
    clinica_id: synthetic.clinicId,
    clinica_nome: 'Clínica Horizonte',
    max_users: 10,
    users_used: 7,
    max_ai_tokens: 50000,
    ai_tokens_used: 42000,
    max_notifications: 150,
    notifications_used: 30,
  };

  await page.route('http://127.0.0.1:54321/rest/v1/rpc/platform_usage_overview', async route => {
    usageCalls += 1;
    if (usageCalls <= failUsageAttempts) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Falha sintética de leitura' }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ generated_at: '2026-10-30T12:00:00.000Z', clinics: [clinic] }) });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/platform_set_tenant_limits', async route => {
    updateCalls.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });

  return { synthetic, clinic, updateCalls, usageCalls: () => usageCalls };
}

test('limites da clínica são editados em página própria com aviso, filtros preservados e RPC existente', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const { synthetic, clinic, updateCalls } = await setup(page, appOrigin);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/consumo');
  await expect(page.getByText('Clínica Horizonte')).toBeVisible();
  await page.getByRole('textbox', { name: 'Buscar clínica' }).fill('Horizonte');
  await page.getByRole('button', { name: 'Editar limites' }).click();
  await expect(page).toHaveURL(`/admin/consumo/${clinic.clinica_id}/limites`);
  await expect(page.getByRole('heading', { name: 'Editar limites' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).not.toContainText(clinic.clinica_id);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('platform-consumo-limits-workspace-mobile.png'), fullPage: true, animations: 'disabled' });
  const saveButton = page.getByRole('button', { name: 'Salvar limites' });
  await saveButton.scrollIntoViewIfNeeded();
  const navigation = page.getByRole('navigation', { name: 'Navegação principal' });
  const [saveBox, navigationBox] = await Promise.all([saveButton.boundingBox(), navigation.boundingBox()]);
  expect(saveBox && navigationBox && saveBox.y + saveBox.height <= navigationBox.y, JSON.stringify({ saveBox, navigationBox })).toBe(true);

  const userLimit = page.getByLabel('Assentos de usuários');
  await userLimit.fill('0');
  await expect(userLimit).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: 'Salvar limites' })).toBeDisabled();
  await userLimit.fill('8');
  await page.getByLabel('Tokens de IA por mês').fill('20000');
  await expect(page.getByRole('alert').getByText('O limite ficará abaixo do consumo atual')).toBeVisible();
  await page.getByLabel('Notificações por mês').fill('150');
  await page.getByRole('button', { name: 'Salvar limites' }).click();

  await expect(page).toHaveURL('/admin/consumo');
  await expect(page.getByRole('textbox', { name: 'Buscar clínica' })).toHaveValue('Horizonte');
  expect(updateCalls).toEqual([{
    p_clinica_id: clinic.clinica_id,
    p_max_users: 8,
    p_max_ai_tokens: 20000,
    p_max_notifications: 150,
  }]);

  await page.getByRole('button', { name: 'Editar limites' }).click();
  await page.getByLabel('Tokens de IA por mês').fill('30000');
  await page.getByRole('button', { name: 'Voltar à lista' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Descartar e sair' }).click();
  await expect(page).toHaveURL('/admin/consumo');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('workspace de limites oferece nova tentativa após falha de carregamento', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const { synthetic, clinic, usageCalls } = await setup(page, appOrigin, 100);
  await page.goto(`/admin/consumo/${clinic.clinica_id}/limites`);
  await expect(page.getByRole('heading', { name: 'Limites indisponíveis' })).toBeVisible({ timeout: 20000 });
  const requestsBeforeRetry = usageCalls();
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect.poll(() => usageCalls()).toBeGreaterThan(requestsBeforeRetry);
  await expect(page.getByRole('heading', { name: 'Limites indisponíveis' })).toBeVisible();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
