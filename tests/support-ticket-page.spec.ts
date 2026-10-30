import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('abrir chamado usa página própria, valida o contexto e volta com filtros e página preservados', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  const writes: Array<{ url: string; payload: unknown }> = [];
  const fixtureTickets = [{
    id: 'ticket-sintetico-1',
    clinica_id: synthetic.clinicId,
    solicitante_id: synthetic.userId,
    categoria: 'duvida',
    titulo: 'Chamado sintético',
    descricao: 'Chamado sintético para validar a paginação da fila.',
    prioridade: 'normal',
    status: 'aberto',
    sla_limite: '2099-01-01T00:00:00Z',
    primeira_resposta_em: null,
    created_at: new Date(Date.UTC(2026, 0, 1)).toISOString(),
  }];

  await page.route('http://127.0.0.1:54321/rest/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/rest/v1/support_tickets' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(fixtureTickets),
      });
      return;
    }
    if (url.pathname === '/rest/v1/support_tickets' && request.method() === 'POST') {
      writes.push({ url: request.url(), payload: request.postDataJSON() });
      await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.fallback();
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/suporte');
  await expect(page.getByRole('heading', { name: 'Central de Suporte' })).toBeVisible();

  const searchApplied = page.waitForRequest(request => request.url().includes('/rest/v1/support_tickets') && request.url().includes('or='));
  await page.getByRole('textbox', { name: 'Buscar no título ou na descrição de todos os chamados' }).fill('Impressora');
  await searchApplied;
  await page.getByRole('combobox', { name: 'Filtrar chamados por status' }).click();
  await page.getByRole('option', { name: 'Aberto' }).click();
  await page.getByRole('combobox', { name: 'Filtrar chamados por prioridade' }).click();
  const filtersApplied = page.waitForRequest(request => request.url().includes('/rest/v1/support_tickets')
    && request.url().includes('status=eq.aberto') && request.url().includes('prioridade=eq.alta'));
  await page.getByRole('option', { name: 'Alta' }).click();
  await filtersApplied;
  await page.getByRole('button', { name: 'Abrir chamado' }).click();

  await expect(page).toHaveURL(/\/suporte\/novo$/);
  await expect(page.getByRole('heading', { name: 'Abrir chamado' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('support-new-ticket-desktop.png'), fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const submit = page.getByRole('button', { name: 'Enviar chamado' });
  await submit.scrollIntoViewIfNeeded();
  const cancel = page.getByRole('button', { name: 'Cancelar' });
  const mobileNavigation = page.getByRole('navigation', { name: 'Navegação principal' });
  const [cancelBox, submitBox, navBox] = await Promise.all([cancel.boundingBox(), submit.boundingBox(), mobileNavigation.boundingBox()]);
  expect(cancelBox && submitBox && navBox && cancelBox.y + cancelBox.height <= navBox.y && submitBox.y + submitBox.height <= navBox.y,
    JSON.stringify({ cancelBox, submitBox, navBox })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('support-new-ticket-mobile.png'), fullPage: true, animations: 'disabled' });

  await page.getByLabel('Resumo do problema').fill('Impressora sem conexão');
  await page.getByLabel('Descrição').fill('A impressora da recepção não conecta após reiniciar o equipamento.');
  await page.getByRole('button', { name: 'Enviar chamado' }).click();
  await expect(page).toHaveURL(/\/suporte$/);
  await expect(page.getByRole('heading', { name: 'Central de Suporte' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Buscar no título ou na descrição de todos os chamados' })).toHaveValue('Impressora');
  await expect(page.getByRole('combobox', { name: 'Filtrar chamados por status' })).toContainText('Aberto');
  await expect(page.getByRole('combobox', { name: 'Filtrar chamados por prioridade' })).toContainText('Alta');

  expect(writes).toHaveLength(1);
  expect(writes[0].payload).toEqual({
    titulo: 'Impressora sem conexão',
    descricao: 'A impressora da recepção não conecta após reiniciar o equipamento.',
    prioridade: 'normal',
    categoria: 'duvida',
    clinica_id: synthetic.clinicId,
    solicitante_id: synthetic.userId,
  });
  expect(new URL(writes[0].url).origin).toBe('http://127.0.0.1:54321');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
