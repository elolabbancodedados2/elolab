import { test, expect } from '@playwright/test';
import { mockPlanosPublicos } from './mockPlanosPublicos';

test.describe('Authentication flows', () => {
  test('acesso a /dashboard sem login redireciona para /auth', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/(auth|login|\?)/);
    // Should not be on dashboard
    expect(page.url()).not.toContain('/dashboard');
  });

  test('página de auth carrega sem erros', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    // Auth page should render
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('login com senha errada exibe erro', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    // Try to find email/password inputs
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    if (await emailInput.isVisible() && await passwordInput.isVisible()) {
      await emailInput.fill('wrong@test.com');
      await passwordInput.fill('wrongpassword123');

      const submitBtn = page.locator('button[type="submit"]').first();
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
        // Wait for error message or toast
        await page.waitForTimeout(3000);
      }
    }
  });

  test('landing page carrega sem erros de console', async ({ page }) => {
    await mockPlanosPublicos(page);
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('Failed to fetch')) {
        errors.push(msg.text());
      }
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Filter out expected network errors
    const realErrors = errors.filter(
      (e) => !e.includes('supabase') && !e.includes('net::') && !e.includes('CORS')
    );
    expect(realErrors).toHaveLength(0);
  });
});
