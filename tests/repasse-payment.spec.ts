import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const todaySaoPaulo = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

async function installSyntheticRepasse(page: Page, sourceStatus = 'pago') {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'financeiro' });
  const today = todaySaoPaulo();
  const repasseId = '00000000-0000-4000-9000-000000000091';
  const launchId = '00000000-0000-4000-9000-000000000092';
  const doctorId = '00000000-0000-4000-9000-000000000093';
  const repasse = {
    id: repasseId, lancamento_id: launchId, clinica_id: synthetic.clinicId, medico_id: doctorId,
    competencia: `${today.slice(0, 7)}-01`, valor_base: 1000, valor_repasse: 300,
    percentual: 30, tipo_calculo: 'percentual', valor_configurado: null, status: 'aprovado',
    lancamento_pagamento_id: null, medicos: { nome: 'Dra. Ana QA', crm: '12345' },
    lancamentos: { status: sourceStatus },
  };
  await page.route('http://127.0.0.1:54321/rest/v1/repasses_medicos**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '*/1' }, body: JSON.stringify([repasse]),
  }));
  await page.route('http://127.0.0.1:54321/rest/v1/lancamentos**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '*/1' }, body: JSON.stringify([{ status: sourceStatus }]),
  }));
  return { synthetic, repasseId, launchId };
}

test('repasse payment opens its own page and retries with the same form after an uncertain result', async ({ page }, testInfo) => {
  const { synthetic, repasseId } = await installSyntheticRepasse(page);
  const payloads: Record<string, unknown>[] = [];
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/registrar_pagamento_repasse_medico', async route => {
    payloads.push(route.request().postDataJSON() as Record<string, unknown>);
    if (payloads.length === 1) {
      await route.fulfill({ status: 503, json: { code: 'SYNTHETIC_FAILURE', message: 'Falha sintética após registro do pagamento' } });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ success: true, ja_registrado: true, lancamento_id: '00000000-0000-4000-9000-000000000094' }) });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/repasses-medicos');
  await page.getByRole('button', { name: 'Registrar pagamento' }).click();
  await expect(page).toHaveURL(`/repasses-medicos/${repasseId}/pagamento`);
  await expect(page.getByRole('heading', { name: 'Registrar pagamento do repasse' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Nenhuma transferência bancária será iniciada pelo EloLab.')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: testInfo.outputPath('repasse-payment-desktop.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Forma de pagamento').click();
  await page.getByRole('option', { name: 'PIX', exact: true }).click();
  await page.getByLabel('Referência ou observação (opcional)').fill('Comprovante QA 1001');
  const confirm = page.getByRole('button', { name: 'Confirmar pagamento realizado' });
  await expect(confirm).toBeEnabled();
  await page.locator('#main-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(confirm).toBeInViewport();
  const actionBox = await confirm.boundingBox();
  const navBox = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
  expect(actionBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  expect(actionBox!.y + actionBox!.height).toBeLessThan(navBox!.y);
  await page.screenshot({ path: testInfo.outputPath('repasse-payment-mobile.png'), animations: 'disabled' });
  await confirm.click();
  await expect(page.getByRole('alert')).toContainText('Falha sintética após registro do pagamento');
  await expect(page.getByLabel('Referência ou observação (opcional)')).toHaveValue('Comprovante QA 1001');
  await confirm.click();
  await expect(page).toHaveURL('/repasses-medicos');
  await expect(page.getByLabel('Competência')).toHaveValue(todaySaoPaulo().slice(0, 7));
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toMatchObject({ p_repasse_id: repasseId, p_forma_pagamento: 'pix', p_observacoes: 'Comprovante QA 1001' });
  expect(payloads[1]).toMatchObject(payloads[0]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('repasse cannot be paid if the originating receipt is not settled', async ({ page }) => {
  const { synthetic, repasseId } = await installSyntheticRepasse(page, 'pendente');
  await page.goto(`/repasses-medicos/${repasseId}/pagamento`);
  await expect(page.getByRole('heading', { name: 'Receita de origem não está quitada' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar pagamento realizado' })).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
