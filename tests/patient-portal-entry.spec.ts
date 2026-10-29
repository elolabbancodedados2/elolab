import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('portal do paciente rejeita código inválido com feedback acessível sem revelar detalhes', async ({ page }, testInfo) => {
  const requests: Array<Record<string, unknown>> = [];
  await page.route('http://127.0.0.1:54321/functions/v1/patient-portal', async route => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(request);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Token inválido ou expirado' }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/portal-paciente');
  const essentialCookies = page.getByRole('button', { name: 'Apenas Essenciais' });
  if (await essentialCookies.isVisible()) await essentialCookies.click();
  const input = page.getByRole('textbox', { name: 'Código de acesso do paciente' });
  const submit = page.getByRole('button', { name: 'Acessar Portal' });
  await expect(input).toBeVisible();
  await expect(submit).toBeDisabled();
  await input.fill('codigo-sintetico-invalido');
  await expect(submit).toBeEnabled();
  await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Token inválido ou expirado');
  await expect(page.getByText(/storage|patient-portal|supabase|Edge Function/i)).toHaveCount(0);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ action: 'get_profile', token: 'codigo-sintetico-invalido' });
  await expect(page).toHaveURL(/\/portal-paciente$/);
  await page.screenshot({ path: testInfo.outputPath('patient-portal-entry-mobile.png'), animations: 'disabled' });
  await input.fill('novo-codigo-sintetico');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(input).toHaveAttribute('aria-invalid', 'false');

  await page.setViewportSize({ width: 1280, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('patient-portal-entry-desktop.png'), fullPage: true, animations: 'disabled' });
});
