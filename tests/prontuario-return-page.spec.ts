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

test('relatório de alta usa uma página própria e volta ao mesmo contexto clínico', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'admin', prontuarioPopulated: true });
  const reportRecord = {
    ...record,
  };
  await installPageMocks(page, reportRecord);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/prontuarios?paciente=${patient}&prontuario=${recordId}&secao=conduta`);
  await expect(page.getByRole('heading', { name: 'Evolução clínica', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Alta', exact: true }).click();
  await expect(page).toHaveURL(/\/prontuarios\/atendimento\?.*tela=relatorio-alta/);
  await expect(page.getByRole('heading', { name: 'Relatório de alta', exact: true })).toBeVisible();
  await expect(page.getByTestId('clinical-discharge-report')).toBeVisible();
  await expect(page.getByText('Cefaleia recorrente há três dias')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('clinical-discharge-report-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Relatório de alta', exact: true })).toBeVisible();
  await expect(page.getByText('Cefaleia recorrente há três dias')).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: info.outputPath('clinical-discharge-report-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Voltar à evolução' }).click();
  await expect(page).toHaveURL(`/prontuarios/atendimento?paciente=${patient}&prontuario=${recordId}&secao=conduta`);
  await expect(page.getByRole('heading', { name: 'Evolução clínica', exact: true })).toBeVisible();
});

test('biblioteca de protocolos ocupa a página e aplica só sugestões explícitas ao rascunho', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'admin', prontuarioPopulated: true });
  const chartWrites: Record<string, unknown>[] = [];
  await installPageMocks(page, { ...record, id: '00000000-0000-4000-9000-000000000109', assinado: false }, { updates: chartWrites, creates: chartWrites });
  await page.route('**/rest/v1/protocolos_clinicos*', route => route.request().method() === 'GET'
    ? route.fulfill({ json: [{
      id: '00000000-0000-4000-9000-000000000181', clinica_id: clinic, ativo: true,
      nome: 'Cefaleia QA', condicao: 'Cefaleia', descricao: 'Referência sintética para teste.',
      passos: [{ ordem: 1, acao: 'Revisar sinais de alerta.' }],
      medicamentos_sugeridos: [{ nome: 'Medicamento QA', posologia: 'Conferir dose individualmente.' }],
      exames_sugeridos: ['Exame QA'], orientacoes: 'Orientação sintética revisável.', especialidade: 'Clínica geral',
    }] })
    : route.fallback());

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/prontuarios?paciente=${patient}`);
  await page.getByRole('button', { name: 'Novo Atendimento', exact: true }).first().click();
  await expect(page).toHaveURL(`/prontuarios/atendimento?paciente=${patient}&nova=1`);
  await page.getByRole('tab', { name: 'Conduta' }).click();
  await page.getByRole('button', { name: 'Aplicar Protocolo Clínico' }).click();

  await expect(page).toHaveURL(/\/prontuarios\/atendimento\?.*tela=protocolos/);
  await expect(page.getByTestId('clinical-protocols-page')).toBeVisible();
  await expect(page.getByRole('note')).toContainText('não geram pedidos automaticamente');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Buscar protocolos clínicos').fill('Cefaleia');
  await page.getByRole('button', { name: /Cefaleia QA/ }).click();
  await expect(page.getByText('Exames Sugeridos')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aplicar sugestões à evolução' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('clinical-protocols-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: info.outputPath('clinical-protocols-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Protocolos clínicos', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Cefaleia QA/ }).click();
  const applyProtocol = page.getByRole('button', { name: 'Aplicar sugestões à evolução' });
  await expect(applyProtocol).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await applyProtocol.scrollIntoViewIfNeeded();
  const applyBox = await applyProtocol.boundingBox();
  const bottomNavigation = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
  expect(applyBox).not.toBeNull();
  expect(bottomNavigation).not.toBeNull();
  expect(applyBox!.y + applyBox!.height).toBeLessThanOrEqual(bottomNavigation!.y);

  await applyProtocol.click();
  await expect(page).toHaveURL(`/prontuarios/atendimento?paciente=${patient}&nova=1&secao=conduta`);
  await expect(page.getByRole('textbox', { name: 'Conduta' })).toHaveValue(/Orientação sintética revisável/);
  await page.getByRole('tab', { name: 'Prescrição' }).click();
  await expect(page.getByLabel('Medicamento 1: nome')).toHaveValue('Medicamento QA');
  expect(chartWrites).toHaveLength(0);
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


test('alertas de medicamentos abrem em tela propria e retornam a prescricao', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'admin', prontuarioPopulated: true });
  await installPageMocks(page);
  await page.route('**/rest/v1/prescricoes*', route => route.request().method() === 'GET'
    ? route.fulfill({ json: [
      { id: 'prescricao-1', prontuario_id: recordId, medicamento: 'varfarina', dosagem: 'QA', posologia: 'QA', duracao: '', quantidade: '', observacoes: '' },
      { id: 'prescricao-2', prontuario_id: recordId, medicamento: 'aas', dosagem: 'QA', posologia: 'QA', duracao: '', quantidade: '', observacoes: '' },
    ] })
    : route.fallback());

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/prontuarios?paciente=${patient}&prontuario=${recordId}&secao=prescricao`);
  await expect(page.getByTestId('prontuario-workspace')).toBeVisible();
  await expect(page.getByLabel('Medicamento 1: nome')).toHaveValue('varfarina');
  const reviewTrigger = page.getByRole('button', { name: 'Ver todos os 1 alertas de medicamentos' });
  await expect(reviewTrigger).toBeVisible();
  await reviewTrigger.click();

  await expect(page).toHaveURL(/\/prontuarios\/atendimento\?.*tela=alertas-medicamentos/);
  await expect(page.getByTestId('drug-interaction-review-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Alertas de medicamentos', exact: true })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('confirma');
  await expect(page.getByText('Risco aumentado de sangramento')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('drug-interaction-review-mobile-top.png'), fullPage: true, animations: 'disabled' });
  const resultRow = page.getByRole('listitem').filter({ hasText: 'Risco aumentado de sangramento' });
  await resultRow.scrollIntoViewIfNeeded();
  await page.locator('main#main-content').evaluate(element => element.scrollTo(0, element.scrollHeight));
  const resultBox = await resultRow.boundingBox();
  const bottomNavigation = await page.getByRole('navigation', { name: /Navega/ }).last().boundingBox();
  expect(resultBox).not.toBeNull();
  expect(bottomNavigation).not.toBeNull();
  expect(resultBox!.y + resultBox!.height).toBeLessThanOrEqual(bottomNavigation!.y);
  await page.screenshot({ path: info.outputPath('drug-interaction-review-mobile.png'), fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.reload();
  await expect(page.getByTestId('drug-interaction-review-page')).toBeVisible();
  await expect(page.getByText('Risco aumentado de sangramento')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: info.outputPath('drug-interaction-review-desktop.png'), fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole('button', { name: /Voltar/ }).click();
  await expect(page).toHaveURL(`/prontuarios/atendimento?paciente=${patient}&prontuario=${recordId}&secao=prescricao`);
  await expect(page.getByRole('button', { name: 'Ver todos os 1 alertas de medicamentos' })).toBeFocused();
});

test('document sharing in the patient portal uses a contextual page and returns focus to the attachment', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'admin', prontuarioPopulated: true });
  await installPageMocks(page);
  const attachment = {
    id: '00000000-0000-4000-9000-000000000151',
    prontuario_id: recordId,
    nome_arquivo: 'resultado-qa.pdf',
    tipo_arquivo: 'application/pdf',
    tamanho_bytes: 2400,
    url_arquivo: `${recordId}/resultado-qa.pdf`,
    categoria: 'laudo',
    descricao: 'Laudo sintético para validação visual.',
    created_at: '2026-10-29T10:00:00.000Z',
  };
  let published = false;
  const portalCalls: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/anexos_prontuario*', route => route.request().method() === 'GET'
    ? route.fulfill({ json: [attachment] })
    : route.fallback());
  await page.route('**/rest/v1/documentos_portal_paciente*', route => route.request().method() === 'GET'
    ? route.fulfill({ json: published ? [{ anexo_id: attachment.id, publicado: true, validade_ate: '2027-01-10', origem: 'clinica' }] : [] })
    : route.fallback());
  await page.route('**/rest/v1/rpc/gerenciar_documento_portal_paciente*', route => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    portalCalls.push(payload);
    published = payload.p_publicado === true;
    return route.fulfill({ json: { publicado: published, validade_ate: payload.p_validade_ate, origem: payload.p_origem } });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/prontuarios/atendimento?paciente=${patient}&prontuario=${recordId}&secao=anexos`);
  const openPage = page.getByRole('button', { name: 'Disponibilizar no portal para resultado-qa.pdf' });
  await expect(openPage).toBeVisible();
  await openPage.click();

  await expect(page).toHaveURL(/tela=anexo-portal.*anexo=00000000-0000-4000-9000-000000000151/);
  await expect(page.getByTestId('attachment-portal-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Disponibilizar documento no portal', exact: true })).toBeVisible();
  await expect(page.getByText('Pessoa Exemplo QA', { exact: true })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('link privado');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/paciente=.*prontuario=.*secao=anexos/);
  await page.reload();
  await expect(page.getByTestId('attachment-portal-page')).toBeVisible();
  await expect(page.getByLabel('Validade do acesso')).toBeVisible();

  await page.getByLabel('Validade do acesso').fill('2027-01-10');
  const publish = page.getByRole('button', { name: 'Disponibilizar no portal', exact: true });
  await publish.scrollIntoViewIfNeeded();
  await page.locator('main#main-content').evaluate(element => element.scrollTo(0, element.scrollHeight));
  const actionBounds = await publish.boundingBox();
  const mobileNavigation = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
  expect(actionBounds).not.toBeNull();
  expect(mobileNavigation).not.toBeNull();
  expect(actionBounds!.y + actionBounds!.height).toBeLessThanOrEqual(mobileNavigation!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Validade do acesso').evaluate(element => (element as HTMLInputElement).blur());
  await page.locator('main#main-content').evaluate(element => element.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('attachment-portal-mobile.png'), fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('main#main-content').evaluate(element => element.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('attachment-portal-desktop.png'), fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await publish.click();

  await expect(page).toHaveURL(`/prontuarios/atendimento?paciente=${patient}&prontuario=${recordId}&secao=anexos`);
  await expect(page.getByRole('button', { name: 'Revogar documento do portal para resultado-qa.pdf' })).toBeFocused();
  expect(portalCalls).toEqual([{
    p_anexo_id: attachment.id,
    p_publicado: true,
    p_validade_ate: '2027-01-10',
    p_origem: 'clinica',
  }]);
  await expect(page.getByRole('button', { name: 'Revogar documento do portal para resultado-qa.pdf' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('signature review uses a contextual page and returns to the signed chart', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'admin', prontuarioPopulated: true, prontuarioDraft: true });
  await installPageMocks(page, { ...record, assinado: false });
  const signatureCalls: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/assinar_prontuario_verificavel*', route => {
    signatureCalls.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ json: {
      signedAt: '2026-10-30T12:00:00.000Z',
      signerName: 'Dra. Marina Ribeiro',
      signerCRM: '000000',
      hash: 'abcdef1234567890',
      method: 'eletronica_simples',
      verificationCode: 'codigo-qa',
    } });
  });
  await page.route('**/rest/v1/prontuario_assinaturas*', route => route.fulfill({ json: { codigo_verificacao: 'codigo-qa' } }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/prontuarios/atendimento?paciente=${patient}&prontuario=${recordId}&secao=conduta&tela=assinatura-eletronica`);
  await expect(page.getByTestId('clinical-signature-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Assinatura eletr/ })).toBeVisible();
  await expect(page.getByText('Pessoa Exemplo QA', { exact: true })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('ICP-Brasil');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('clinical-signature-mobile.png'), fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const signButton = page.getByRole('button', { name: /Assinar e fechar/ });
  await signButton.scrollIntoViewIfNeeded();
  await page.locator('main#main-content').evaluate(element => element.scrollTo(0, element.scrollHeight));
  const signBounds = await signButton.boundingBox();
  const mobileNavigation = await page.getByRole('navigation', { name: /Navega/ }).last().boundingBox();
  expect(signBounds).not.toBeNull();
  expect(mobileNavigation).not.toBeNull();
  expect(signBounds!.y + signBounds!.height).toBeLessThanOrEqual(mobileNavigation!.y);
  await page.screenshot({ path: info.outputPath('clinical-signature-mobile-action.png'), fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: info.outputPath('clinical-signature-desktop.png'), fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page.getByTestId('clinical-signature-page')).toBeVisible();

  await signButton.click();
  await expect(page).toHaveURL(new RegExp(`/prontuarios/atendimento\\?paciente=${patient}.*prontuario=${recordId}(?:&|$)`));
  await expect(page.locator('#clinical-signature-status')).toBeFocused();
  await expect(page.getByText('Assinado eletronicamente', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(signatureCalls).toEqual([{ p_prontuario_id: recordId }]);
});
