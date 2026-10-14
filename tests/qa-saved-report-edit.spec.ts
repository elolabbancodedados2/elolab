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
