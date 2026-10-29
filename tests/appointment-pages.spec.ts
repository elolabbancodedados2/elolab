import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
test.setTimeout(60_000);

test('new appointment is a page, preserves agenda context and protects unsaved work', async ({ page }, testInfo) => {
  await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false });
  await page.goto('/agenda?data=2026-10-29&view=weekly');
  await page.getByRole('textbox', { name: 'Buscar paciente, CPF ou telefone' }).fill('Pessoa QA');
  await page.getByRole('button', { name: 'Nova consulta', exact: true }).click();
  await expect(page).toHaveURL(/\/agenda\/nova\?data=2026-10-29/);
  await expect(page.getByRole('heading', { name: 'Nova consulta', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Data *', { exact: true })).toHaveValue('2026-10-29');
  await page.getByLabel('Observações', { exact: true }).fill('Rascunho sintético não enviado');
  await page.getByRole('button', { name: 'Voltar à agenda', exact: true }).first().click();
  await expect(page.getByRole('alertdialog', { name: 'Sair sem salvar?' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar nesta página' }).click();
  await expect(page.getByLabel('Observações', { exact: true })).toHaveValue('Rascunho sintético não enviado');
  await page.goBack();
  await expect(page.getByRole('alertdialog', { name: 'Sair sem salvar?' })).toBeVisible();
  await page.getByRole('button', { name: 'Descartar e sair' }).click();
  await expect(page).toHaveURL(/\/agenda\?data=2026-10-29&view=weekly/);
  await expect(page.getByRole('textbox', { name: 'Buscar paciente, CPF ou telefone' })).toHaveValue('Pessoa QA');
});

for (const width of [1440, 768, 390]) {
  test(`appointment page renders all sections without overlay at ${width}px`, async ({ page }, testInfo) => {
    await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/agenda/nova?data=2026-10-29');
    await expect(page.getByRole('heading', { name: 'Dados da consulta' })).toBeVisible();
    await expect(page.getByLabel('Buscar paciente', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`appointment-page-${width}.png`), fullPage: true });
    const submit = page.getByRole('button', { name: 'Agendar', exact: true });
    await submit.scrollIntoViewIfNeeded();
    const submitBounds = await submit.boundingBox();
    expect(submitBounds!.y + submitBounds!.height).toBeLessThanOrEqual(width < 1024 ? 840 : 900);
    await page.screenshot({ path: testInfo.outputPath(`appointment-actions-${width}.png`) });
    await page.getByRole('button', { name: 'Agendar', exact: true }).click();
    await expect(page.getByText('Selecione um paciente', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Buscar paciente', { exact: true })).toBeFocused();
  });
}

test('appointment direct edit loads a clinic-scoped record and retains data after a save failure', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false });
  const id = '00000000-0000-4000-9000-000000000010';
  let saveAttempts = 0;
  let failSave = true;
  await page.route('**/rest/v1/agendamentos*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.searchParams.get('id') === `eq.${id}`) {
      expect(url.searchParams.get('clinica_id')).toBe('eq.00000000-0000-4000-8000-000000000002');
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{
        id, clinica_id: '00000000-0000-4000-8000-000000000002',
        paciente_id: '00000000-0000-4000-8000-000000000004', medico_id: '00000000-0000-4000-8000-000000000003',
        data: '2026-10-29', hora_inicio: '09:00:00', hora_fim: '09:30:00', tipo: 'consulta', status: 'agendado',
        observacoes: 'Observação original', updated_at: '2026-10-29T12:00:00Z',
      }]) });
    }
    if (request.method() === 'PATCH') {
      saveAttempts += 1;
      expect(url.searchParams.get('updated_at')).toBe('eq.2026-10-29T12:00:00Z');
      expect(request.postDataJSON()).not.toHaveProperty('status');
      if (!failSave) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id }) });
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Falha sintética ao salvar' }) });
    }
    return route.fallback();
  });
  await page.goto(`/agenda/${id}/editar`);
  await expect(page.getByRole('heading', { name: 'Editar consulta', exact: true })).toBeVisible();
  await expect(page.getByLabel('Observações', { exact: true })).toHaveValue('Observação original');
  await page.getByLabel('Observações', { exact: true }).fill('Alteração sintética');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByRole('button', { name: 'Agendar mesmo assim', exact: true }).click();
  await expect.poll(() => saveAttempts).toBe(1);
  await expect(page.getByLabel('Observações', { exact: true })).toHaveValue('Alteração sintética');
  await expect(page).toHaveURL(new RegExp(`/agenda/${id}/editar`));
  failSave = false;
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByRole('button', { name: 'Agendar mesmo assim', exact: true }).click();
  await expect(page).toHaveURL(/\/agenda\?data=/);
  expect(saveAttempts).toBe(2);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
