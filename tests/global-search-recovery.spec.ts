import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('busca global explica falha de rede e permite recuperar a pesquisa', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { role: 'admin', platformAdmin: false });
  let falharUmaVez = true;
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/busca_global**', async route => {
    if (falharUmaVez && route.request().method() === 'POST') {
      falharUmaVez = false;
      await route.abort('failed');
      return;
    }
    await route.fallback();
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dashboard');
  await expect(page.getByRole('button', { name: /Abrir busca global/ })).toBeVisible();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.getByPlaceholder('Nome, CPF, telefone, exame, tarefa...').fill('xylophone');

  const error = dialog.getByRole('alert');
  await expect(error).toBeVisible();
  await expect(error).toContainText('Não foi possível buscar.');
  await page.screenshot({ path: 'test-results/global-search-error.png', fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  const dialogBounds = await dialog.boundingBox();
  expect(dialogBounds).not.toBeNull();
  expect(dialogBounds!.x).toBeGreaterThanOrEqual(0);
  expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(390);
  await expect(error.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  await page.screenshot({ path: 'test-results/global-search-error-mobile.png', fullPage: false });

  await error.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(dialog.getByText('Nenhum resultado encontrado nesta clínica.')).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
