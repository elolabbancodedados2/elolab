import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('tour inicial abre em página própria, pode ser interrompido e registra conclusão', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL) });
  const onboardingWrites: Array<Record<string, unknown>> = [];
  await page.route('**/rest/v1/configuracoes_clinica*', async route => {
    if (route.request().method() === 'POST') {
      onboardingWrites.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    return route.fallback();
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('link', { name: 'Conhecer o EloLab' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('onboarding_done_')))).toBe(false);
  await page.getByRole('link', { name: 'Conhecer o EloLab' }).click();

  await expect(page).toHaveURL('/tour-inicial');
  await expect(page.getByRole('heading', { name: 'Bem-vindo ao EloLab' })).toBeVisible();
  await expect(page.getByText('Etapa 1 de 6')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('initial-tour-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.locator('#main-content').evaluate(element => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }));
  const [nextButtonBox, mobileNavigationBox] = await Promise.all([
    page.getByRole('button', { name: 'Próxima etapa' }).boundingBox(),
    page.locator('nav').last().boundingBox(),
  ]);
  expect(nextButtonBox && mobileNavigationBox && nextButtonBox.y + nextButtonBox.height <= mobileNavigationBox.y).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('initial-tour-mobile-actions.png'), animations: 'disabled' });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#main-content').evaluate(element => element.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: testInfo.outputPath('initial-tour-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Próxima etapa' }).click();
  await expect(page.getByRole('heading', { name: 'Agenda e atendimento' })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bem-vindo ao EloLab' })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar ao dashboard' }).click();
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goto('/tour-inicial', { waitUntil: 'domcontentloaded' });
  for (let index = 0; index < 5; index += 1) {
    await page.getByRole('button', { name: 'Próxima etapa' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Pronto para explorar' })).toBeVisible();
  await page.getByRole('button', { name: 'Concluir tour' }).click();
  await expect(page).toHaveURL('/dashboard');
  expect(onboardingWrites).toHaveLength(1);
  expect(onboardingWrites[0]).toMatchObject({
    chave: 'onboarding_completed',
    user_id: synthetic.userId,
  });
  expect(await page.evaluate(userId => localStorage.getItem(`onboarding_done_${userId}`), synthetic.userId)).toBe('true');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('tour preserva a etapa e permite repetir quando não consegue salvar a conclusão', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL) });
  let attempts = 0;
  await page.route('**/rest/v1/configuracoes_clinica*', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Falha sintética de gravação' }) });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/tour-inicial', { waitUntil: 'domcontentloaded' });
  for (let index = 0; index < 5; index += 1) {
    await page.getByRole('button', { name: 'Próxima etapa' }).click();
  }
  await page.getByRole('button', { name: 'Concluir tour' }).click();
  await expect(page.getByRole('heading', { name: 'Conclusão não registrada' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pronto para explorar' })).toBeVisible();
  expect(await page.evaluate(userId => localStorage.getItem(`onboarding_done_${userId}`), synthetic.userId)).toBeNull();

  await page.getByRole('button', { name: 'Concluir tour' }).click();
  await expect(page).toHaveURL('/dashboard');
  expect(attempts).toBe(2);
  expect(await page.evaluate(userId => localStorage.getItem(`onboarding_done_${userId}`), synthetic.userId)).toBe('true');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
