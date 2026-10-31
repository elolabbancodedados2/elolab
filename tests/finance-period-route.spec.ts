import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

function currentClinicMonth() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
}

function previousMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const previous = new Date(Date.UTC(year, monthNumber - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
}

function clinicMonthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, monthNumber - 1, 15, 12)));
}

function accountMonthLabel(month: string) {
  return clinicMonthLabel(month);
}

async function authenticateFinance(
  page: Parameters<typeof installSyntheticClinic>[0],
  appOrigin: string,
  accountsPopulated = false,
) {
  // Com contas populadas, fixa o dia 15: vencimentos de "amanhã" não podem cair no mês seguinte.
  const today = accountsPopulated ? `${currentClinicMonth()}-15` : undefined;
  if (today) await page.clock.install({ time: new Date(`${today}T10:00:00-03:00`) });
  return installSyntheticClinic(page, {
    role: 'financeiro',
    platformAdmin: false,
    accountsPopulated,
    appOrigin,
    today,
  });
}

test('visão financeira mantém mês e aba na URL e restaura estados pelo histórico', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  await authenticateFinance(page, appOrigin);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/financeiro?mes=2025-03&tab=dre');

  const dreTab = page.getByRole('tab', { name: /DRE/ });
  await expect(dreTab).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/mes=2025-03.*tab=dre/);
  await page.getByRole('heading', { name: 'Painel Financeiro' }).waitFor();
  await page.screenshot({ path: testInfo.outputPath('financeiro-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('financeiro-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.getByRole('button', { name: 'Mês anterior' }).click();
  await expect(page).toHaveURL(/mes=2025-02.*tab=dre/);
  await expect(dreTab).toHaveAttribute('aria-selected', 'true');

  await page.goBack();
  await expect(page).toHaveURL(/mes=2025-03.*tab=dre/);
  await expect(dreTab).toHaveAttribute('aria-selected', 'true');
  await page.goForward();
  await expect(page).toHaveURL(/mes=2025-02.*tab=dre/);
  await expect(page.getByText(/fevereiro de 2025/i)).toBeVisible();

  await page.getByRole('tab', { name: /Categorias/ }).click();
  await expect(page).toHaveURL(/mes=2025-02.*tab=categorias/);
  await expect(page.getByRole('tab', { name: /Categorias/ })).toHaveAttribute('aria-selected', 'true');
});

test('financeiro e fluxo normalizam query params inválidos e preservam o mês ao trocar de tela', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  await authenticateFinance(page, appOrigin);
  await page.setViewportSize({ width: 1280, height: 800 });
  const currentMonth = currentClinicMonth();

  await page.goto('/financeiro?mes=2025-13&tab=desconhecida&origem=qa');
  await expect(page).toHaveURL(new RegExp(`/financeiro\\?mes=${currentMonth}&tab=resumo&origem=qa`));

  await page.getByRole('button', { name: 'Mês anterior' }).click();
  await expect(page).toHaveURL(new RegExp(`/financeiro\\?mes=\\d{4}-\\d{2}&tab=resumo&origem=qa`));
  const selectedMonth = new URL(page.url()).searchParams.get('mes');

  await page.getByRole('link', { name: /^Fluxo de Caixa/ }).click();
  await expect(page).toHaveURL(new RegExp(`/fluxo-caixa\\?mes=${selectedMonth}`));
  await page.getByRole('heading', { name: 'Fluxo de Caixa', exact: true }).waitFor();
  const monthlyStatement = page.getByRole('region', { name: 'Resumo do fluxo de caixa do mês' });
  await expect(monthlyStatement).toBeVisible();
  expect(await monthlyStatement.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(4);
  await page.locator('#main-content').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath('fluxo-caixa-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await monthlyStatement.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
  await expect(monthlyStatement.getByText('Entradas no mês')).toBeVisible();
  await expect(monthlyStatement.getByText('Saldo do mês')).toBeVisible();
  await page.locator('#main-content').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath('fluxo-caixa-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  const flowHeading = page.locator('#main-content').getByRole('heading', { name: 'Fluxo de Caixa' });
  await expect(flowHeading).toBeVisible();
  const flowMonthDescription = page.locator('#main-content header p').first();
  await expect(flowMonthDescription).toContainText(clinicMonthLabel(selectedMonth!));

  const previousFlowMonth = previousMonth(selectedMonth!);
  await page.getByRole('button', { name: 'Mês anterior' }).click();
  await expect(page).toHaveURL(new RegExp(`/fluxo-caixa\\?mes=${previousFlowMonth}`));
  await expect(flowMonthDescription).toContainText(clinicMonthLabel(previousFlowMonth));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/fluxo-caixa\\?mes=${selectedMonth}`));
  await expect(flowMonthDescription).toContainText(clinicMonthLabel(selectedMonth!));
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/fluxo-caixa\\?mes=${previousFlowMonth}`));
  await expect(flowMonthDescription).toContainText(clinicMonthLabel(previousFlowMonth));

  await page.locator('#main-content').getByRole('link', { name: 'Visão financeira' }).click();
  await expect(page).toHaveURL(new RegExp(`/financeiro\\?mes=${previousFlowMonth}&tab=resumo`));

  await page.goto('/fluxo-caixa?mes=2025-00');
  await expect(page).toHaveURL(new RegExp(`/fluxo-caixa\\?mes=${currentMonth}`));
});

test('perfil sem permissão não abre os workspaces financeiros', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  await installSyntheticClinic(page, { role: 'medico', platformAdmin: false, appOrigin });

  await page.goto('/financeiro?mes=2025-03&tab=dre');
  await expect(page.getByRole('heading', { name: 'Acesso Negado' })).toBeVisible();

  await page.goto('/fluxo-caixa?mes=2025-03');
  await expect(page.getByRole('heading', { name: 'Acesso Negado' })).toBeVisible();
});

test('fluxo de caixa mostra movimentações sintéticas quando existem dados', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  await authenticateFinance(page, appOrigin, true);
  await page.goto(`/fluxo-caixa?mes=${currentClinicMonth()}`);

  await expect(page.getByRole('heading', { name: 'Fluxo de Caixa', exact: true })).toBeVisible();
  await expect(page.getByText('Nenhuma movimentação registrada neste mês')).toHaveCount(0);
  await expect(page.getByText('R$ 720,00').first()).toBeVisible();
});

test('categorias financeiras comparam valores recebidos e pagos sem depender de cores distintas', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await authenticateFinance(page, appOrigin, true);

  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`/financeiro?mes=${currentClinicMonth()}&tab=categorias`);
    const main = page.locator('#main-content');
    const revenue = main.locator('section[aria-labelledby="revenue-categories-title"]');
    const expenses = main.locator('section[aria-labelledby="expense-categories-title"]');

    await expect(main.getByRole('heading', { name: 'Receitas por categoria' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Despesas por categoria' })).toBeVisible();
    await expect(revenue).toContainText('Valores recebidos no período selecionado');
    await expect(revenue.getByText('Consultas', { exact: true })).toBeVisible();
    await expect(revenue.getByText('Procedimentos', { exact: true })).toBeVisible();
    await expect(expenses).toContainText('Valores pagos no período selecionado');
    await expect(expenses.getByText('Fornecedores', { exact: true })).toBeVisible();
    await expect(expenses.getByText('Equipamentos', { exact: true })).toBeVisible();
    await expect(revenue.locator('li')).toHaveCount(2);
    await expect(expenses.locator('li')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await revenue.scrollIntoViewIfNeeded();
    await expect(revenue).toBeInViewport({ ratio: 0.1 });
    if (viewport.width >= 1024) {
      const chatButton = page.getByRole('button', { name: /Abrir chat interno/ });
      await expect(chatButton).toBeVisible();
      const amount = revenue.locator('li').last().locator('div').first().locator('span').last();
      const amountBounds = await amount.boundingBox();
      const chatBounds = await chatButton.boundingBox();
      expect(amountBounds).not.toBeNull();
      expect(chatBounds).not.toBeNull();
      expect(amountBounds!.x + amountBounds!.width).toBeLessThanOrEqual(chatBounds!.x);
    }
    await page.screenshot({ path: testInfo.outputPath(`finance-categories-revenue-${viewport.width}.png`), animations: 'disabled' });
    await expenses.scrollIntoViewIfNeeded();
    await expect(expenses).toBeInViewport({ ratio: 0.1 });
    await page.screenshot({ path: testInfo.outputPath(`finance-categories-expenses-${viewport.width}.png`), animations: 'disabled' });
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('categorias financeiras explicam o estado vazio sem exibir gráficos ou barras sem dados', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await authenticateFinance(page, appOrigin);

  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`/financeiro?mes=${currentClinicMonth()}&tab=categorias`);
    const main = page.locator('#main-content');
    const revenue = main.locator('section[aria-labelledby="revenue-categories-title"]');
    const expenses = main.locator('section[aria-labelledby="expense-categories-title"]');

    await expect(revenue.getByRole('status')).toHaveText('Nenhuma receita recebida neste período.');
    await expect(expenses.getByRole('status')).toHaveText('Nenhuma despesa paga neste período.');
    await expect(revenue.locator('li')).toHaveCount(0);
    await expect(expenses.locator('li')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expenses.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`finance-categories-empty-${viewport.width}.png`), animations: 'disabled' });
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('fluxo de caixa vazio compartilha o estado dos gráficos sem reservar áreas em branco', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await authenticateFinance(page, appOrigin);

  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/fluxo-caixa?mes=2025-03');
    const main = page.locator('#main-content');
    await expect(main.getByRole('heading', { name: 'Fluxo de Caixa', exact: true })).toBeVisible();

    const statement = main.getByRole('region', { name: 'Resumo do fluxo de caixa do mês' });
    expect(await statement.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length))
      .toBe(viewport.width < 1024 ? 2 : 4);
    await expect(statement.getByText('Entradas no mês')).toBeVisible();
    await expect(statement.getByText('Saídas no mês')).toBeVisible();
    await expect(statement.getByText('Saldo do mês')).toBeVisible();
    await expect(statement.getByText('Margem operacional')).toBeVisible();

    const emptyState = main.getByRole('status', { name: 'Sem movimentações para exibir' });
    await expect(emptyState).toContainText('Nenhuma movimentação registrada neste mês');
    await expect(emptyState).toContainText('A evolução diária, o saldo acumulado e as categorias aparecerão quando houver entradas, saídas, suprimentos ou sangrias.');
    await expect(main.getByRole('heading', { name: 'Evolução Diária' })).toHaveCount(0);
    await expect(main.getByRole('heading', { name: 'Saldo Acumulado' })).toHaveCount(0);
    await expect(main.getByRole('heading', { name: 'Por Categoria' })).toHaveCount(0);
    await expect(main.getByRole('heading', { name: 'Projeção por cenário' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const projectionTable = main.getByRole('region', { name: /Tabela de projeção mensal do fluxo de caixa/ });
    await expect(projectionTable).toHaveAttribute('tabindex', '0');
    await projectionTable.focus();
    await expect(projectionTable).toBeFocused();
    await expect(projectionTable.getByRole('row')).toHaveCount(4);
    await page.screenshot({ path: testInfo.outputPath(`fluxo-caixa-projecao-${viewport.width}.png`), animations: 'disabled' });

    await emptyState.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`fluxo-caixa-vazio-${viewport.width}.png`), animations: 'disabled' });
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('fluxo de caixa mostra erro recuperável e volta a carregar', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  await installSyntheticClinic(page, {
    role: 'financeiro',
    platformAdmin: false,
    appOrigin,
  });
  let forceFailure = true;
  await page.route('http://127.0.0.1:54321/rest/v1/lancamentos**', async route => {
    if (forceFailure) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'synthetic test failure' }),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto('/fluxo-caixa?mes=2025-03');
  await expect(page.locator('.animate-pulse').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Não foi possível carregar o fluxo de caixa' })).toBeVisible({ timeout: 20_000 });

  forceFailure = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('heading', { name: 'Fluxo de Caixa', exact: true })).toBeVisible();
});

test('painel financeiro mantém resumo operacional com dados sintéticos em desktop e mobile', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  await authenticateFinance(page, appOrigin, true);
  const month = currentClinicMonth();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/financeiro?mes=${month}&tab=resumo`);
  const main = page.locator('#main-content');
  await expect(main.getByRole('heading', { name: 'Painel Financeiro' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Resumo financeiro' })).toBeVisible();
  await expect(main.getByText('Entradas recebidas', { exact: true })).toBeVisible();
  await expect(main.getByText('Despesas pagas', { exact: true })).toBeVisible();
  await expect(main.getByText('Resultado líquido', { exact: true })).toBeVisible();
  const receivableSummaryLink = main.getByRole('link', { name: /A receber neste mês/ });
  const payableSummaryLink = main.getByRole('link', { name: /A pagar neste mês/ });
  await expect(receivableSummaryLink).toHaveAttribute('href', `/contas?tab=receber&status=aberto&mes=${month}`);
  await expect(payableSummaryLink).toHaveAttribute('href', `/contas?tab=pagar&status=aberto&mes=${month}`);
  await expect(main.getByRole('heading', { name: 'Operações financeiras' })).toBeVisible();
  await expect(main.getByRole('link', { name: /Fluxo de Caixa/ })).toHaveAttribute('href', `/fluxo-caixa?mes=${month}`);
  await expect(main.getByText('R$ 720,00', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('financeiro-resumo-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('financeiro-resumo-mobile.png'), fullPage: true, animations: 'disabled' });
  const pending = main.locator('aside[aria-labelledby="finance-pending-title"]');
  const operations = main.locator('section[aria-labelledby="finance-operations-title"]');
  await expect(pending).toBeVisible();
  await expect(operations).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const payableLink = pending.getByRole('link', { name: /A pagar neste mês/ });
  await payableLink.scrollIntoViewIfNeeded();
  const [payableBounds, mobileNavBounds] = await Promise.all([
    payableLink.boundingBox(),
    page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox(),
  ]);
  expect(payableBounds).not.toBeNull();
  expect(mobileNavBounds).not.toBeNull();
  expect(payableBounds!.y + payableBounds!.height).toBeLessThanOrEqual(mobileNavBounds!.y);
  await page.screenshot({ path: testInfo.outputPath('financeiro-pendencias-mobile.png'), animations: 'disabled' });
  const lastOperationLink = operations.getByRole('link', { name: /Tipos de Consulta/ });
  await lastOperationLink.scrollIntoViewIfNeeded();
  const [lastOperationBounds, mobileNavAfterScroll] = await Promise.all([
    lastOperationLink.boundingBox(),
    page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox(),
  ]);
  expect(lastOperationBounds).not.toBeNull();
  expect(mobileNavAfterScroll).not.toBeNull();
  expect(lastOperationBounds!.y + lastOperationBounds!.height).toBeLessThanOrEqual(mobileNavAfterScroll!.y);
  await page.screenshot({ path: testInfo.outputPath('financeiro-operacoes-mobile.png'), animations: 'disabled' });

  await page.setViewportSize({ width: 1280, height: 800 });
  await receivableSummaryLink.click();
  await expect(page).toHaveURL(new RegExp(`/contas\\?tab=receber&status=aberto&mes=${month}`));
  await expect(page.getByText(`Vencimentos de ${accountMonthLabel(month)}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Em aberto', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Procedimento ambulatorial de complexidade intermediária/).first()).toBeVisible();
  await expect(page.getByText('Consulta de retorno já recebida')).toHaveCount(0);
  await expect(page.getByText('2 de 3', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('contas-receber-month-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('contas-receber-month-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.getByRole('tab', { name: /A Pagar/ }).click();
  await expect(page).toHaveURL(new RegExp(`/contas\\?tab=pagar&status=aberto&mes=${month}`));
  await expect(page.getByText(`Vencimentos de ${accountMonthLabel(month)}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Em aberto', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Manutenção preventiva dos equipamentos de diagnóstico/).first()).toBeVisible();
  await expect(page.getByText('Material de escritório quitado')).toHaveCount(0);
  await expect(page.getByText('2 de 3', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('contas-pagar-month-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('contas-pagar-month-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Mostrar todos os meses' }).click();
  await expect(page).toHaveURL(new RegExp(`/contas\\?tab=pagar&status=aberto$`));
  await expect(page.getByText('Licença mensal do prontuário externo')).toBeVisible();
  await page.getByRole('button', { name: 'Limpar', exact: true }).click();
  await expect(page).toHaveURL(/\/contas\?tab=pagar$/);
  await expect(page.getByText('Material de escritório quitado')).toBeVisible();
  const openStatusFilter = page.getByRole('button', { name: 'Em aberto', exact: true });
  await openStatusFilter.focus();
  await page.keyboard.press('Space');
  await expect(page).toHaveURL(/\/contas\?tab=pagar&status=aberto$/);
});
