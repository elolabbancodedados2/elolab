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
  await page.goto('/contas?tab=pagar&status=aberto&mes=2026-10');
  await expect(main.getByRole('heading', { level: 2, name: 'Resumo de vencimentos' })).toBeVisible();
  await expect(main.getByRole('button', { name: /Vencidas \/ em atraso/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(main.getByRole('button', { name: /Vencidas \/ em atraso/ }).locator('span').nth(1)).toHaveClass(/text-destructive/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('payables-desktop-summary.png'), fullPage: true, animations: 'disabled' });

  const payableRow = main.getByRole('row').filter({ hasText: 'Manutenção preventiva dos equipamentos de diagnóstico e climatização da unidade principal' });
  await main.getByRole('textbox', { name: 'Buscar contas a pagar' }).fill('Manutenção preventiva');
  await payableRow.getByRole('button', { name: 'Pagar saldo' }).click();
  await expect(page).toHaveURL('/contas/pagar/00000000-0000-4000-9000-000000000043/pagamento');
  await expect(page.getByRole('heading', { name: 'Registrar pagamento da conta' })).toBeVisible();
  await expect(page.getByText('Saldo em aberto', { exact: true }).locator('..')).toContainText(/1\.600,00/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).not.toContainText('00000000-0000-4000-9000-000000000043');
  await page.getByRole('button', { name: 'Voltar às contas a pagar' }).click();
  await expect(page).toHaveURL('/contas?tab=pagar&status=aberto&mes=2026-10');
  await expect(page.getByRole('textbox', { name: 'Buscar contas a pagar' })).toHaveValue('Manutenção preventiva');

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

test('payable payment keeps the audited payload after an uncertain response and retries with the same idempotency key', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, accountsPopulated: true });
  const accountId = '00000000-0000-4000-9000-000000000043';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const account = {
    id: accountId, clinica_id: synthetic.clinicId, tipo: 'despesa', categoria: 'fornecedores',
    descricao: 'Manutenção preventiva QA', valor: 2400, valor_pago: 800, desconto: 0, acrescimo: 0,
    status: 'parcial', data_vencimento: today, fornecedor: 'Fornecedor QA', numero_documento: 'NF-QA-001',
    competencia: today.slice(0, 7), forma_pagamento: 'pix', recorrente: true, frequencia_recorrencia: 'mensal',
  };
  const payloads: Record<string, unknown>[] = [];
  await page.route('http://127.0.0.1:54321/rest/v1/lancamentos**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET' && url.searchParams.get('id') === `eq.${accountId}`) {
      expect(url.searchParams.get('clinica_id')).toBe(`eq.${synthetic.clinicId}`);
      return route.fulfill({ status: 200, json: account });
    }
    return route.fallback();
  });
  await page.route('http://127.0.0.1:54321/rest/v1/pagamentos**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, json: [] });
    return route.fallback();
  });
  await page.route('**/rest/v1/rpc/registrar_pagamento', async route => {
    payloads.push(route.request().postDataJSON() as Record<string, unknown>);
    if (payloads.length === 1) return route.fulfill({ status: 503, json: { code: 'SYNTHETIC_NETWORK', message: 'Falha sintética ao confirmar pagamento' } });
    return route.fulfill({ status: 200, json: { repetido: false, status: 'pago', valor: 2400, valor_pago: 2400, saldo: 0 } });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/contas?tab=pagar&status=aberto&mes=2026-10');
  const main = page.locator('#main-content');
  const payableRow = main.getByRole('row').filter({ hasText: 'Manutenção preventiva dos equipamentos de diagnóstico e climatização da unidade principal' });
  await payableRow.getByRole('button', { name: 'Pagar saldo' }).click();
  await expect(page).toHaveURL(`/contas/pagar/${accountId}/pagamento`);
  await expect(page.getByRole('heading', { name: 'Registrar pagamento da conta' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Despesa recorrente.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('#main-content').evaluate(element => element.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('payable-payment-mobile-top.png'), animations: 'disabled' });
  await page.getByLabel('Valor deste pagamento (R$)').fill('500,25');
  await page.getByLabel('Forma de pagamento').click();
  await page.getByRole('option', { name: 'Cartão de crédito' }).click();
  await page.getByLabel('Observações (opcional)').fill('Comprovante QA 204');
  const confirm = page.getByRole('button', { name: 'Confirmar pagamento' });
  await expect(confirm).toBeEnabled();
  await confirm.scrollIntoViewIfNeeded();
  const actionBounds = await confirm.boundingBox();
  const navBounds = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
  expect(actionBounds).not.toBeNull();
  expect(navBounds).not.toBeNull();
  expect(actionBounds!.y + actionBounds!.height).toBeLessThan(navBounds!.y);
  await page.screenshot({ path: testInfo.outputPath('payable-payment-mobile-action.png'), animations: 'disabled' });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#main-content').evaluate(element => element.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('payable-payment-desktop.png'), animations: 'disabled' });
  await confirm.click();
  await expect(page.getByRole('alert')).toContainText('Falha sintética ao confirmar pagamento');
  await expect(page.getByLabel('Valor deste pagamento (R$)')).toHaveValue('500,25');
  await expect(page.getByLabel('Observações (opcional)')).toHaveValue('Comprovante QA 204');
  await expect(page.getByRole('button', { name: 'Confirmar novamente' })).toBeEnabled();
  await page.getByRole('button', { name: 'Confirmar novamente' }).click();
  await expect(page).toHaveURL('/contas?tab=pagar&status=aberto&mes=2026-10');
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toMatchObject({
    p_lancamento_id: accountId,
    p_pagamentos: [{ forma_pagamento: 'credito', valor: 500.25, parcelas: 1 }],
    p_observacoes: 'Comprovante QA 204',
  });
  expect(payloads[1]).toMatchObject(payloads[0]);
  expect(payloads[0].p_chave_idempotencia).toMatch(/^[0-9a-f-]{36}$/i);
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
  // A leitura é disparada depois do lazy load da tela; o fallback do lazy
  // também usa .animate-pulse, por isso o alvo é o esqueleto da própria tela.
  await expect.poll(() => leituras, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(main.getByTestId('contas-pagar-carregando')).toBeVisible();
  await expect(main.getByText('Nenhuma conta cadastrada', { exact: true })).toHaveCount(0);
  liberarResposta();
  await expect(main.getByText('Nenhuma conta cadastrada', { exact: true })).toBeVisible();
  await expect(main.getByTestId('contas-pagar-carregando')).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('new payable opens as a page, survives reload, and returns to the filtered list', async ({ page }, info) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, accountsPopulated: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/contas?tab=pagar&status=aberto&mes=2026-10');
  const search = page.getByPlaceholder('Descrição, fornecedor, NF...');
  await search.fill('Fornecedor QA');
  await page.getByRole('button', { name: 'Nova Conta', exact: true }).first().click();

  await expect(page).toHaveURL('/contas/pagar/nova');
  await expect(page.getByRole('heading', { name: 'Nova Conta a Pagar', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('new-payable-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Salvar conta', exact: true }).scrollIntoViewIfNeeded();
  const mobileSaveBox = await page.getByRole('button', { name: 'Salvar conta', exact: true }).boundingBox();
  const mobileNavigationBox = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
  expect(mobileSaveBox).not.toBeNull();
  expect(mobileNavigationBox).not.toBeNull();
  expect(mobileSaveBox!.y + mobileSaveBox!.height).toBeLessThan(mobileNavigationBox!.y);
  await page.screenshot({ path: info.outputPath('new-payable-mobile-actions.png'), fullPage: true });

  await page.setViewportSize({ width: 768, height: 1024 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('new-payable-tablet.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: info.outputPath('new-payable-desktop.png'), fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Nova Conta a Pagar', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Voltar às contas a pagar' }).click();

  await expect(page).toHaveURL('/contas?tab=pagar&status=aberto&mes=2026-10');
  await expect(page.getByPlaceholder('Descrição, fornecedor, NF...')).toHaveValue('Fornecedor QA');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('payable creation keeps its draft after an error and submits the existing financial contract', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, accountsPopulated: true });
  const payloads: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/lancamentos*', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    payloads.push(route.request().postDataJSON());
    if (payloads.length === 1) return route.fulfill({ status: 400, json: { message: 'Falha sintética ao cadastrar' } });
    return route.fulfill({ status: 201, json: [] });
  });
  await page.goto('/contas?tab=pagar&status=aberto&mes=2026-10');
  await page.getByRole('button', { name: 'Nova Conta', exact: true }).first().click();
  await page.getByLabel('Descrição *').fill('Licença de software da clínica');
  await page.getByLabel('Fornecedor / Favorecido').fill('Fornecedor QA');
  await page.getByLabel('Valor (R$) *').fill('184.75');
  await page.getByLabel('Vencimento *').fill('2026-11-20');
  await page.getByRole('switch', { name: 'Marcar como despesa recorrente' }).click();
  await page.getByLabel('Frequência').click();
  await page.getByRole('option', { name: 'Trimestral', exact: true }).click();

  await page.getByRole('button', { name: 'Salvar conta', exact: true }).click();
  await expect(page.getByText('Falha sintética ao cadastrar', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Descrição *')).toHaveValue('Licença de software da clínica');
  await expect(page).toHaveURL('/contas/pagar/nova');

  await page.getByRole('button', { name: 'Salvar conta', exact: true }).click();
  await expect(page).toHaveURL('/contas?tab=pagar&status=aberto&mes=2026-10');
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toMatchObject({
    tipo: 'despesa',
    clinica_id: '00000000-0000-4000-8000-000000000002',
    descricao: 'Licença de software da clínica',
    fornecedor: 'Fornecedor QA',
    valor: 184.75,
    data_vencimento: '2026-11-20',
    recorrente: true,
    frequencia_recorrencia: 'trimestral',
    status: 'pendente',
  });
});

test('payable page confirms discard on navigation and keeps the draft when canceled', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  await page.goto('/contas/pagar/nova');
  await page.getByLabel('Descrição *').fill('Rascunho de despesa QA');

  await page.getByRole('button', { name: 'Voltar às contas a pagar' }).click();
  const discard = page.getByRole('alertdialog');
  await expect(discard).toContainText('Alterações não salvas');
  await discard.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page).toHaveURL('/contas/pagar/nova');
  await expect(page.getByLabel('Descrição *')).toHaveValue('Rascunho de despesa QA');

  await page.getByRole('button', { name: 'Voltar às contas a pagar' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Descartar', exact: true }).click();
  await expect(page).toHaveURL('/contas?tab=pagar');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.filter(write => !write.includes('/rpc/') && !write.includes('/functions/v1/mercadopago-point'))).toEqual([]);
});
