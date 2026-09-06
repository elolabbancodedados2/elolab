import { test, expect } from '@playwright/test';
test.describe('Validação de entrada e proteção de pacientes', () => {
  test('formulário vazio exibe erros de email e senha', async ({ page }) => {
    await page.goto('/auth');
    const submit = page.locator('form button[type="submit"]').first();
    await expect(submit).toBeVisible();
    await submit.click();
    await expect(page.getByText('Email inválido', { exact: true })).toBeVisible();
    await expect(page.getByText('Senha é obrigatória', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/auth/);
  });
  test('pacientes exige login sem uma sessão', async ({ page }) => {
    await page.goto('/pacientes');
    await expect(page).toHaveURL(/\/auth/);
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
  });
});
