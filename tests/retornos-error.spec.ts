import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('Retornos troca espera longa por recuperação e conclui após a resposta voltar', async ({ page }) => {
  test.setTimeout(20_000);
  await page.clock.install({ time: new Date('2026-10-29T09:00:00-03:00') });
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'admin' });
  let podeRecuperar = false;
  let leituras = 0;

  await page.route('http://127.0.0.1:54321/rest/v1/retornos**', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    leituras += 1;
    if (!podeRecuperar) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, accept, prefer, range',
          'access-control-allow-methods': 'GET, HEAD, OPTIONS, POST, PATCH, DELETE',
          'access-control-expose-headers': 'content-range, content-location, range',
          'content-range': '*/0',
        },
        body: JSON.stringify({ code: 'SYNTHETIC_FAILURE', message: 'Falha sintética de leitura' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'content-range': '*/0' },
      body: '[]',
    });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/retornos');
  const main = page.locator('#main-content');
  await expect(main.locator('.animate-pulse').first()).toBeVisible();
  expect(leituras).toBeGreaterThan(0);

  await page.clock.fastForward(15_000);
  const error = main.getByRole('alert');
  await expect(error).toBeVisible();
  await expect(error).toContainText('A consulta está demorando');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/retornos-timeout.png', fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  const errorBounds = await error.boundingBox();
  expect(errorBounds).not.toBeNull();
  expect(errorBounds!.x).toBeGreaterThanOrEqual(0);
  expect(errorBounds!.x + errorBounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/retornos-timeout-mobile.png', fullPage: false });

  podeRecuperar = true;
  await error.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(main.getByText('Ainda não há retornos cadastrados')).toBeVisible();
  expect(leituras).toBeGreaterThan(1);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
