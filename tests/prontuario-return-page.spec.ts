import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const clinic = '00000000-0000-4000-8000-000000000002';
const patient = '00000000-0000-4000-8000-000000000004';
const doctor = '00000000-0000-4000-8000-000000000003';
const recordId = '00000000-0000-4000-9000-000000000101';
const record = {
  id: recordId,
  clinica_id: clinic,
  paciente_id: patient,
  medico_id: doctor,
  data: '2026-10-29',
  assinado: true,
  pacientes: { nome: 'Pessoa Exemplo QA', nome_social: null },
  medicos: { nome: 'Dra. Marina Ribeiro', crm: '000000' },
};

async function installPageMocks(page: Page, pageRecord = record, chartChanges: { updates?: Record<string, unknown>[]; creates?: Record<string, unknown>[] } = {}) {
  const writes: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/registrar_prontuario_acesso*', route => route.fulfill({ json: 'synthetic-access-id' }));
  await page.route('**/rest/v1/rpc/registrar_visualizacao_historico_paciente*', route => route.fulfill({ json: 1 }));
  await page.route('**/rest/v1/rpc/substituir_prescricoes_do_prontuario*', route => route.fulfill({ json: null }));
  await page.route('**/rest/v1/prontuarios*', async route => {
    if (route.request().method() === 'PATCH') {
      chartChanges.updates?.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ json: { id: recordId, updated_at: '2026-10-30T12:00:00.000Z' } });
      return;
    }
    if (route.request().method() === 'POST') {
      chartChanges.creates?.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 201, json: { ...pageRecord, updated_at: '2026-10-30T12:00:00.000Z' } });
      return;
    }
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const requestedId = url.searchParams.get('id')?.replace(/^eq\./, '');
    if (!requestedId) return route.fallback();
    await route.fulfill({ json: requestedId === pageRecord.id ? pageRecord : null });
  });
  await page.route('**/rest/v1/pacientes*', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const row = { id: patient, clinica_id: clinic, nome: record.pacientes.nome, nome_social: null };
    const wantsObject = route.request().headers().accept?.includes('application/vnd.pgrst.object+json');
    await route.fulfill({ json: wantsObject ? row : [row] });
  });
  await page.route('**/rest/v1/medicos*', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const row = { id: doctor, clinica_id: clinic, nome: record.medicos.nome, crm: record.medicos.crm, ativo: true };
    const wantsObject = route.request().headers().accept?.includes('application/vnd.pgrst.object+json');
    await route.fulfill({ json: wantsObject ? row : [row] });
  });
  await page.route('**/rest/v1/retornos*', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    if (route.request().method() === 'POST') {
      writes.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({ status: 201, json: [{ id: 'retorno-sintetico' }] });
    }
    return route.fallback();
  });
  return writes;
}

async function selectResponsibleDoctor(page: Page) {
  const select = page.getByLabel('Médico responsável pela evolução *');
  await select.click();
  await select.press('ArrowDown');
  await select.press('Enter');
  await select.press('Escape');
  await expect(page.getByRole('option', { name: 'Dra. Marina Ribeiro' })).toHaveCount(0);
}

test('retorno clínico abre em página, grava contexto do prontuário e volta ao paciente', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'admin', prontuarioPopulated: true });
  const writes = await installPageMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/prontuarios/${recordId}/retornos/novo`);

  await expect(page.getByRole('heading', { name: 'Agendar retorno clínico', exact: true })).toBeVisible();
  await expect(page.getByText('Pessoa Exemplo QA', { exact: true })).toBeVisible();
  await expect(page.getByText('Dra. Marina Ribeiro', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const mobileAction = await page.getByRole('button', { name: 'Agendar retorno', exact: true }).boundingBox();
  const mobileNavigation = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
  expect(mobileAction).not.toBeNull();
  expect(mobileNavigation).not.toBeNull();
  expect(mobileAction!.y + mobileAction!.height).toBeLessThanOrEqual(mobileNavigation!.y);
  await page.screenshot({ path: info.outputPath('clinical-return-mobile-context.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: info.outputPath('clinical-return-desktop-context.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '30 dias', exact: true }).click();
  await page.getByLabel('Motivo do retorno').fill('Reavaliar resposta ao tratamento');
  await page.getByLabel('Observações').fill('Retorno solicitado no atendimento sintético.');
  await page.getByRole('button', { name: 'Agendar retorno', exact: true }).click();

  await expect(page).toHaveURL(`/prontuarios/atendimento?paciente=${patient}&prontuario=${recordId}&secao=conduta`);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    paciente_id: patient,
    prontuario_id: recordId,
    medico_id: doctor,
    clinica_id: clinic,
    tipo_retorno: 'acompanhamento',
    motivo: 'Reavaliar resposta ao tratamento',
    observacoes: 'Retorno solicitado no atendimento sintético.',
  });
  expect(writes[0].data_retorno_prevista).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('retorno clínico valida registro ausente e mantém recuperação para prontuários', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'admin', prontuarioPopulated: true });
  await installPageMocks(page);
  await page.goto('/prontuarios/00000000-0000-4000-9000-000000000999/retornos/novo');

  await expect(page.getByRole('alert')).toContainText('não está disponível');
  await expect(page.getByRole('button', { name: 'Voltar aos prontuários' })).toBeVisible();
});

test('retorno sem evolução fica vinculado ao paciente e ao profissional validados', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'admin' });
  const writes = await installPageMocks(page);
  await page.goto(`/prontuarios/retornos/novo?paciente=${patient}&medico=${doctor}`);

  await expect(page.getByRole('heading', { name: 'Agendar retorno clínico', exact: true })).toBeVisible();
  await expect(page.getByText('Solicitação clínica', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '15 dias', exact: true }).click();
  await page.getByRole('button', { name: 'Agendar retorno', exact: true }).click();

  await expect(page).toHaveURL(`/prontuarios?paciente=${patient}`);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    paciente_id: patient,
    prontuario_id: null,
    medico_id: doctor,
    clinica_id: clinic,
  });
});

test('salva a evolução alterada como rascunho antes de abrir o agendamento', async ({ page }, info) => {
  const newRecordId = '00000000-0000-4000-9000-000000000102';
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'admin', prontuarioPopulated: true });
  const chartCreates: Record<string, unknown>[] = [];
  const writes = await installPageMocks(page, { ...record, id: newRecordId, assinado: false }, { creates: chartCreates });
  await page.goto(`/prontuarios?paciente=${patient}`);
  await page.getByRole('button', { name: 'Novo Atendimento', exact: true }).first().click();
  await expect(page).toHaveURL(`/prontuarios/atendimento?paciente=${patient}&nova=1`);
  await expect(page.getByTestId('prontuario-workspace')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await selectResponsibleDoctor(page);
  await page.getByLabel('Queixa principal').fill('Queixa sintética revisada antes do retorno');
  await page.getByRole('button', { name: /Agendar Retorno/ }).click();

  await expect(page).toHaveURL(`/prontuarios/${newRecordId}/retornos/novo?medico=${doctor}`);
  expect(chartCreates).toHaveLength(1);
  expect(chartCreates[0]).toMatchObject({
    paciente_id: patient,
    medico_id: doctor,
    queixa_principal: 'Queixa sintética revisada antes do retorno',
  });
  await page.getByRole('button', { name: '7 dias', exact: true }).click();
  await page.getByRole('button', { name: 'Agendar retorno', exact: true }).click();
  await expect(page).toHaveURL(`/prontuarios?paciente=${patient}`);
  expect(writes).toHaveLength(1);
  expect(writes[0].prontuario_id).toBe(newRecordId);
});

test('o prontuário encaminha o agendamento sem abrir diálogo e bloqueia navegação com gravação pendente', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'admin', prontuarioPopulated: true });
  await installPageMocks(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/prontuarios?paciente=${patient}&prontuario=${recordId}&secao=conduta`);

  await expect(page.getByRole('heading', { name: 'Evolução clínica', exact: true })).toBeVisible();
  await expect(page).toHaveURL(`/prontuarios/atendimento?paciente=${patient}&prontuario=${recordId}&secao=conduta`);
  await page.getByRole('button', { name: /Agendar Retorno/ }).click();
  await expect(page).toHaveURL(`/prontuarios/${recordId}/retornos/novo?medico=${doctor}`);
  await expect(page.getByRole('heading', { name: 'Agendar retorno clínico', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('evolução é criada na página dedicada e salva com paciente e autoria corretos', async ({ page }, info) => {
  const newRecordId = '00000000-0000-4000-9000-000000000103';
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'admin', prontuarioPopulated: true });
  const creates: Record<string, unknown>[] = [];
  await installPageMocks(page, { ...record, id: newRecordId, assinado: false }, { creates });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/prontuarios?paciente=${patient}`);
  await page.getByRole('button', { name: 'Novo Atendimento', exact: true }).first().click();

  await expect(page).toHaveURL(`/prontuarios/atendimento?paciente=${patient}&nova=1`);
  await expect(page.getByRole('heading', { name: 'Nova evolução', exact: true })).toBeVisible();
  await expect(page.getByText('Pessoa Exemplo QA', { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId('prontuario-workspace')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Nova evolução', exact: true })).toBeVisible();
  await expect(page.getByTestId('prontuario-workspace')).toBeVisible();

  await expect(page.getByRole('button', { name: 'Salvar Prontuário', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('new-clinical-note-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await selectResponsibleDoctor(page);
  await page.getByLabel('Queixa principal').fill('Dor de cabeça sintética em avaliação');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: info.outputPath('new-clinical-note-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Salvar Prontuário', exact: true }).click();

  await expect(page).toHaveURL(`/prontuarios?paciente=${patient}`);
  expect(creates).toHaveLength(1);
  expect(creates[0]).toMatchObject({
    paciente_id: patient,
    medico_id: doctor,
    queixa_principal: 'Dor de cabeça sintética em avaliação',
    clinica_id: clinic,
  });
});

test('protege a evolução não salva ao voltar e preserva o texto ao cancelar o descarte', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'admin', prontuarioPopulated: true });
  const creates: Record<string, unknown>[] = [];
  await installPageMocks(page, { ...record, assinado: false }, { creates });
  await page.goto(`/prontuarios?paciente=${patient}`);
  await page.getByRole('button', { name: 'Novo Atendimento', exact: true }).first().click();
  await expect(page.getByTestId('prontuario-workspace')).toBeVisible();
  await selectResponsibleDoctor(page);
  await page.getByLabel('Queixa principal').fill('Texto clínico que precisa permanecer');

  await page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Agenda', exact: true }).click();
  const discardDialog = page.getByRole('alertdialog');
  await expect(discardDialog).toContainText('Alterações não salvas');
  await discardDialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page).toHaveURL(`/prontuarios/atendimento?paciente=${patient}&nova=1`);
  await expect(page.getByLabel('Queixa principal')).toHaveValue('Texto clínico que precisa permanecer');

  await page.getByRole('button', { name: 'Voltar aos prontuários' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Descartar', exact: true }).click();
  await expect(page).toHaveURL(`/prontuarios?paciente=${patient}`);
  expect(creates).toHaveLength(0);
});
