import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test('retorno de confirmação de cadastro sem plano continua no onboarding', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { authenticated: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/auth?cadastro=1');
  await expect(page).toHaveURL(/\/onboarding(?:\?|$)/);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('cadastro mostra preço e teste do plano escolhido sem texto de convite', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, {
    authenticated: false,
    checkoutPlanSlug: 'elolab-ultra',
    includePlanCatalog: true,
  });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/auth?cadastro=1&plano=elolab-ultra&modo=trial');

    await expect(page.getByText(/plano escolhido: elolab ultra/i)).toBeVisible();
    await expect(page.getByText(/3 dias grátis · depois R\$\s*499,00 por mês/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Criar conta', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assinar um Plano' })).toHaveCount(0);
    await expect(page.getByText(/convite da equipe é enviado separadamente/i)).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`auth-plano-escolhido-${viewport.width}.png`), fullPage: true });
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('não permite criar conta com intenção para um plano indisponível', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, {
    authenticated: false,
    includePlanCatalog: true,
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/auth?cadastro=1&plano=elolab-inexistente&modo=trial');

  await expect(page.locator('span[role="alert"]')).toContainText(/este plano não está disponível/i);
  await expect(page.getByRole('link', { name: /ver planos disponíveis/i })).toHaveAttribute('href', '/#planos');
  await expect(page.getByRole('button', { name: 'Criar conta', exact: true })).toBeDisabled();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
