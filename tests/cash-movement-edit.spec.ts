import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const todaySaoPaulo = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

test('cash movement editing uses a dedicated responsive page and retries the same update after failure', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'financeiro' });
  const today = todaySaoPaulo();
  const movementId = '00000000-0000-4000-9000-000000000085';
  const movement = {
    id: movementId, tipo: 'despesa', descricao: 'Material de escritório QA', valor: 250,
    forma_pagamento: 'dinheiro', categoria: 'administrativo', data: today,
    created_at: `${today}T14:00:00-03:00`, origem_pagamento: false,
  };
  const payloads: Record<string, unknown>[] = [];

  await page.route('**/rest/v1/rpc/movimentos_caixa_diario**', route => route.fulfill({ status: 200, json: movement }));
  await page.route('http://127.0.0.1:54321/rest/v1/lancamentos**', async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    payloads.push(route.request().postDataJSON() as Record<string, unknown>);
    if (payloads.length === 1) return route.fulfill({ status: 503, json: { code: 'SYNTHETIC_FAILURE', message: 'Falha sintética ao salvar o lançamento' } });
    return route.fulfill({ status: 200, json: [{ id: movementId }] });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/recepcao/caixa/lancamentos/${movementId}/editar`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Editar lançamento' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).not.toContainText(movementId);
  await expect(page.getByText('Tipo, categoria e data são mantidos.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('#main-content').evaluate(element => element.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('cash-movement-edit-mobile-top.png'), animations: 'disabled' });
  await page.getByLabel('Descrição').fill('Compra de material de escritório');
  const value = page.getByLabel('Valor (R$)');
  await value.fill('250,123');
  await expect(page.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
  await expect(page.getByText('Informe um valor válido em reais.')).toBeVisible();
  await value.fill('251,45');
  await page.getByLabel('Forma de pagamento').click();
  await page.getByRole('option', { name: 'PIX', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Salvar alterações' })).toBeEnabled();
  const mobileSave = page.getByRole('button', { name: 'Salvar alterações' });
  await mobileSave.scrollIntoViewIfNeeded();
  const mobileSaveBounds = await mobileSave.boundingBox();
  const mobileNavigationBounds = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
  expect(mobileSaveBounds).not.toBeNull();
  expect(mobileNavigationBounds).not.toBeNull();
  expect(mobileSaveBounds!.y + mobileSaveBounds!.height).toBeLessThan(mobileNavigationBounds!.y);
  await page.screenshot({ path: testInfo.outputPath('cash-movement-edit-mobile-action.png'), animations: 'disabled' });

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('heading', { name: 'Editar lançamento' })).toBeVisible();
  await page.locator('#main-content').evaluate(element => element.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('cash-movement-edit-desktop.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('alert')).toContainText('Falha sintética ao salvar o lançamento');
  await expect(page.getByLabel('Descrição')).toHaveValue('Compra de material de escritório');
  await expect(value).toHaveValue('251,45');
  await expect(page).toHaveURL(`/recepcao/caixa/lancamentos/${movementId}/editar`);
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page).toHaveURL('/caixa-diario');
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toMatchObject({ descricao: 'Compra de material de escritório', valor: 251.45, forma_pagamento: 'pix' });
  expect(payloads[1]).toMatchObject(payloads[0]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('cash movement edit protects unsaved changes and blocks linked receipts', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'financeiro' });
  const movementId = '00000000-0000-4000-9000-000000000086';
  const receiptId = '00000000-0000-4000-9000-000000000087';
  const movement = {
    id: movementId, tipo: 'despesa', descricao: 'Compra QA', valor: 25,
    forma_pagamento: 'pix', categoria: 'administrativo', data: todaySaoPaulo(),
    created_at: `${todaySaoPaulo()}T10:00:00-03:00`, origem_pagamento: false,
  };
  await page.route('**/rest/v1/rpc/movimentos_caixa_diario**', route => {
    const url = new URL(route.request().url());
    const id = url.searchParams.get('id')?.replace('eq.', '');
    const linkedReceipt = { ...movement, id: receiptId, tipo: 'receita', origem_pagamento: true };
    return route.fulfill({ status: 200, json: id === receiptId ? linkedReceipt : movement });
  });
  await page.goto(`/recepcao/caixa/lancamentos/${movementId}/editar`);
  await page.getByLabel('Descrição').fill('Compra alterada QA');
  await page.getByRole('button', { name: 'Voltar ao caixa diário' }).click();
  const discard = page.getByRole('alertdialog');
  await expect(discard).toContainText('Alterações não salvas');
  await discard.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page).toHaveURL(`/recepcao/caixa/lancamentos/${movementId}/editar`);
  await expect(page.getByLabel('Descrição')).toHaveValue('Compra alterada QA');
  await page.getByRole('button', { name: 'Voltar ao caixa diário' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Descartar', exact: true }).click();
  await expect(page).toHaveURL('/caixa-diario');
  await page.goto(`/recepcao/caixa/lancamentos/${receiptId}/editar`);
  await expect(page.getByRole('heading', { name: 'Lançamento não disponível para edição' })).toBeVisible();
  await expect(page.getByLabel('Descrição')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Salvar alterações' })).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
