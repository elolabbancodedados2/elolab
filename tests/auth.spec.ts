import { test, expect } from '@playwright/test';
import { mockPlanosPublicos } from './mockPlanosPublicos';

test.describe('Authentication flows', () => {
  test('acesso a /dashboard sem login redireciona para /auth', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/(auth|login|\?)/);
    expect(page.url()).not.toContain('/dashboard');
  });

  test('página de auth carrega sem erros de console ou página', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /acesse sua conta/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /e-mail/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /senha/i })).toBeVisible();
    await expect(page.locator('form').getByRole('button', { name: 'Entrar' })).toBeVisible();
    await expect(page.getByRole('link', { name: /esqueci minha senha/i })).toBeVisible();

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('login com credenciais inválidas exibe erro e mantém os controles disponíveis', async ({ page }) => {
    let authRequestCount = 0;
    await page.route('**/auth/v1/token?grant_type=password', async (route) => {
      authRequestCount += 1;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'invalid_credentials', message: 'Invalid login credentials' }),
      });
    });

    await page.goto('/auth');
    const email = page.getByRole('textbox', { name: /e-mail/i });
    const password = page.getByRole('textbox', { name: /senha/i });
    const submit = page.locator('form').getByRole('button', { name: 'Entrar' });
    const resetLink = page.getByRole('link', { name: /esqueci minha senha/i });

    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await expect(submit).toBeEnabled();
    await expect(resetLink).toBeVisible();
    await email.fill('wrong@test.com');
    await password.fill('wrongpassword123');
    await submit.click();

    await expect(page.getByRole('alert')).toContainText(/e-mail ou senha incorretos/i);
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await expect(submit).toBeEnabled();
    await expect(resetLink).toBeVisible();
    expect(authRequestCount).toBe(1);
    expect(page.url()).toContain('/auth');
  });

  test('landing page carrega sem erros de console ou página', async ({ page }) => {
    await mockPlanosPublicos(page);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toBeEmpty();
    await expect.poll(() => [...consoleErrors, ...pageErrors]).toEqual([]);
  });
});
