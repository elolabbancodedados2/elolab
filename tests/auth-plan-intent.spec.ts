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

test('entrada mantém identidade EloLab e alternância acessível em celular e desktop', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { authenticated: false });

  for (const viewport of [{ width: 320, height: 720 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/auth');

    await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'EloLab — tecnologia que cuida' })).toHaveCount(1);
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const login = page.getByRole('button', { name: 'Entrar', exact: true });
    const signup = page.getByRole('button', { name: 'Criar Conta' });
    await login.focus();
    await page.keyboard.press('Tab');
    await expect(signup).toBeFocused();
    await expect.poll(() => signup.evaluate((button) => getComputedStyle(button).boxShadow)).not.toBe('none');

    await signup.click();
    await expect(signup).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Nome completo' })).toBeVisible();
    await expect.poll(() => page.locator('form').evaluate((form) => Number.parseFloat(getComputedStyle(form.parentElement ?? form).opacity))).toBe(1);
    await page.screenshot({ path: testInfo.outputPath(`auth-cadastro-${viewport.width}.png`), fullPage: true });

    await login.click();
    await expect(login).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Senha', exact: true })).toBeVisible();
    await expect.poll(() => page.locator('form').evaluate((form) => Number.parseFloat(getComputedStyle(form.parentElement ?? form).opacity))).toBe(1);
    await page.screenshot({ path: testInfo.outputPath(`auth-login-${viewport.width}.png`), fullPage: true });
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
