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

test('receivables prioritize collection, show remaining balance and due urgency', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, accountsPopulated: true });
  const descricao = 'Procedimento ambulatorial de complexidade intermediária com descrição longa para revisar truncamento e leitura da lista';

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/contas?tab=receber');
  const main = page.locator('#main-content');
  const hero = main.locator('[class*="order-2"]').filter({ hasText: 'Receita vencida há mais tempo' });
  await expect(hero.getByText('Saldo a receber', { exact: true }).locator('..')).toContainText(/550,00/);
  const chartHeading = main.getByRole('heading', { name: 'Receita por Categoria' });
  expect((await hero.boundingBox())!.y).toBeLessThan((await chartHeading.boundingBox())!.y);
  await page.screenshot({ path: testInfo.outputPath('receivables-mobile-summary.png'), animations: 'disabled' });

  const conta = main.getByRole('row').filter({ hasText: descricao });
  const vencimento = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(dateOffset(-5));
  await expect(conta.getByText(new RegExp(`Vencimento ${vencimento} · Atrasada há 5 dias`))).toBeVisible();

  const overdueSummary = main.getByRole('button', { name: /Vencidas \/ em atraso/ });
  await overdueSummary.focus();
  await page.keyboard.press('Space');
  await expect(overdueSummary).toHaveAttribute('aria-pressed', 'true');
  await expect(conta).toBeVisible();
  await expect(main.getByText('Exame diagnóstico aguardando pagamento', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await conta.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('receivables-mobile-urgency.png'), fullPage: true, animations: 'disabled' });
  await conta.getByRole('button', { name: 'Receber saldo' }).click();
  const receiveDialog = page.getByRole('dialog');
  await expect(receiveDialog.getByRole('heading', { name: 'Confirmar Recebimento' })).toBeVisible();
  await expect(receiveDialog.locator('#contas-receber-valor-parcial')).toHaveValue('550,00');
  await page.keyboard.press('Escape');
  await expect(receiveDialog).toBeHidden();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/contas?tab=receber');
  await expect(main.getByRole('heading', { name: 'Resumo de recebimentos' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('receivables-desktop-workspace.png'), fullPage: true, animations: 'disabled' });

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.filter(write => !write.includes('/rpc/') && !write.includes('/functions/v1/mercadopago-point'))).toEqual([]);
});

test('receivables show useful empty and loading states', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/contas?tab=receber');
  const main = page.locator('#main-content');
  await expect(main.getByText('Nenhuma receita cadastrada', { exact: true })).toBeVisible();
  await expect(main.getByText('Cadastre uma receita para acompanhar recebimentos.')).toBeVisible();
  await expect(main.getByRole('button', { name: 'Cadastrar receita' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await main.getByText('Cadastre uma receita para acompanhar recebimentos.').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('receivables-empty-mobile.png'), fullPage: true, animations: 'disabled' });

  let liberarResposta = () => {};
  const respostaLiberada = new Promise<void>(resolve => { liberarResposta = resolve; });
  await page.route('http://127.0.0.1:54321/rest/v1/lancamentos**', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    await respostaLiberada;
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '*/0' }, body: '[]' });
  });

  await page.goto('/contas?tab=receber');
  await expect(main.locator('.animate-pulse').first()).toBeVisible();
  liberarResposta();
  await expect(main.getByText('Nenhuma receita cadastrada', { exact: true })).toBeVisible();

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('receivables explain a read error and recover on retry', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  let falhar = true;
  let leituras = 0;
  await page.route('http://127.0.0.1:54321/rest/v1/lancamentos**', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    leituras += 1;
    if (!falhar) return route.fallback();
    await route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '*/0' }, body: JSON.stringify({ code: 'SYNTHETIC_FAILURE', message: 'Falha sintética de leitura' }) });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/contas?tab=receber');
  const main = page.locator('#main-content');
  const error = main.getByRole('alert');
  await expect(error).toBeVisible({ timeout: 20_000 });
  await expect(error).toContainText('Não foi possível carregar contas a receber');
  await expect(error.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  expect(leituras).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('receivables-error-mobile.png'), fullPage: true, animations: 'disabled' });
  falhar = false;
  await error.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(main.getByText('Nenhuma receita cadastrada', { exact: true })).toBeVisible();
  expect(leituras).toBeGreaterThan(1);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
