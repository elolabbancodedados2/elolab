import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

const dateOffset = (days: number) => {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const date = new Date(`${today}T12:00:00-03:00`);
  date.setDate(date.getDate() + days);
  return date;
};

test.use({ serviceWorkers: 'block' });

test('payables show due urgency in mobile rows and keep the active summary filter clear', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, accountsPopulated: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/contas?tab=pagar');

  const main = page.locator('#main-content');
  await expect(main.getByText('Saldo em aberto', { exact: true }).locator('..')).toContainText(/1\.600,00/);
  const overdueRow = main.getByRole('row').filter({ hasText: 'Manutenção preventiva dos equipamentos de diagnóstico e climatização da unidade principal' });
  const dueDate = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(dateOffset(-4));
  await expect(overdueRow.getByText(new RegExp(`Vencimento ${dueDate} · Atrasada há 4 dias`))).toBeVisible();

  const overdueSummary = main.getByRole('button', { name: /Vencidas \/ em atraso/ });
  await overdueSummary.focus();
  await page.keyboard.press('Space');
  await expect(overdueSummary).toHaveAttribute('aria-pressed', 'true');
  await expect(overdueSummary).toHaveClass(/bg-primary\/5/);
  await expect(overdueRow).toBeVisible();
  await expect(main.getByRole('row').filter({ hasText: 'Licença mensal do prontuário externo' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await overdueRow.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('payables-mobile-urgency.png'), fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/contas?tab=pagar');
  await expect(main.getByRole('heading', { level: 2, name: 'Resumo de vencimentos' })).toBeVisible();
  await expect(main.getByRole('button', { name: /Vencidas \/ em atraso/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(main.getByRole('button', { name: /Vencidas \/ em atraso/ }).locator('span').nth(1)).toHaveClass(/text-destructive/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('payables-desktop-summary.png'), fullPage: true, animations: 'disabled' });

  const payableRow = main.getByRole('row').filter({ hasText: 'Manutenção preventiva dos equipamentos de diagnóstico e climatização da unidade principal' });
  await payableRow.getByRole('button', { name: 'Pagar saldo' }).click();
  const paymentDialog = page.getByRole('dialog');
  await expect(paymentDialog).toContainText('Saldo a pagar');
  await expect(paymentDialog).toContainText(/1\.600,00/);
  await page.keyboard.press('Escape');
  await expect(paymentDialog).toBeHidden();

  expect(synthetic.writes.filter(write => !write.includes('/rpc/') && !write.includes('/functions/v1/mercadopago-point'))).toEqual([]);
});

test('payables empty state explains how to add the first account', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/contas?tab=pagar');

  const main = page.locator('#main-content');
  await expect(main.getByText('Nenhuma conta cadastrada', { exact: true })).toBeVisible();
  await expect(main.getByText('Cadastre uma despesa para acompanhar seus vencimentos.')).toBeVisible();
  await expect(main.getByRole('button', { name: 'Nova Conta' }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('payables keep a loading state visible until the accounts arrive', async ({ page }) => {
  test.setTimeout(60_000);
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  let leituras = 0;
  let liberarResposta = () => {};
  const respostaLiberada = new Promise<void>(resolve => { liberarResposta = resolve; });
  await page.route('http://127.0.0.1:54321/rest/v1/lancamentos**', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    leituras += 1;
    await respostaLiberada;
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range, content-location, range', 'content-range': '*/0' }, body: '[]' });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/contas?tab=pagar');
  const main = page.locator('#main-content');
  await expect(main.locator('.animate-pulse').first()).toBeVisible();
  expect(leituras).toBeGreaterThan(0);
  liberarResposta();
  await expect(main.getByText('Nenhuma conta cadastrada', { exact: true })).toBeVisible();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
