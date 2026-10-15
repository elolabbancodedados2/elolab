import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test('Configurações permite cancelar um teste recorrente antes da cobrança', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { trialSubscription: true, platformAdmin: false });
  let cancelRequests = 0;
  await page.route('**/functions/v1/mercadopago-checkout', async (route) => {
    const request = route.request().postDataJSON() as { action?: string };
    if (request.action !== 'cancel_subscription') {
      await route.fallback();
      return;
    }
    cancelRequests += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/configuracoes');
  await page.getByRole('tab', { name: /Meu Plano/i }).click();

  const cancelButton = page.getByRole('button', { name: /cancelar teste grátis/i });
  await expect(cancelButton).toBeVisible();
  await expect(page.getByRole('button', { name: /cancelar/i })).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('configuracoes-teste-cancelavel-1280.png'), fullPage: true });
  await cancelButton.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Cancelar teste grátis?');
  await expect(dialog).toContainText('o acesso ao plano será encerrado');
  await dialog.getByRole('button', { name: 'Cancelar teste grátis', exact: true }).click();
  await expect.poll(() => cancelRequests).toBe(1);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
