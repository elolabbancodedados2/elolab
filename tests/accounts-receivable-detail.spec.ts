import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('receivable details open as a page, show payments and audit history, and return to the filtered list', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, accountsPopulated: true });
  const accountId = '00000000-0000-4000-9000-000000000041';
  const historyArgs: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/historico_alteracoes_lancamento', async route => {
    historyArgs.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 200, json: [
      { alterado_em: '2026-10-20T13:00:00Z', alterado_por_nome: 'Bruno QA', campo: 'valor', valor_anterior: '800', valor_novo: '850' },
    ] });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/contas?tab=receber&status=aberto&mes=2026-10');
  const main = page.locator('#main-content');
  await main.getByRole('textbox', { name: 'Buscar contas a receber' }).fill('Procedimento ambulatorial');
  const row = main.getByRole('row').filter({ hasText: 'Procedimento ambulatorial de complexidade intermediária' });
  const accountReadPromise = page.waitForRequest(request => {
    const url = new URL(request.url());
    return request.method() === 'GET' && url.pathname === '/rest/v1/lancamentos'
      && url.searchParams.get('id') === `eq.${accountId}`;
  });
  await row.getByRole('button', { name: 'Mais ações da conta de Pessoa Exemplo QA' }).click();
  await page.getByRole('menuitem', { name: 'Ver Detalhes' }).click();

  await expect(page).toHaveURL(`/contas/receber/${accountId}/detalhes`);
  const detail = page.getByTestId('receivable-detail-page');
  await expect(detail.getByRole('heading', { name: 'Detalhes da conta a receber' })).toBeVisible();
  await expect(detail.getByText('Pessoa Exemplo QA')).toBeVisible();
  await expect(detail.getByText('Saldo em aberto', { exact: true }).locator('..')).toContainText('R$ 550,00');
  await expect(detail.getByRole('heading', { name: 'Movimentações de recebimento' })).toBeVisible();
  await expect(detail.getByText('Pagamento recebido')).toBeVisible();
  await expect(detail.getByText('Histórico da conta')).toBeVisible();
  await expect(detail.getByText('Bruno QA')).toBeVisible();
  await expect(detail.getByText('R$ 800,00')).toBeVisible();
  await expect(detail.getByText('R$ 850,00').last()).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Receber' })).toBeEnabled();
  await expect(detail.getByRole('button', { name: 'Estornar pagamento' })).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).not.toContainText(accountId);
  const accountRead = await accountReadPromise;
  expect(new URL(accountRead.url()).searchParams.get('clinica_id')).toBe(`eq.${synthetic.clinicId}`);
  expect(historyArgs).toEqual([{ p_lancamento_id: accountId }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('receivable-detail-mobile.png'), fullPage: true, animations: 'disabled' });
  const lastHistoryValue = detail.getByText('R$ 850,00').last();
  await lastHistoryValue.scrollIntoViewIfNeeded();
  const historyBounds = await lastHistoryValue.boundingBox();
  const mobileNavBounds = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
  expect(historyBounds).not.toBeNull();
  expect(mobileNavBounds).not.toBeNull();
  expect(historyBounds!.y + historyBounds!.height).toBeLessThan(mobileNavBounds!.y);
  await page.screenshot({ path: testInfo.outputPath('receivable-detail-mobile-bottom.png'), animations: 'disabled' });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#main-content').evaluate(element => element.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('receivable-detail-desktop.png'), fullPage: true, animations: 'disabled' });

  await detail.getByRole('button', { name: 'Voltar às contas' }).click();
  await expect(page).toHaveURL('/contas?tab=receber&status=aberto&mes=2026-10');
  await expect(page.locator('#main-content').getByRole('textbox', { name: 'Buscar contas a receber' })).toHaveValue('Procedimento ambulatorial');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('receivable details explain missing audit history and allow retry without a modal', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, accountsPopulated: true });
  let historyCalls = 0;
  await page.route('**/rest/v1/rpc/historico_alteracoes_lancamento', async route => {
    historyCalls += 1;
    if (historyCalls === 1) {
      await route.fulfill({ status: 503, json: { message: 'Falha sintética de leitura' } });
      return;
    }
    await route.fulfill({ status: 200, json: [] });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/contas/receber/00000000-0000-4000-9000-000000000041/detalhes');
  const detail = page.getByTestId('receivable-detail-page');
  await expect(detail.getByText('Não foi possível carregar o histórico de alterações desta conta.')).toBeVisible();
  await detail.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(detail.getByText('Nenhuma alteração desses campos foi registrada.')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(historyCalls).toBe(2);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
