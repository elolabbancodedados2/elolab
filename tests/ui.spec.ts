import { test, expect } from '@playwright/test';
import { mockPlanosPublicos } from './mockPlanosPublicos';

test.describe('UI integrity', () => {
  test('landing page não apresenta erros de console', async ({ page }) => {
    await mockPlanosPublicos(page);
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore expected network/CORS errors
        if (!text.includes('net::') && !text.includes('CORS') && !text.includes('Failed to fetch') && !text.includes('supabase')) {
          errors.push(text);
        }
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });

  test('auth page renderiza formulário', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    // Aguarda a hidratação da tela em vez de consultar cedo demais.
    await expect(page.locator('input').first()).toBeVisible();
  });

  test('landing page tem conteúdo visível', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check that the page has meaningful content
    const body = await page.textContent('body');
    expect(body!.length).toBeGreaterThan(100);
  });

  test('landing page tem título', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title).toBeTruthy();
  });
});
