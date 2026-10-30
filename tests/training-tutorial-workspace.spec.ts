import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('continua e conclui tutorial numa página própria com etapa recuperável pela URL', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  const writes: Array<Record<string, unknown>> = [];

  await page.route('http://127.0.0.1:54321/rest/v1/user_training_progress*', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    writes.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/treinamento/rotina-diaria?etapa=1');
  await expect(page.getByRole('heading', { name: 'Comece o dia com segurança' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Confira as notificações' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/treinamento-etapa-desktop.png', fullPage: true });

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Confira as notificações' })).toBeVisible();
  await expect(page).toHaveURL(/\/treinamento\/rotina-diaria\?etapa=1$/);
  await page.getByRole('button', { name: 'Anterior' }).click();
  await expect(page.getByRole('heading', { name: 'Leia seu painel' })).toBeVisible();
  await expect(page).toHaveURL(/\/treinamento\/rotina-diaria$/);
  await page.getByRole('button', { name: 'Próxima etapa' }).click();
  await page.getByRole('button', { name: 'Próxima etapa' }).click();
  await expect(page.getByRole('heading', { name: 'Organize as tarefas' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const finishAction = page.getByRole('button', { name: 'Concluir tutorial' });
  await page.locator('#main-content').evaluate(element => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }));
  await finishAction.scrollIntoViewIfNeeded();
  await expect(finishAction).toBeInViewport();
  const finishBox = await finishAction.boundingBox();
  const mobileNavBox = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
  expect(finishBox && mobileNavBox && finishBox.y + finishBox.height < mobileNavBox.y).toBe(true);
  await page.screenshot({ path: 'test-results/treinamento-etapa-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Concluir tutorial' }).click();

  await expect(page).toHaveURL(/\/treinamento$/);
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ user_id: synthetic.userId, clinica_id: synthetic.clinicId, tutorial_key: 'rotina-diaria' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
