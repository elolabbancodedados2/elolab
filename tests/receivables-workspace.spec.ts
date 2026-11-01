import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

// Dia 15 do mês da clínica: a conta vencida há 5 dias não pode cair no mês anterior,
// que a tela esconde no filtro padrão "Mês atual".
const TODAY = `${new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
}).format(new Date())}-15`;

const dateOffset = (days: number) => {
  const date = new Date(`${TODAY}T12:00:00-03:00`);
  date.setDate(date.getDate() + days);
  return date;
};

test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(`${TODAY}T10:00:00-03:00`) });
});

test('receivables prioritize collection, show remaining balance and due urgency', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const synthetic = await installSyntheticClinic(page, { today: TODAY, platformAdmin: false, accountsPopulated: true });
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
  await expect(page).toHaveURL(/\/contas\/receber\/[^/]+\/recebimento$/);
  await expect(page.getByRole('heading', { name: 'Confirmar Recebimento' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#contas-receber-valor-parcial')).toHaveValue('550,00');
  await page.getByRole('button', { name: 'Voltar às contas a receber' }).click();
  await expect(page).toHaveURL('/contas?tab=receber&status=atrasado');

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
  const synthetic = await installSyntheticClinic(page, { today: TODAY, platformAdmin: false });
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
  const synthetic = await installSyntheticClinic(page, { today: TODAY, platformAdmin: false });
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

test('receiving partial amount lives on its own page and keeps idempotent retry data', async ({ page }, info) => {
  const synthetic = await installSyntheticClinic(page, { today: TODAY, platformAdmin: false, accountsPopulated: true });
  const payloads: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/registrar_pagamento', async route => {
    payloads.push(route.request().postDataJSON());
    if (payloads.length === 1) return route.fulfill({ status: 400, json: { code: 'P0001', message: 'Falha sintética ao registrar recebimento' } });
    return route.fulfill({ status: 200, json: { success: true } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/contas?tab=receber');
  const conta = page.getByRole('row').filter({ hasText: 'Procedimento ambulatorial' });
  await conta.getByRole('button', { name: 'Receber saldo' }).click();

  await expect(page).toHaveURL('/contas/receber/00000000-0000-4000-9000-000000000041/recebimento');
  await expect(page.getByRole('heading', { name: 'Confirmar Recebimento' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).not.toContainText('00000000-0000-4000-9000-000000000041');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('receivable-payment-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Confirmar recebimento' }).scrollIntoViewIfNeeded();
  const paymentActionBox = await page.getByRole('button', { name: 'Confirmar recebimento' }).boundingBox();
  const mobileNavigationBox = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
  expect(paymentActionBox).not.toBeNull();
  expect(mobileNavigationBox).not.toBeNull();
  expect(paymentActionBox!.y + paymentActionBox!.height).toBeLessThan(mobileNavigationBox!.y);
  await page.screenshot({ path: info.outputPath('receivable-payment-mobile-actions.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#main-content').evaluate(element => element.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('receivable-payment-desktop.png'), fullPage: true });

  await page.getByLabel('Valor recebido (R$)').fill('275,00');
  await page.getByLabel('Desconto (R$)').fill('10,25');
  await page.getByLabel('Acréscimo (R$)').fill('1,75');
  await page.getByLabel('Observações').fill('Conferência sintética do caixa');
  await page.getByRole('button', { name: 'Confirmar recebimento' }).click();
  await expect(page.getByText('Falha sintética ao registrar recebimento')).toBeVisible();
  await expect(page.getByLabel('Valor recebido (R$)')).toHaveValue('275,00');
  await expect(page).toHaveURL(/\/contas\/receber\/[^/]+\/recebimento$/);

  await page.getByRole('button', { name: 'Confirmar recebimento' }).click();
  await expect(page).toHaveURL('/contas?tab=receber');
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toMatchObject({
    p_lancamento_id: '00000000-0000-4000-9000-000000000041',
    p_pagamentos: [{ valor: 275, parcelas: 1 }],
    p_desconto: 10.25,
    p_acrescimo: 1.75,
    p_observacoes: 'Conferência sintética do caixa',
  });
  expect(payloads[1]).toMatchObject(payloads[0]);
  expect((payloads[0].p_chave_idempotencia as string).length).toBeGreaterThan(0);
  expect(payloads[1].p_chave_idempotencia).toBe(payloads[0].p_chave_idempotencia);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('receivable payment protects a modified draft when returning to the list', async ({ page }) => {
  await installSyntheticClinic(page, { today: TODAY, platformAdmin: false, accountsPopulated: true });
  await page.goto('/contas?tab=receber&status=atrasado');
  await page.getByRole('button', { name: 'Receber saldo' }).first().click();
  await page.getByLabel('Observações').fill('Conferir depois');

  await page.getByRole('button', { name: 'Voltar às contas a receber' }).click();
  const discard = page.getByRole('alertdialog');
  await expect(discard).toContainText('Alterações não salvas');
  await discard.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page).toHaveURL(/\/contas\/receber\/[^/]+\/recebimento$/);
  await expect(page.getByLabel('Observações')).toHaveValue('Conferir depois');

  await page.getByRole('button', { name: 'Voltar às contas a receber' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Descartar', exact: true }).click();
  await expect(page).toHaveURL('/contas?tab=receber&status=atrasado');
});

test('payment reversal opens its own page and keeps the audited reason after a server rejection', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { today: TODAY, appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false, accountsPopulated: true });
  const payloads: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/estornar_pagamento', async route => {
    payloads.push(route.request().postDataJSON());
    if (payloads.length === 1) return route.fulfill({ status: 400, json: { code: 'P0001', message: 'Falha sintética ao estornar' } });
    return route.fulfill({ status: 200, json: { success: true } });
  });
  await page.goto('/contas?tab=receber&status=atrasado');
  const conta = page.getByRole('row').filter({ hasText: 'Procedimento ambulatorial' });
  await conta.getByRole('button', { name: /Mais ações da conta/ }).click();
  await page.getByRole('menuitem', { name: 'Estornar pagamento' }).click();

  await expect(page).toHaveURL('/contas/receber/00000000-0000-4000-9000-000000000041/estorno');
  await expect(page.getByRole('heading', { name: 'Estornar pagamento' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).not.toContainText('00000000-0000-4000-9000-000000000041');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  const action = page.getByRole('button', { name: 'Confirmar estorno' });
  await action.scrollIntoViewIfNeeded();
  const actionBox = await action.boundingBox();
  const mobileNavigationBox = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
  expect(actionBox).not.toBeNull();
  expect(mobileNavigationBox).not.toBeNull();
  expect(actionBox!.y + actionBox!.height).toBeLessThan(mobileNavigationBox!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('payment-reversal-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#main-content').evaluate(element => element.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('payment-reversal-desktop.png'), fullPage: true, animations: 'disabled' });
  await action.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('payment-reversal-desktop-actions.png'), animations: 'disabled' });
  await expect(page.getByRole('combobox', { name: 'Pagamento a estornar' })).toContainText('300');
  await page.getByLabel('Motivo do estorno').fill('Pagamento lançado em duplicidade');
  await page.getByRole('button', { name: 'Confirmar estorno' }).click();
  await expect(page.getByText('Falha sintética ao estornar')).toBeVisible();
  await expect(page.getByLabel('Motivo do estorno')).toHaveValue('Pagamento lançado em duplicidade');

  await page.getByRole('button', { name: 'Confirmar estorno' }).click();
  await expect(page).toHaveURL('/contas?tab=receber&status=atrasado');
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toMatchObject({
    p_pagamento_id: '00000000-0000-4000-9000-000000000051',
    p_motivo: 'Pagamento lançado em duplicidade',
  });
  expect(payloads[1]).toMatchObject(payloads[0]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('payment reversal explains when the account has no active payment', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { today: TODAY, appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false, accountsPopulated: true });
  await page.route('http://127.0.0.1:54321/rest/v1/pagamentos**', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '*/0' }, body: '[]' });
  });

  await page.goto('/contas/receber/00000000-0000-4000-9000-000000000041/estorno');
  await expect(page.getByRole('heading', { name: 'Nenhum pagamento ativo para estornar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar estorno' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Voltar às contas a receber' })).toBeVisible();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('new receivable opens as a page, survives reload, and restores list context', async ({ page }, info) => {
  const synthetic = await installSyntheticClinic(page, { today: TODAY, appOrigin: String(info.project.use.baseURL), platformAdmin: false, accountsPopulated: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/contas?tab=receber&status=aberto&mes=2026-10');
  const search = page.getByRole('textbox', { name: 'Buscar contas a receber' });
  await search.fill('Procedimento ambulatorial');
  await page.getByRole('combobox', { name: 'Filtrar por categoria' }).click();
  await page.getByRole('option', { name: 'Procedimento', exact: true }).click();
  await page.getByRole('button', { name: 'Nova Receita', exact: true }).click();

  await expect(page).toHaveURL('/contas/receber/nova');
  await expect(page.getByRole('heading', { name: 'Nova receita', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('new-receivable-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Salvar receita', exact: true }).scrollIntoViewIfNeeded();
  const mobileSaveBox = await page.getByRole('button', { name: 'Salvar receita', exact: true }).boundingBox();
  const mobileNavigationBox = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
  expect(mobileSaveBox).not.toBeNull();
  expect(mobileNavigationBox).not.toBeNull();
  expect(mobileSaveBox!.y + mobileSaveBox!.height).toBeLessThan(mobileNavigationBox!.y);
  await page.screenshot({ path: info.outputPath('new-receivable-mobile-actions.png'), fullPage: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.locator('#main-content').evaluate(element => element.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('new-receivable-tablet.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#main-content').evaluate(element => element.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('new-receivable-desktop.png'), fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Nova receita', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Voltar às contas a receber' }).click();

  await expect(page).toHaveURL('/contas?tab=receber&status=aberto&mes=2026-10');
  await expect(page.getByRole('textbox', { name: 'Buscar contas a receber' })).toHaveValue('Procedimento ambulatorial');
  await expect(page.getByRole('combobox', { name: 'Filtrar por categoria' })).toContainText('Procedimento');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('receivable creation keeps the selected patient and draft after an error', async ({ page }, info) => {
  await installSyntheticClinic(page, { today: TODAY, appOrigin: String(info.project.use.baseURL), platformAdmin: false, accountsPopulated: true });
  const payloads: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/lancamentos*', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    payloads.push(route.request().postDataJSON());
    if (payloads.length === 1) return route.fulfill({ status: 400, json: { message: 'Falha sintética ao cadastrar receita' } });
    return route.fulfill({ status: 201, json: [] });
  });
  await page.goto('/contas?tab=receber&status=aberto&mes=2026-10');
  await page.getByRole('button', { name: 'Nova Receita', exact: true }).click();
  await page.getByRole('combobox', { name: 'Paciente (opcional)' }).click();
  await page.getByPlaceholder('Buscar paciente...').fill('Pessoa Exemplo QA');
  await page.getByRole('option', { name: /Pessoa Exemplo QA/ }).click();
  await page.getByLabel('Descrição da receita').fill('Consulta de avaliação sintética');
  await page.getByLabel('Valor da receita em reais').fill('184,75');
  await page.getByLabel('Vencimento da receita').fill('2026-11-20');

  await page.getByRole('button', { name: 'Salvar receita', exact: true }).click();
  await expect(page.getByText('Falha sintética ao cadastrar receita', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Descrição da receita')).toHaveValue('Consulta de avaliação sintética');
  await expect(page.getByRole('combobox', { name: 'Paciente (opcional)' })).toContainText('Pessoa Exemplo QA');
  await expect(page).toHaveURL('/contas/receber/nova');

  await page.getByRole('button', { name: 'Salvar receita', exact: true }).click();
  await expect(page).toHaveURL('/contas?tab=receber&status=aberto&mes=2026-10');
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toMatchObject({
    tipo: 'receita',
    clinica_id: '00000000-0000-4000-8000-000000000002',
    paciente_id: '00000000-0000-4000-8000-000000000004',
    categoria: 'consulta',
    descricao: 'Consulta de avaliação sintética',
    valor: 184.75,
    data_vencimento: '2026-11-20',
    status: 'pendente',
  });
});

test('receivable page protects and discards unsaved form without writing', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { today: TODAY, platformAdmin: false });
  await page.goto('/contas/receber/nova');
  await page.getByLabel('Descrição da receita').fill('Rascunho de receita QA');

  await page.getByRole('button', { name: 'Voltar às contas a receber' }).click();
  const discard = page.getByRole('alertdialog');
  await expect(discard).toContainText('Alterações não salvas');
  await discard.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page).toHaveURL('/contas/receber/nova');
  await expect(page.getByLabel('Descrição da receita')).toHaveValue('Rascunho de receita QA');

  await page.getByRole('button', { name: 'Voltar às contas a receber' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Descartar', exact: true }).click();
  await expect(page).toHaveURL('/contas?tab=receber');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.filter(write => !write.includes('/rpc/') && !write.includes('/functions/v1/mercadopago-point'))).toEqual([]);
});
