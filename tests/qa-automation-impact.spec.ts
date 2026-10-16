import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('pré-visualiza o alcance e registra autor antes de desativar automação', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  const settingsWrites: Array<{ url: URL; body: unknown }> = [];
  const auditWrites: Array<Record<string, unknown>> = [];
  let previewUrl: URL | null = null;

  await page.route('http://127.0.0.1:54321/rest/v1/automation_settings*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
        id: '00000000-0000-4000-8000-000000000451', clinica_id: synthetic.clinicId,
        chave: 'lembrete_consulta_24h', valor: {}, descricao: null, ativo: true, updated_at: new Date().toISOString(),
      }]) });
      return;
    }
    if (request.method() === 'PATCH') {
      settingsWrites.push({ url, body: request.postDataJSON() });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: '00000000-0000-4000-8000-000000000451' }]) });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });

  await page.route('http://127.0.0.1:54321/rest/v1/notification_queue*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'HEAD') {
      previewUrl = url;
      await route.fulfill({ status: 200, headers: { 'content-range': '0-3/4', 'access-control-expose-headers': 'content-range' }, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route('http://127.0.0.1:54321/rest/v1/audit_log*', async (route) => {
    if (route.request().method() === 'POST') {
      auditWrites.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/automacoes');
  await page.getByRole('switch', { name: 'Desativar Lembrete de Consulta (24h)' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(page.getByText(/4 envios.*clínica.*não serão alterados/)).toBeVisible();
  expect(previewUrl?.searchParams.get('clinica_id')).toBe(`eq.${synthetic.clinicId}`);
  expect(previewUrl?.searchParams.get('status')).toContain('pendente');

  await page.getByRole('button', { name: 'Desativar automação' }).click();
  await expect.poll(() => settingsWrites.length).toBe(1);
  await expect.poll(() => auditWrites.length).toBe(1);
  expect(settingsWrites[0].body).toEqual({ ativo: false });
  expect(settingsWrites[0].url.searchParams.get('clinica_id')).toBe(`eq.${synthetic.clinicId}`);
  expect(auditWrites[0]).toMatchObject({
    action: 'update', collection: 'automation_settings', record_id: '00000000-0000-4000-8000-000000000451',
    user_id: synthetic.userId,
    changes: [{ field: 'ativo', oldValue: true, newValue: false }],
  });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('bloqueia a mudança quando não consegue calcular a prévia', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  let settingsWrites = 0;
  await page.route('http://127.0.0.1:54321/rest/v1/automation_settings*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
        id: '00000000-0000-4000-8000-000000000452', clinica_id: '00000000-0000-4000-8000-000000000002',
        chave: 'lembrete_consulta_24h', valor: {}, descricao: null, ativo: true, updated_at: new Date().toISOString(),
      }]) });
      return;
    }
    if (route.request().method() === 'PATCH' || route.request().method() === 'POST') settingsWrites++;
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/notification_queue*', async (route) => {
    if (route.request().method() === 'HEAD') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/automacoes');
  await page.getByRole('switch', { name: 'Desativar Lembrete de Consulta (24h)' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(page.getByText(/Não foi possível confirmar quantos envios/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Desativar automação' })).toBeDisabled();
  expect(settingsWrites).toBe(0);
});
