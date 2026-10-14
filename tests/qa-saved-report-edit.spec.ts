import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('atualiza filtros do relatório próprio sem duplicar o agendamento', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin });
  const report = {
    id: '00000000-0000-4000-8000-000000000921',
    clinica_id: synthetic.clinicId,
    user_id: synthetic.userId,
    nome: 'Receita mensal QA',
    descricao: 'Resumo mensal',
    dataset: 'lancamentos',
    config: { dataInicio: '2026-10-01', dataFim: '2026-10-14', statusFilter: 'todos', limite: 300 },
    frequencia: 'semanal',
    dia_semana: 1,
    dia_mes: null,
    hora: '08:30:00',
    destinatarios: ['financeiro@qa.invalid'],
    formato: 'csv',
    ativo: false,
    proxima_execucao: null,
    ultima_execucao: null,
    created_at: '2026-10-01T12:00:00.000Z',
    updated_at: '2026-10-14T10:30:00.000Z',
  };
  const writes: Array<{ method: string; url: string; body: unknown }> = [];
  await page.route('http://127.0.0.1:54321/rest/v1/relatorios_salvos*', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([report]) });
      return;
    }
    writes.push({ method: route.request().method(), url: route.request().url(), body: route.request().postDataJSON() });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: report.id }]) });
  });

  await page.goto('/relatorios/salvos');
  await page.getByRole('button', { name: 'Abrir filtros do relatório Receita mensal QA' }).click();
  await page.getByRole('button', { name: 'Atualizar salvo' }).click();
  await expect(page.getByRole('textbox', { name: 'Nome do relatorio salvo' })).toHaveValue('Receita mensal QA');
  await page.getByText('Semanal', { exact: true }).last().click();
  await page.getByRole('option', { name: 'Apenas favoritar (sem envio)' }).click();
  await page.getByRole('button', { name: 'Salvar alterações' }).click();

  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].method).toBe('PATCH');
  const filters = new URL(writes[0].url).searchParams;
  expect(filters.get('id')).toBe(`eq.${report.id}`);
  expect(filters.get('user_id')).toBe(`eq.${synthetic.userId}`);
  expect(filters.get('clinica_id')).toBe(`eq.${synthetic.clinicId}`);
  expect(writes[0].body).toMatchObject({
    user_id: synthetic.userId, clinica_id: synthetic.clinicId, frequencia: null,
    dia_semana: null, dia_mes: null, hora: null, proxima_execucao: null, ativo: false,
  });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('agenda somente com canal ativo, destinatario da lista e confirmacao de Brasilia', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin });
  const writes: Array<{ method: string; body: unknown }> = [];
  const recipient = { id: '00000000-0000-4000-8000-000000000951', nome: 'Financeiro QA', email: 'financeiro@qa.invalid' };
  const preflights: unknown[] = [];

  await page.route('http://127.0.0.1:54321/functions/v1/scheduled-reports-runner', async route => {
    const body = route.request().postDataJSON() as { action?: string; dataset?: string };
    preflights.push(body);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ emailConfigured: true, timezone: 'America/Sao_Paulo', recipients: [recipient] }) });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/relatorios_salvos*', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    writes.push({ method: route.request().method(), body: route.request().postDataJSON() });
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: '00000000-0000-4000-8000-000000000952' }]) });
  });

  await page.goto('/relatorios');
  await page.getByRole('button', { name: 'Salvar / Agendar' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Nome do relatorio salvo' }).fill('Relatório agendado QA');
  await dialog.getByRole('combobox', { name: 'Frequencia de envio' }).click();
  await page.getByRole('option', { name: 'Diária' }).click();

  await expect.poll(() => preflights.length).toBeGreaterThan(0);
  expect(preflights[0]).toMatchObject({ action: 'preflight', dataset: 'lancamentos' });
  await expect(dialog.getByRole('checkbox', { name: 'Destinatário Financeiro QA (financeiro@qa.invalid)' })).toBeVisible();
  const save = dialog.getByRole('button', { name: 'Salvar' });
  await dialog.getByRole('checkbox', { name: 'Destinatário Financeiro QA (financeiro@qa.invalid)' }).check();
  await expect(save).toBeDisabled();
  await dialog.getByRole('checkbox', { name: 'Confirmo o fuso horário de Brasília' }).check();
  await expect(save).toBeEnabled();
  await save.click();

  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].method).toBe('POST');
  expect(writes[0].body).toMatchObject({
    dataset: 'lancamentos', frequencia: 'diaria', destinatarios: [recipient.email], hora: '08:00:00',
  });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
test('bloqueia agenda quando o canal de e-mail nao esta ativo', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin });
  let writes = 0;
  await page.route('http://127.0.0.1:54321/functions/v1/scheduled-reports-runner', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ emailConfigured: false, timezone: 'America/Sao_Paulo', recipients: [{ id: synthetic.userId, nome: 'Conta QA', email: 'qa@example.invalid' }] }) });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/relatorios_salvos*', async route => {
    if (route.request().method() !== 'GET') writes++;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/relatorios');
  await page.getByRole('button', { name: 'Salvar / Agendar' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Nome do relatorio salvo' }).fill('Canal indisponível QA');
  await dialog.getByRole('combobox', { name: 'Frequencia de envio' }).click();
  await page.getByRole('option', { name: 'Diária' }).click();
  await expect(dialog.getByRole('alert')).toContainText('canal de e-mail está sem configuração válida ou indisponível');
  await expect(dialog.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  expect(writes).toBe(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});