import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test('anexo clínico é incluído em página própria e retorna à evolução correta', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, {
    role: 'medico',
    platformAdmin: false,
    prontuarioDraft: true,
  });
  const patientId = '00000000-0000-4000-8000-000000000004';
  const recordId = '00000000-0000-4000-9000-000000000101';
  const uploadRequests: string[] = [];

  await page.route('**/storage/v1/object/medical-attachments/**', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    uploadRequests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ Id: 'synthetic-object-1', Key: `medical-attachments/${recordId}/test.pdf` }),
    });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/prontuarios?paciente=${patientId}&prontuario=${recordId}&secao=anexos`);
  await expect(page.getByRole('tab', { name: 'Anexos' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Solicitar Edição' }).click();
  await page.getByRole('button', { name: 'Adicionar Anexo' }).click();

  await expect(page).toHaveURL(new RegExp(`/prontuarios/${recordId}/anexos/novo`));
  await expect(page.getByRole('heading', { name: 'Adicionar anexo ao prontuário' })).toBeVisible();
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(breadcrumb).toContainText('Adicionar anexo ao prontuário');
  await expect(breadcrumb).not.toContainText(recordId);
  await expect(page.getByText('Pessoa Exemplo QA', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Arquivo')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('prontuario-attachment-upload-desktop.png'), animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const actions = page.getByTestId('attachment-actions');
  const cancel = actions.getByRole('button', { name: 'Cancelar' });
  const submit = actions.getByRole('button', { name: 'Adicionar anexo' });
  const nav = page.getByRole('navigation', { name: 'Navegação principal' });
  await actions.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('prontuario-attachment-upload-mobile.png'), animations: 'disabled' });
  const [cancelBox, submitBox, navBox] = await Promise.all([cancel.boundingBox(), submit.boundingBox(), nav.boundingBox()]);
  expect(cancelBox && submitBox && navBox && cancelBox.y + cancelBox.height <= navBox.y && submitBox.y + submitBox.height <= navBox.y, JSON.stringify({ cancelBox, submitBox, navBox })).toBe(true);

  await page.getByLabel('Arquivo').setInputFiles({
    name: 'laudo-sintetico.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('PDF sintético para QA, sem dados clínicos reais.'),
  });
  await page.getByLabel(/Descrição/).fill('Laudo sintético de validação do fluxo.');
  await page.getByRole('button', { name: 'Adicionar anexo' }).click();

  await expect(page).toHaveURL(new RegExp(`/prontuarios\\?paciente=${patientId}.*secao=anexos`));
  await expect(page.getByRole('tab', { name: 'Anexos' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('laudo-sintetico.pdf')).toBeVisible();
  expect(uploadRequests).toHaveLength(1);
  expect(uploadRequests[0]).toContain(`/storage/v1/object/medical-attachments/${recordId}/`);
  expect(synthetic.writes).toContain(`${'http://127.0.0.1:54321'} POST /rest/v1/anexos_prontuario`);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual(['http://127.0.0.1:54321 POST /rest/v1/anexos_prontuario']);
});
