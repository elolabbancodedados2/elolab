import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('credenciais da integração são preenchidas em página própria e ficam só em memória', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin });
  const payloads: unknown[] = [];
  const catalogo = [{
    id: 'lab-qa', nome: 'Laboratório QA', descricao: 'Integração de teste sintético.', escopo: 'clinica',
    campos: [{ id: 'api_key', rotulo: 'Chave de acesso', tipo: 'segredo', obrigatorio: true, ajuda: 'A chave é guardada cifrada no servidor.' }],
  }];

  await page.route('http://127.0.0.1:54321/functions/v1/clinic-integrations', async route => {
    const payload = route.request().postDataJSON();
    if (payload.action === 'connect') payloads.push(payload);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload.action === 'list' ? { catalogo, conexoes: [] } : { ok: true }),
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/configuracoes?tab=integracoes');
  await expect(page.getByRole('heading', { name: 'Integrações da clínica' })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Conectar', exact: true }).click();
  await expect(page).toHaveURL('/configuracoes/integracoes/conectar/lab-qa');
  await expect(page.getByRole('heading', { name: 'Conectar Laboratório QA' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).not.toContainText('lab-qa');
  await page.screenshot({ path: testInfo.outputPath('clinic-integration-connect-desktop.png'), animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('clinic-integration-connect-mobile.png'), fullPage: true, animations: 'disabled' });
  const save = page.getByRole('button', { name: 'Salvar credencial' });
  await save.scrollIntoViewIfNeeded();
  await page.locator('#main-content').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const navigation = page.getByRole('navigation', { name: 'Navegação principal' });
  const [saveBox, navigationBox] = await Promise.all([save.boundingBox(), navigation.boundingBox()]);
  expect(saveBox && navigationBox && saveBox.y + saveBox.height <= navigationBox.y, JSON.stringify({ saveBox, navigationBox })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('clinic-integration-connect-mobile-actions.png'), animations: 'disabled' });

  const secret = 'synthetic-only-secret-qa-8231';
  await page.locator('#int-api_key').fill(secret);
  await expect(page.locator('#int-api_key')).toHaveAttribute('type', 'password');
  expect(await page.evaluate(() => Object.values(localStorage).join(' '))).not.toContain(secret);
  await expect(page).not.toHaveURL(new RegExp(secret));

  await page.getByRole('button', { name: 'Salvar credencial' }).click();
  await expect(page).toHaveURL('/configuracoes?tab=integracoes');
  expect(payloads).toEqual([{ action: 'connect', provedor: 'lab-qa', referencia_id: null, versao_esperada: null, valores: { api_key: secret } }]);
  expect(await page.evaluate(() => Object.values(localStorage).join(' '))).not.toContain(secret);

  await page.getByRole('button', { name: 'Conectar', exact: true }).click();
  await expect(page).toHaveURL('/configuracoes/integracoes/conectar/lab-qa');
  const draftSecret = 'another-synthetic-secret-qa-8231';
  await page.locator('#int-api_key').fill(draftSecret);
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar nesta página' }).click();
  await expect(page).toHaveURL('/configuracoes/integracoes/conectar/lab-qa');
  await expect(page.locator('#int-api_key')).toHaveValue(draftSecret);
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('button', { name: 'Descartar e sair' }).click();
  await expect(page).toHaveURL('/configuracoes?tab=integracoes');
  expect(await page.evaluate(() => Object.values(localStorage).join(' '))).not.toContain(draftSecret);

  await page.goto('/configuracoes/integracoes/conectar/lab-qa');
  await expect(page.getByRole('heading', { name: 'Conectar Laboratório QA' })).toBeVisible();
  await expect(page.locator('#int-api_key')).toHaveValue('');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
