import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const sessionRow = (instanceName: string) => ({
  id: `session-${instanceName}`,
  instance_name: instanceName,
  instance_id: `evolution-${instanceName}`,
  phone_number: null,
  qr_code: 'synthetic-qr-payload',
  status: 'qr_code',
  agent_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  clinica_id: '00000000-0000-4000-8000-000000000002',
  whatsapp_agents: null,
});

test('criação usa página própria, mantém rascunho em caso de falha e volta ao acionador', async ({ page }, testInfo) => {
  await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false, ultraPlan: true });
  const sessions: ReturnType<typeof sessionRow>[] = [];
  let createAttempts = 0;

  await page.route('**/rest/v1/whatsapp_sessions*', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, json: sessions });
    return route.fallback();
  });
  await page.route('**/functions/v1/whatsapp-evolution', async route => {
    const payload = route.request().postDataJSON() as { action?: string; instance_name?: string };
    if (payload.action !== 'create_instance') return route.fulfill({ status: 200, json: { success: true, data: {} } });
    createAttempts += 1;
    await route.fulfill({ status: 409, json: { error: 'Este nome de instância já está em uso. Escolha outro.' } });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/agente-ia');
  await expect(page.getByRole('heading', { name: 'Sessões de WhatsApp', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Criar Primeira Sessão' }).click();
  await expect(page).toHaveURL('/agente-ia/sessoes/nova');
  await expect(page.getByRole('heading', { name: 'Conectar sessão de WhatsApp' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const createButton = page.getByRole('button', { name: 'Criar sessão', exact: true });
  const mobileNavigation = page.getByRole('navigation', { name: 'Navegação principal' });
  const [createBox, navigationBox] = await Promise.all([createButton.boundingBox(), mobileNavigation.boundingBox()]);
  expect(createBox && navigationBox && createBox.y + createBox.height <= navigationBox.y).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('whatsapp-session-create-mobile.png'), fullPage: true, animations: 'disabled' });

  const nameInput = page.getByLabel('Nome da sessão *');
  await nameInput.fill('_invalida');
  await expect(createButton).toBeDisabled();
  await expect(page.getByText('O nome deve começar com uma letra ou número.')).toBeVisible();
  await nameInput.fill('Recepcao_Principal');
  await createButton.click();
  await expect(page.getByRole('alert')).toContainText('O nome foi mantido');
  await expect(nameInput).toHaveValue('Recepcao_Principal');
  await expect(page).toHaveURL('/agente-ia/sessoes/nova');
  expect(createAttempts).toBe(1);

  await page.getByRole('button', { name: 'Voltar às sessões' }).click();
  const discard = page.getByRole('alertdialog', { name: 'Sair sem salvar?' });
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: 'Descartar e sair' }).click();
  await expect(page).toHaveURL('/agente-ia');
  await expect(page.getByRole('button', { name: 'Criar Primeira Sessão' })).toBeFocused();
});

test('sessão criada volta à lista com o QR Code e validação de layout desktop', async ({ page }, testInfo) => {
  await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false, ultraPlan: true });
  const sessions: ReturnType<typeof sessionRow>[] = [];
  const requests: Array<{ action?: string; instance_name?: string }> = [];

  await page.route('**/rest/v1/whatsapp_sessions*', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, json: sessions });
    return route.fallback();
  });
  await page.route('**/functions/v1/whatsapp-evolution', async route => {
    const payload = route.request().postDataJSON() as { action?: string; instance_name?: string };
    requests.push(payload);
    if (payload.action === 'create_instance' && payload.instance_name) {
      const session = sessionRow(payload.instance_name);
      sessions.push(session);
      return route.fulfill({ status: 200, json: { success: true, data: { session, qr_code: session.qr_code } } });
    }
    return route.fulfill({ status: 200, json: { success: true, data: {} } });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/agente-ia');
  await page.getByRole('button', { name: 'Nova Sessão' }).click();
  await expect(page).toHaveURL('/agente-ia/sessoes/nova');
  await page.getByLabel('Nome da sessão *').fill('clinica-principal_2');
  await page.screenshot({ path: testInfo.outputPath('whatsapp-session-create-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Criar sessão', exact: true }).click();

  await expect(page).toHaveURL('/agente-ia');
  await expect(page.getByText('clinica-principal_2', { exact: true })).toBeVisible();
  await expect(page.locator('img[alt="QR Code para conectar o WhatsApp"]')).toBeVisible();
  await expect(page.locator('#whatsapp-sessions-heading')).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('whatsapp-session-created-desktop.png'), fullPage: true, animations: 'disabled' });
  expect(requests).toContainEqual({ action: 'create_instance', instance_name: 'clinica-principal_2' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
});
