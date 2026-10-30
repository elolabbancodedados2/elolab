import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

const patientId = '00000000-0000-4000-8000-000000000004';
const requestId = '00000000-0000-4000-9000-000000000401';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

test('LGPD export scope and delivery evidence use safe dedicated pages', async ({ page }, info) => {
  const appOrigin = new URL(String(info.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role: 'admin' });
  const rpcCalls: unknown[] = [];
  let pending = true;

  await page.route('**/rest/v1/lgpd_access_request_log*', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(pending ? [{
          id: requestId,
          protocolo: 'LGPD-QA-0401',
          requested_at: '2026-10-29T10:00:00.000Z',
          escopo: ['cadastro', 'clinico'],
          pacientes: { nome: 'Pessoa Exemplo QA' },
        }] : []),
      });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/rest/v1/rpc/concluir_exportacao_lgpd_paciente', async route => {
    rpcCalls.push(route.request().postDataJSON());
    pending = false;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'fulfilled', protocolo: 'LGPD-QA-0401' }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lgpd-pacientes');
  await page.getByRole('textbox', { name: 'Buscar paciente por nome, CPF ou e-mail' }).fill('Pessoa Exemplo QA');
  await expect(page.getByRole('button', { name: 'Exportar' })).toBeVisible();
  await page.getByRole('button', { name: 'Exportar' }).click();

  await expect(page).toHaveURL('/lgpd-pacientes?tela=exportar');
  await expect(page.getByTestId('lgpd-export-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Escopo da exportação' })).toBeVisible();
  const exportTitleBounds = await page.getByRole('heading', { name: 'Escopo da exportação' }).boundingBox();
  expect(exportTitleBounds && exportTitleBounds.y >= 140).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(page.url()).not.toContain(patientId);
  expect(page.url()).not.toContain('Pessoa');
  await expect(page.getByLabel('Cadastro e consentimentos')).toBeChecked();
  await expect(page.getByLabel('Cadastro e consentimentos')).toBeDisabled();

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.locator('main#main-content').evaluate(element => element.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('lgpd-export-scope-desktop.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Trilha de auditoria').uncheck();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const exportButton = page.getByRole('button', { name: 'Gerar arquivo JSON' });
  await exportButton.scrollIntoViewIfNeeded();
  const [exportBounds, bottomNavigationBounds] = await Promise.all([
    exportButton.boundingBox(),
    page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox(),
  ]);
  expect(exportBounds && bottomNavigationBounds && exportBounds.y + exportBounds.height <= bottomNavigationBounds.y).toBe(true);
  await page.screenshot({ path: info.outputPath('lgpd-export-scope-mobile-action.png'), animations: 'disabled' });
  await page.locator('main#main-content').evaluate(element => element.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('lgpd-export-scope-mobile.png'), animations: 'disabled' });

  await page.getByRole('button', { name: 'Voltar à lista' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Descartar e sair' }).click();
  await expect(page).toHaveURL('/lgpd-pacientes');

  await page.getByRole('button', { name: 'Confirmar entrega' }).click();
  await expect(page).toHaveURL('/lgpd-pacientes?tela=entrega');
  await expect(page.getByTestId('lgpd-delivery-page')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('LGPD-QA-0401')).toBeVisible();
  await page.getByLabel('Evidência da entrega').fill('Entregue.');
  await expect(page.getByRole('button', { name: 'Confirmar entrega' }).last()).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId('lgpd-delivery-expired')).toBeVisible();
  await expect(page.getByText('Pessoa Exemplo QA')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(page.url()).not.toContain(requestId);
  await page.getByRole('button', { name: 'Voltar à lista' }).click();

  await page.getByRole('button', { name: 'Confirmar entrega' }).click();
  const evidence = 'Arquivo entregue pessoalmente ao titular com protocolo assinado.';
  await page.getByLabel('Evidência da entrega').fill(evidence);
  await page.locator('main#main-content').evaluate(element => element.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('lgpd-delivery-mobile.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Confirmar entrega' }).scrollIntoViewIfNeeded();
  const saveButton = page.getByRole('button', { name: 'Confirmar entrega' }).last();
  const bottomNavigation = page.getByRole('navigation', { name: 'Navegação principal' });
  const [saveBounds, navigationBounds] = await Promise.all([saveButton.boundingBox(), bottomNavigation.boundingBox()]);
  expect(saveBounds && navigationBounds && saveBounds.y + saveBounds.height <= navigationBounds.y).toBe(true);
  await page.screenshot({ path: info.outputPath('lgpd-delivery-mobile-action.png'), animations: 'disabled' });
  await saveButton.click();
  await expect(page).toHaveURL('/lgpd-pacientes');
  await expect(page.getByText('Nenhuma exportação pendente.')).toBeVisible();
  expect(rpcCalls).toEqual([{ p_id: requestId, p_evidencia: evidence }]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('the export page sends the selected scope through the existing audited export flow', async ({ page }, info) => {
  const appOrigin = new URL(String(info.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role: 'admin' });
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  const auditCalls: unknown[] = [];
  const exportRequestId = '00000000-0000-4000-9000-000000000402';

  await page.route('**/rest/v1/pacientes*', async route => {
    const headers = await route.request().allHeaders();
    if (route.request().method() === 'GET' && headers.accept?.includes('application/vnd.pgrst.object+json')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: patientId, nome: 'Pessoa Exemplo QA' }) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/lgpd_access_request_log*', async route => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (method === 'POST') {
      inserts.push(body);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: exportRequestId, requested_at: '2026-10-30T10:00:00.000Z', protocolo: 'LGPD-QA-0402' }),
      });
      return;
    }
    if (method === 'PATCH') {
      updates.push(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: exportRequestId, status: 'pending', responsavel_id: synthetic.userId, evidencia: body.evidencia }),
      });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/rest/v1/rpc/registrar_exportacao_lgpd_paciente', async route => {
    auditCalls.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });
  await page.route('**/functions/v1/patient-lgpd-memed-export', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ memed_prescricoes: [] }) });
  });

  await page.goto('/lgpd-pacientes');
  await page.getByRole('textbox', { name: 'Buscar paciente por nome, CPF ou e-mail' }).fill('Pessoa Exemplo QA');
  await page.getByRole('button', { name: 'Exportar' }).click();
  await expect(page.getByTestId('lgpd-export-page')).toBeVisible();
  for (const category of [
    'Agenda, fila e retornos',
    'Prontuário, documentos e exames',
    'Arquivos anexos do prontuário',
    'Financeiro e convênio',
    'Conversas de WhatsApp',
    'Trilha de auditoria',
  ]) {
    await page.getByLabel(category).uncheck();
  }

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Gerar arquivo JSON' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^lgpd-export-LGPD-QA-0402-2026-10-30\.json$/);
  expect(inserts).toEqual([{ paciente_id: patientId, request_type: 'export', status: 'pending', escopo: ['cadastro'] }]);
  expect(updates).toHaveLength(1);
  expect(updates[0].evidencia).toContain('entrega formal ao titular');
  expect(auditCalls).toEqual([{ p_paciente_id: patientId }]);
  await expect(page).toHaveURL('/lgpd-pacientes');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
