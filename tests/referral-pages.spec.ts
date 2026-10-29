import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
test.setTimeout(60_000);
const patientId = '00000000-0000-4000-8000-000000000004';
const doctorId = '00000000-0000-4000-8000-000000000003';
const clinicId = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-9000-000000000082';
const createUrl = `/documentos-clinicos/novo-encaminhamento?paciente=${patientId}`;
const historyUrl = '/documentos-clinicos?tab=encaminhamentos';
const record = {
  id, paciente_id: patientId, medico_origem_id: doctorId, medico_destino_id: null,
  clinica_id: clinicId, especialidade_destino: 'Cardiologia', urgencia: 'normal',
  motivo: 'Avaliação sintética, sem validade clínica.', exames_realizados: 'Exames sintéticos',
  informacoes_adicionais: 'Informações sintéticas', status: 'pendente',
  data_encaminhamento: '2026-10-29', updated_at: '2026-10-29T12:00:00Z',
  paciente: { nome: 'Pessoa Exemplo QA' }, medico_origem: { nome: 'Marina Ribeiro', crm: '12345' },
};
async function mockDetail(page: Page, data = record) {
  await page.route('**/rest/v1/encaminhamentos*', route => {
    if (route.request().method() !== 'GET') return route.fallback();
    expect(new URL(route.request().url()).searchParams.get('clinica_id')).toBe(`eq.${clinicId}`);
    return route.fulfill({ json: [data] });
  });
  await page.route('**/rest/v1/encaminhamento_status_history*', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/rpc/registrar_acesso_documento_clinico', route => {
    expect(route.request().postDataJSON()).toMatchObject({ p_tipo: 'encaminhamento', p_documento_id: id, p_acao: 'visualizacao' });
    return route.fulfill({ json: 'audit-qa' });
  });
}

for (const width of [1440, 768, 390]) {
  test(`referral creation and detail use pages at ${width}px and protect text`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
    await mockDetail(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(createUrl);
    await expect(page.getByRole('heading', { name: 'Novo Encaminhamento', exact: true })).toBeVisible();
    await expect(page.getByLabel('Motivo do Encaminhamento *', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`referral-create-${width}.png`) });
    await page.getByLabel('Motivo do Encaminhamento *', { exact: true }).fill('Texto sintético para preservar.');
    const submit = page.getByRole('button', { name: 'Criar Encaminhamento', exact: true });
    await submit.scrollIntoViewIfNeeded();
    expect((await submit.boundingBox())!.y + (await submit.boundingBox())!.height).toBeLessThanOrEqual(width < 1024 ? 840 : 900);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`referral-footer-${width}.png`) });
    await page.getByRole('button', { name: 'Voltar aos encaminhamentos', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByLabel('Motivo do Encaminhamento *', { exact: true })).toHaveValue('Texto sintético para preservar.');
    await page.getByRole('button', { name: 'Voltar aos encaminhamentos', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL(historyUrl);
    await page.getByRole('button', { name: 'Ver encaminhamento de Pessoa Exemplo QA', exact: true }).click();
    await expect(page).toHaveURL(`/encaminhamentos/${id}`);
    await expect(page.getByRole('heading', { name: 'Detalhes do Encaminhamento', exact: true })).toBeVisible();
    await expect(page.getByText('Exames sintéticos', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`referral-detail-${width}.png`) });
    await page.getByLabel('Texto da contra-referência').fill('Retorno sintético preservado.');
    await page.getByRole('button', { name: 'Voltar aos encaminhamentos', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByLabel('Texto da contra-referência')).toHaveValue('Retorno sintético preservado.');
  });
}

test('referral creation validates, retains failure and writes once on success', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  let attempts = 0;
  await page.route('**/rest/v1/encaminhamentos*', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    attempts += 1;
    expect(route.request().postDataJSON()).toMatchObject({ paciente_id: patientId, medico_origem_id: doctorId, clinica_id: clinicId, especialidade_destino: 'Cardiologia', status: 'pendente', motivo: 'Avaliação sintética' });
    return route.fulfill(attempts === 1 ? { status: 400, json: { message: 'Falha sintética no salvamento' } } : { status: 201, body: '' });
  });
  await page.goto(createUrl);
  const submit = page.getByRole('button', { name: 'Criar Encaminhamento', exact: true });
  await submit.click();
  await expect(page.getByText('Preencha a especialidade e o motivo do encaminhamento.', { exact: true })).toBeVisible();
  expect(attempts).toBe(0);
  await page.getByRole('combobox', { name: 'Especialidade *', exact: true }).click();
  await page.getByRole('option', { name: 'Cardiologia', exact: true }).click();
  await page.getByLabel('Motivo do Encaminhamento *', { exact: true }).fill('Avaliação sintética');
  await submit.click();
  await expect(page.getByText('Falha sintética no salvamento', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Motivo do Encaminhamento *', { exact: true })).toHaveValue('Avaliação sintética');
  await submit.click();
  await expect(page).toHaveURL(historyUrl);
  expect(attempts).toBe(2);
});

test('counter-referral retains concurrent failure and completes after revision refresh', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  await mockDetail(page);
  let attempts = 0;
  await page.route('**/rest/v1/encaminhamentos*', route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    attempts += 1;
    const url = new URL(route.request().url());
    expect(url.searchParams.get('updated_at')).toBe(`eq.${record.updated_at}`);
    expect(url.searchParams.get('status')).toBe('in.(pendente,em_andamento)');
    expect(route.request().postDataJSON()).toMatchObject({ status: 'concluido', contra_referencia: 'Retorno sintético do especialista.' });
    return route.fulfill({ json: attempts === 1 ? [] : [{ id, updated_at: '2026-10-29T14:00:00Z' }] });
  });
  await page.goto(`/encaminhamentos/${id}`);
  await page.getByLabel('Texto da contra-referência').fill('Retorno sintético do especialista.');
  await page.getByRole('button', { name: 'Salvar e Concluir', exact: true }).click();
  await expect(page.getByText('Erro ao salvar contra-referência', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Texto da contra-referência')).toHaveValue('Retorno sintético do especialista.');
  await page.getByRole('button', { name: 'Atualizar registro', exact: true }).click();
  await expect(page.getByLabel('Texto da contra-referência')).toHaveValue('Retorno sintético do especialista.');
  await page.getByRole('button', { name: 'Salvar e Concluir', exact: true }).click();
  await expect(page.getByText('Contra-referência registrada! Encaminhamento concluído.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar e Concluir', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancelar Encaminhamento', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Voltar aos encaminhamentos', exact: true }).click();
  await expect(page).toHaveURL(historyUrl);
});

test('cancellation requires confirmation and terminal records cannot be changed', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  await mockDetail(page);
  let writes = 0;
  await page.route('**/rest/v1/encaminhamentos*', route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    writes += 1;
    expect(route.request().postDataJSON()).toEqual({ status: 'cancelado' });
    return route.fulfill({ json: [{ id, updated_at: '2026-10-29T15:00:00Z' }] });
  });
  await page.goto(`/encaminhamentos/${id}`);
  await page.getByRole('button', { name: 'Cancelar Encaminhamento', exact: true }).click();
  await page.getByRole('button', { name: 'Manter encaminhamento', exact: true }).click();
  expect(writes).toBe(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancelar Encaminhamento', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar cancelamento', exact: true }).click();
  await expect(page.getByText('Cancelado', { exact: true })).toBeVisible();
  expect(writes).toBe(1);
  await expect(page.getByLabel('Texto da contra-referência')).toHaveCount(0);
});

test('unrelated physician can read but cannot change referral', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  await mockDetail(page, { ...record, medico_origem_id: '00000000-0000-4000-8000-000000000099' });
  await page.goto(`/encaminhamentos/${id}`);
  await expect(page.getByRole('heading', { name: 'Detalhes do Encaminhamento', exact: true })).toBeVisible();
  await expect(page.getByLabel('Texto da contra-referência')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancelar Encaminhamento', exact: true })).toHaveCount(0);
});

test('audit failure conceals document', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  await mockDetail(page);
  await page.route('**/rest/v1/rpc/registrar_acesso_documento_clinico', route => route.fulfill({ status: 403, json: { message: 'Falha sintética' } }));
  await page.goto(`/encaminhamentos/${id}`);
  await expect(page.getByRole('heading', { name: 'Não foi possível abrir o encaminhamento' })).toBeVisible();
  await expect(page.getByText(record.motivo, { exact: true })).toHaveCount(0);
});

test('patient panel opens creation and returns preserving selected patient and search', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  await mockDetail(page);
  await page.goto(historyUrl);
  const search = page.getByRole('textbox', { name: 'Buscar encaminhamentos por paciente, CPF, especialidade ou motivo', exact: true });
  await search.fill('Cardiologia');
  await page.getByRole('button', { name: /^Pessoa Exemplo QA/ }).click();
  await page.getByRole('button', { name: 'Novo Encaminhamento', exact: true }).click();
  await expect(page).toHaveURL(createUrl);
  await expect(page.getByLabel('Motivo do Encaminhamento *', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar aos encaminhamentos', exact: true }).click();
  await expect(search).toHaveValue('Cardiologia');
  await expect(page.getByRole('button', { name: /^Pessoa Exemplo QA/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Ver encaminhamento para Cardiologia', exact: true }).click();
  await expect(page).toHaveURL(`/encaminhamentos/${id}`);
});

test('refresh after another session closes referral preserves unsaved return for recovery', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  await mockDetail(page);
  await page.goto(`/encaminhamentos/${id}`);
  await page.getByLabel('Texto da contra-referência').fill('Retorno ainda não salvo.');
  await mockDetail(page, { ...record, status: 'cancelado' });
  await page.getByRole('button', { name: 'Atualizar registro', exact: true }).click();
  await expect(page.getByLabel('Texto não salvo', { exact: true })).toHaveValue('Retorno ainda não salvo.');
  await expect(page.getByRole('button', { name: 'Salvar e Concluir', exact: true })).toHaveCount(0);
});

test('nursing cannot enter referral creation or details', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'enfermagem', platformAdmin: false });
  for (const path of [createUrl, `/encaminhamentos/${id}`]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Acesso Negado' })).toBeVisible();
  }
});
