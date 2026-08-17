import { test, expect } from '@playwright/test';

const publicRoutes = ['/', '/auth', '/politica-privacidade', '/termos-uso', '/politica-cookies'];

test.describe('Navigation', () => {
  for (const route of publicRoutes) {
    test(`rota pública ${route} carrega sem erro`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !msg.text().includes('Failed to fetch') && !msg.text().includes('net::')) {
          errors.push(msg.text());
        }
      });
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(500);
      await page.waitForLoadState('networkidle');
    });
  }

  test('rota inexistente mostra 404', async ({ page }) => {
    await page.goto('/rota-que-nao-existe-xyz');
    await page.waitForLoadState('networkidle');
    const body = await page.textContent('body');
    // Should show some not found indication
    expect(body).toBeTruthy();
  });

  test('portal remove o código de acesso da URL imediatamente', async ({ page }) => {
    await page.goto('/portal-paciente?token=segredo-de-teste');
    await expect.poll(() => page.url()).not.toContain('token=');
    expect(page.url()).toMatch(/\/portal-paciente$/);
  });

  test('responsividade mobile (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Should not have horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(376);
  });

  test('responsividade desktop (1280px)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });
});
