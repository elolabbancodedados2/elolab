import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
test.setTimeout(60_000);
const patientId = '00000000-0000-4000-8000-000000000004';
const clinicId = '00000000-0000-4000-8000-000000000002';
const doctorId = '00000000-0000-4000-8000-000000000003';
const id = '00000000-0000-4000-9000-000000000083';
const createUrl = `/exames/nova?paciente=${patientId}`;
const record = {
  id, paciente_id: patientId, clinica_id: clinicId, medico_solicitante_id: doctorId,
  tipo_exame: 'Ultrassom sintético', tipo_categorizado: 'imagem', status: 'realizado',
  resultado: null as string | null, arquivo_resultado: null,
  updated_at: '2026-10-29T12:00:00Z', data_solicitacao: '2026-10-29',
  pacientes: { nome: 'Pessoa Exemplo QA' }, medicos: { nome: 'Marina Ribeiro', crm: '12345' },
};
async function mockRecord(page: Page, data = record) {
  await page.route('**/rest/v1/exames*', route => {
    if (route.request().method() !== 'GET') return route.fallback();
    expect(new URL(route.request().url()).searchParams.get('clinica_id')).toBe(`eq.${clinicId}`);
    return route.fulfill({ json: [data] });
  });
}

for (const width of [1440, 768, 390]) {
  test(`exam request and result are pages with protected drafts at ${width}px`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
    await mockRecord(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(createUrl);
    await expect(page.getByRole('heading', { name: 'Nova Guia de Exames', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`exam-create-${width}.png`) });
    await page.getByLabel('Indicação Clínica *', { exact: true }).fill('Indicação sintética preservada.');
    const footer = page.getByTestId('exam-request-footer');
    await footer.scrollIntoViewIfNeeded();
    expect((await footer.boundingBox())!.y + (await footer.boundingBox())!.height).toBeLessThanOrEqual(width < 1024 ? 840 : 900);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`exam-footer-${width}.png`) });
    await page.getByRole('button', { name: 'Voltar aos exames', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByLabel('Indicação Clínica *', { exact: true })).toHaveValue('Indicação sintética preservada.');
    await page.getByRole('button', { name: 'Voltar aos exames', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL(`/exames?paciente=${patientId}`);
    await page.getByRole('button', { name: 'Ver exame Ultrassom sintético', exact: true }).click();
    await expect(page).toHaveURL(`/exames/${id}`);
    await expect(page.getByRole('heading', { name: 'Detalhes do Exame', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`exam-detail-${width}.png`) });
    await page.locator('#main-content').getByRole('button', { name: 'Lançar resultado', exact: true }).click();
    await expect(page).toHaveURL(`/exames/${id}/resultado`);
    await page.getByLabel('Resultado', { exact: true }).fill('Resultado sintético, sem validade clínica.');
    await page.locator('#main-content').getByRole('button', { name: 'Lançar resultado', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`exam-result-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Voltar aos exames', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByLabel('Resultado', { exact: true })).toHaveValue('Resultado sintético, sem validade clínica.');
  });
}

test('exam request preserves failed save and downloads a PDF after confirmed creation', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  let attempts = 0;
  await page.route('**/rest/v1/exames*', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    attempts += 1;
    const body = route.request().postDataJSON();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ paciente_id: patientId, clinica_id: clinicId, medico_solicitante_id: doctorId, tipo_exame: '40304361 - Hemograma Completo', status: 'solicitado' });
    return route.fulfill(attempts === 1 ? { status: 400, json: { message: 'Falha sintética na guia' } } : { status: 201, json: [{ id, tipo_exame: body[0].tipo_exame }] });
  });
  await page.goto(createUrl);
  await page.getByPlaceholder('Buscar por nome, TUSS ou código livre...').fill('Hemograma Completo');
  await page.getByRole('button', { name: /Hemograma Completo/ }).click();
  await page.getByLabel('Indicação Clínica *', { exact: true }).fill('Indicação sintética.');
  await page.getByRole('button', { name: 'Solicitar (1)', exact: true }).click();
  await expect(page.getByText('Não foi possível concluir a solicitação.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Indicação Clínica *', { exact: true })).toHaveValue('Indicação sintética.');
  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Criar e baixar guia PDF', exact: true }).click();
  const file = await pendingDownload;
  expect((await readFile((await file.path())!)).subarray(0, 5).toString()).toBe('%PDF-');
  await expect(page).toHaveURL(`/exames?paciente=${patientId}`);
  expect(attempts).toBe(2);
});

test('result conflict keeps text; successful retry saves then releases without duplicate result writes', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  const current = { ...record };
  await mockRecord(page, current);
  let resultWrites = 0;
  let statusWrites = 0;
  await page.route('**/rest/v1/exames*', route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const body = route.request().postDataJSON();
    if (body.status) {
      statusWrites += 1;
      expect(body.status).toBe('laudo_disponivel');
      expect(new URL(route.request().url()).searchParams.get('status')).toBe('eq.realizado');
      current.status = body.status;
      return route.fulfill({ json: [{ id }] });
    }
    resultWrites += 1;
    expect(new URL(route.request().url()).searchParams.get('updated_at')).toBe(`eq.${record.updated_at}`);
    if (resultWrites === 1) return route.fulfill({ json: [] });
    current.resultado = body.resultado;
    return route.fulfill({ json: [{ id }] });
  });
  await page.goto(`/exames/${id}/resultado`);
  await page.getByLabel('Resultado', { exact: true }).fill('Resultado sintético revisado.');
  await page.locator('#main-content').getByRole('button', { name: 'Lançar resultado', exact: true }).click();
  await expect(page.getByText('Não foi possível lançar o resultado', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Resultado', { exact: true })).toHaveValue('Resultado sintético revisado.');
  expect(statusWrites).toBe(0);
  // O aviso de erro fica sobre a ação no canto inferior direito; afastar o ponteiro libera o tempo do aviso.
  await page.mouse.move(0, 0);
  await expect(page.getByText('Não foi possível lançar o resultado', { exact: true })).toBeHidden({ timeout: 15_000 });
  await page.locator('#main-content').getByRole('button', { name: 'Lançar resultado', exact: true }).click();
  await expect(page).toHaveURL('/exames');
  expect(resultWrites).toBe(2);
  expect(statusWrites).toBe(1);
});

test('lab and terminal exams cannot bypass their workflow through result URL', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  for (const data of [{ ...record, tipo_categorizado: 'laboratorial' }, { ...record, status: 'cancelado' }]) {
    await mockRecord(page, data);
    await page.goto(`/exames/${id}/resultado`);
    await expect(page.getByRole('heading', { name: 'Lançamento indisponível nesta etapa' })).toBeVisible();
    await expect(page.locator('#main-content').getByRole('button', { name: 'Lançar resultado', exact: true })).toHaveCount(0);
  }
});

test('exam history search returns intact', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  await mockRecord(page);
  await page.goto('/exames?status=realizado');
  const search = page.getByRole('textbox', { name: 'Buscar por paciente ou exame' });
  await search.fill('Ultrassom');
  await page.getByRole('button', { name: 'Ver exame Ultrassom sintético', exact: true }).click();
  await page.getByRole('button', { name: 'Voltar aos exames', exact: true }).click();
  await expect(search).toHaveValue('Ultrassom');
  await expect(page).toHaveURL('/exames?status=realizado');
});

test('saved result remains saved when report release fails', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  const current = { ...record };
  await mockRecord(page, current);
  let resultWrites = 0;
  await page.route('**/rest/v1/exames*', route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const body = route.request().postDataJSON();
    if (body.status) return route.fulfill({ status: 400, json: { message: 'Falha sintética na liberação' } });
    resultWrites += 1;
    current.resultado = body.resultado;
    return route.fulfill({ json: [{ id }] });
  });
  await page.goto(`/exames/${id}/resultado`);
  await page.getByLabel('Resultado', { exact: true }).fill('Resultado salvo antes da liberação.');
  await page.locator('#main-content').getByRole('button', { name: 'Lançar resultado', exact: true }).click();
  await expect(page).toHaveURL('/exames');
  await expect(page.getByText('O resultado foi salvo, mas o laudo ainda não foi liberado.', { exact: true })).toBeVisible();
  expect(resultWrites).toBe(1);
  expect(current.status).toBe('realizado');
  expect(current.resultado).toBe('Resultado salvo antes da liberação.');
});

test('reception cannot enter exam task routes', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'recepcao', platformAdmin: false });
  for (const path of [createUrl, `/exames/${id}`, `/exames/${id}/resultado`]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Acesso Negado' })).toBeVisible();
  }
});

test('exam detail shows loading, recovers read error and explains missing record', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  let reads = 0;
  await page.route('**/rest/v1/exames*', async route => {
    reads += 1;
    if (reads === 1) {
      await gate;
      return route.fulfill({ status: 500, json: { message: 'Falha sintética de leitura' } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto(`/exames/${id}`);
  await expect(page.getByText('Carregando exame…', { exact: true })).toBeVisible();
  release();
  await expect(page.getByRole('heading', { name: 'Não foi possível abrir o exame' })).toBeVisible();
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Exame indisponível' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Voltar aos exames', exact: true })).toBeVisible();
});
