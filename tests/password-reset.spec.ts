import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test('solicitar link preserva o e-mail, não revela cadastro e permite reenviar', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { authenticated: false });
  await page.setViewportSize({ width: 390, height: 844 });

  const recuperacoes: Array<{ body: Record<string, unknown>; redirectTo: string | null }> = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/auth/v1/recover') && request.method() === 'POST') {
      recuperacoes.push({
        body: request.postDataJSON() as Record<string, unknown>,
        redirectTo: new URL(request.url()).searchParams.get('redirect_to'),
      });
    }
  });

  await page.goto('/redefinir-senha');
  await expect(page.getByRole('heading', { name: 'Redefinir senha' })).toBeVisible();
  for (const viewport of [{ width: 320, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`recovery-request-${viewport.width}.png`), fullPage: true });
  }

  await page.getByLabel('E-mail').fill('QA.User@Example.com');
  await page.getByRole('button', { name: 'Enviar link' }).click();
  await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible();
  await expect(page.getByText('Se este e-mail estiver cadastrado, o link chegará em até 5 minutos.')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('caixa de entrada e a pasta de spam');
  expect(recuperacoes[0]?.body.email).toBe('qa.user@example.com');
  expect(recuperacoes[0]?.redirectTo).toContain('/redefinir-senha');
  await expect(page.getByText('QA.User@Example.com')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('recovery-sent-390.png'), fullPage: true });

  await page.getByRole('button', { name: 'Não recebeu? Enviar de novo' }).click();
  await page.getByLabel('E-mail').fill('QA.User@Example.com');
  await page.getByRole('button', { name: 'Enviar link' }).click();
  await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible();
  expect(recuperacoes).toHaveLength(2);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('troca de senha valida os campos, recupera erro do link e encerra a sessão', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { authenticated: true });
  await page.setViewportSize({ width: 1280, height: 800 });

  let atualizacoes = 0;
  page.on('request', (request) => {
    if (request.url().includes('/auth/v1/user') && request.method() === 'PUT') atualizacoes += 1;
  });
  await page.route('**/auth/v1/user', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    atualizacoes += 0;
    if (atualizacoes === 1) {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'otp_expired', message: 'Recovery link expired' }) });
      return;
    }
    await route.fallback();
  });

  await page.goto('/redefinir-senha');
  await expect(page.getByRole('heading', { name: 'Criar nova senha' })).toBeVisible();
  for (const viewport of [{ width: 320, height: 720 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (viewport.width !== 1280) {
      await page.screenshot({ path: testInfo.outputPath(`recovery-new-password-${viewport.width}.png`), fullPage: true });
    }
  }
  await page.screenshot({ path: testInfo.outputPath('recovery-new-password-1280.png'), fullPage: true });

  const novaSenha = page.getByRole('textbox', { name: 'Nova senha', exact: true });
  const confirmacao = page.getByRole('textbox', { name: 'Repetir a nova senha', exact: true });
  await novaSenha.fill('SenhaSegura123');
  await confirmacao.fill('SenhaSegura124');
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page.getByRole('alert')).toContainText('As senhas estão diferentes');
  expect(atualizacoes).toBe(0);

  await confirmacao.fill('SenhaSegura123');
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page.getByRole('alert')).toContainText('O link pode ter expirado');
  expect(atualizacoes).toBe(1);

  await page.getByRole('button', { name: 'Solicitar novo link' }).click();
  await expect(page.getByRole('heading', { name: 'Redefinir senha' })).toBeVisible();
  await page.getByLabel('E-mail').fill('qa-admin@elolab.test');
  await page.getByRole('button', { name: 'Enviar link' }).click();
  await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible();
  expect(synthetic.requests.some((request) => request.includes('/auth/v1/recover'))).toBe(true);

  await page.goto('/redefinir-senha');
  await expect(page.getByRole('heading', { name: 'Criar nova senha' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Nova senha', exact: true }).fill('SenhaSegura123');
  await page.getByRole('textbox', { name: 'Repetir a nova senha', exact: true }).fill('SenhaSegura123');
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page).toHaveURL(/\/auth(?:\?|$)/);
  expect(atualizacoes).toBe(2);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
