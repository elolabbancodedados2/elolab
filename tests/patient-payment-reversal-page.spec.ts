import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const patientId = '00000000-0000-4000-8000-000000000004';
const accountId = '00000000-0000-4000-9000-000000000041';
const paymentId = '00000000-0000-4000-9000-000000000051';

test('estorno do extrato do paciente usa página própria e retorna ao financeiro da ficha', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, {
    appOrigin: String(testInfo.project.use.baseURL),
    platformAdmin: false,
    role: 'recepcao',
    accountsPopulated: true,
  });
  const writes: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/estornar_pagamento', async route => {
    writes.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 200, json: { success: true, valor_estornado: 300, conta_status: 'pendente' } });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/pacientes/${patientId}?tab=financeiro`);
  const main = page.locator('#main-content');
  await expect(main.getByText('Extrato do paciente')).toBeVisible();
  const charge = main.getByRole('button').filter({ hasText: 'Procedimento ambulatorial de complexidade intermediária' });
  await charge.scrollIntoViewIfNeeded();
  const profileScrollTop = await main.evaluate(element => element.scrollTop);
  await charge.click();
  await main.getByRole('button', { name: 'Estornar', exact: true }).click();

  await expect(page).toHaveURL(`/pacientes/${patientId}/cobrancas/${accountId}/estorno`);
  await expect(page.getByRole('heading', { name: 'Estornar pagamento', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Estornar pagamento', exact: true })).toBeInViewport();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Pagamento a estornar' })).toContainText('300');
  const breadcrumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(breadcrumbs).not.toContainText(accountId);
  await expect(breadcrumbs).toContainText('Ficha do paciente');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('patient-payment-reversal-mobile-top.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('heading', { name: 'Estornar pagamento', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('patient-payment-reversal-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  const action = page.getByRole('button', { name: 'Confirmar estorno' });
  await action.scrollIntoViewIfNeeded();
  const [actionBox, mobileNavBox] = await Promise.all([
    action.boundingBox(),
    page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox(),
  ]);
  expect(actionBox && mobileNavBox && actionBox.y + actionBox.height <= mobileNavBox.y).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('patient-payment-reversal-mobile.png'), fullPage: true, animations: 'disabled' });

  await page.getByLabel('Motivo do estorno').fill('erro');
  await expect(action).toBeEnabled();
  await page.getByLabel('Motivo do estorno').fill('Pagamento lançado com forma incorreta');
  await action.click();
  await expect(page).toHaveURL(`/pacientes/${patientId}?tab=financeiro`);
  await expect(page.getByRole('tab', { name: /Financeiro/ })).toHaveAttribute('data-state', 'active');
  await expect.poll(() => main.evaluate(element => element.scrollTop)).toBe(profileScrollTop);
  expect(writes).toEqual([{ p_pagamento_id: paymentId, p_motivo: 'Pagamento lançado com forma incorreta' }]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('estorno por contexto do paciente não aceita cobrança de outra pessoa', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, {
    appOrigin: String(testInfo.project.use.baseURL),
    platformAdmin: false,
    role: 'recepcao',
    accountsPopulated: true,
  });
  await page.goto(`/pacientes/00000000-0000-4000-8000-000000000099/cobrancas/${accountId}/estorno`);
  await expect(page.getByRole('heading', { name: 'Cobrança de outro paciente', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar estorno' })).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('perfil de enfermagem não acessa o estorno pelo prontuário', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, {
    appOrigin: String(testInfo.project.use.baseURL),
    platformAdmin: false,
    role: 'enfermagem',
  });
  await page.goto(`/pacientes/${patientId}/cobrancas/${accountId}/estorno`);
  await expect(page.getByRole('heading', { name: 'Acesso Negado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar estorno' })).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
