import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
test.setTimeout(60_000);
const patientId = '00000000-0000-4000-8000-000000000004';
const doctorId = '00000000-0000-4000-8000-000000000003';
const certificateId = '00000000-0000-4000-9000-000000000081';
const createUrl = `/documentos-clinicos/novo-atestado?paciente=${patientId}`;
const savedCertificate = {
  id: certificateId, clinica_id: '00000000-0000-4000-8000-000000000002',
  paciente_id: patientId, medico_id: doctorId, tipo: 'comparecimento',
  data_emissao: '2026-10-28', motivo: 'Esteve presente das 08:00 às 09:00. Registro sintético',
  cid: 'Z00', observacoes: 'Documento de teste, sem validade clínica.',
  pacientes: { nome: 'Pessoa Exemplo QA', cpf: '000.000.000-00' },
};

async function mockRecord(page: Page, options: { failAudit?: () => boolean; onAudit?: () => void } = {}) {
  await page.route('**/rest/v1/atestados*', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    if (url.searchParams.has('id')) {
      expect(url.searchParams.get('clinica_id')).toBe(`eq.${savedCertificate.clinica_id}`);
      expect(url.searchParams.get('medico_id')).toBe(`eq.${doctorId}`);
    }
    await route.fulfill({ json: [savedCertificate] });
  });
  await page.route('**/rest/v1/rpc/registrar_acesso_documento_clinico', async route => {
    expect(route.request().postDataJSON()).toMatchObject({ p_tipo: 'atestado', p_documento_id: certificateId });
    options.onAudit?.();
    await route.fulfill(options.failAudit?.() ? { status: 403, json: { message: 'Auditoria indisponível no teste' } } : { json: 'audit-qa' });
  });
}

for (const width of [1440, 768, 390]) {
  test(`certificate creation is a page and preserves unsaved text at ${width}px`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(createUrl);
    await expect(page.getByRole('heading', { name: 'Emitir Atestado', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Paciente *', exact: true })).toContainText('Pessoa Exemplo QA');
    await expect(page.getByRole('combobox', { name: 'Médico *', exact: true })).toBeDisabled();
    await page.screenshot({ path: info.outputPath(`certificate-header-${width}.png`) });
    await page.getByLabel('Texto do Atestado / Observações').fill('Texto sintético para conferir o rascunho.');
    await page.screenshot({ path: info.outputPath(`certificate-page-${width}.png`) });
    const submit = page.getByRole('button', { name: 'Emitir atestado', exact: true });
    await submit.scrollIntoViewIfNeeded();
    expect((await submit.boundingBox())!.y + (await submit.boundingBox())!.height).toBeLessThanOrEqual(width < 1024 ? 840 : 900);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`certificate-footer-${width}.png`) });
    await page.getByRole('button', { name: 'Voltar aos atestados', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByLabel('Texto do Atestado / Observações')).toHaveValue('Texto sintético para conferir o rascunho.');
    await page.getByRole('button', { name: 'Voltar aos atestados', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL(`/documentos-clinicos?tab=atestados&paciente=${patientId}`);
  });
}

test('certificate validates attendance times, retains failed save and emits without inherited CID consent', async ({ page }, info) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  let attempts = 0;
  await page.route('**/rest/v1/atestados*', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    attempts += 1;
    expect(route.request().postDataJSON()).toMatchObject({ paciente_id: patientId, medico_id: doctorId, clinica_id: synthetic.clinicId, cid: null, motivo: 'Esteve presente das 08:00 às 09:00.' });
    await route.fulfill(attempts === 1 ? { status: 400, json: { message: 'Falha sintética' } } : { status: 201, body: '' });
  });
  await page.goto(createUrl);
  const submit = page.getByRole('button', { name: 'Emitir atestado', exact: true });
  await submit.click();
  await expect(page.getByText('Informe o horário de início e fim para atestado de comparecimento.', { exact: true })).toBeVisible();
  expect(attempts).toBe(0);
  await page.getByLabel('Horário de Início').fill('08:00');
  await page.getByLabel('Horário de Fim').fill('09:00');
  await submit.click();
  await expect(page.getByText('Erro ao emitir atestado.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Horário de Início')).toHaveValue('08:00');
  await submit.click();
  await expect(page).toHaveURL(`/documentos-clinicos?tab=atestados&paciente=${patientId}`);
  expect(attempts).toBe(2);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('certificate details require audit and duplication resets CID authorization', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  let fail = true;
  let audits = 0;
  await mockRecord(page, { failAudit: () => fail, onAudit: () => { audits += 1; } });
  await page.goto(`/atestados/${certificateId}`);
  await expect(page.getByRole('heading', { name: 'Não foi possível abrir o atestado' })).toBeVisible();
  await expect(page.getByText(savedCertificate.observacoes, { exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Detalhes do Atestado', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`certificate-detail-${width}.png`) });
  }
  await page.getByRole('button', { name: 'Duplicar para nova emissão', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Emitir Atestado', exact: true })).toBeVisible();
  await expect(page.getByLabel('Horário de Início')).toHaveValue('08:00');
  await expect(page.getByLabel('Horário de Fim')).toHaveValue('09:00');
  await expect(page.getByLabel('Motivo / Justificativa')).toHaveValue('Registro sintético');
  await expect(page.getByRole('checkbox', { name: /autorizou expressamente/ })).not.toBeChecked();
  expect(audits).toBe(3);
});

test('templates apply inline using keyboard and retain the new consent requirement', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  await page.route('**/rest/v1/templates_atestado*', route => route.fulfill({ json: [{ id: '00000000-0000-4000-9000-000000000091', nome: 'Modelo sintético', tipo: 'afastamento', dias_afastamento: 3, cid: 'Z00', conteudo: 'Texto do modelo para {{nome_paciente}}.' }] }));
  await page.goto(createUrl);
  await page.getByRole('button', { name: 'Modelos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Modelos de atestado', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Aplicar', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Modelos', exact: true })).toBeFocused();
  await expect(page.getByLabel('Dias de Afastamento')).toHaveValue('3');
  await expect(page.getByRole('checkbox', { name: /autorizou expressamente/ })).not.toBeChecked();
  await expect(page.getByLabel('Texto do Atestado / Observações')).toHaveValue('Texto do modelo para {{nome_paciente}}.');
});

test('certificate print produces a PDF only after a successful audit', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  await mockRecord(page);
  let failPrint = true;
  let printAudits = 0;
  await page.route('**/rest/v1/rpc/registrar_acesso_documento_clinico', async route => {
    const action = route.request().postDataJSON().p_acao;
    if (action === 'impressao') printAudits += 1;
    await route.fulfill(action === 'impressao' && failPrint
      ? { status: 403, json: { message: 'Falha sintética na auditoria de impressão' } }
      : { json: 'audit-qa' });
  });
  await page.goto(`/atestados/${certificateId}`);
  await expect(page.getByRole('heading', { name: 'Detalhes do Atestado', exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.open = url => { document.documentElement.dataset.printUrl = String(url); return null; };
  });
  await page.getByRole('button', { name: 'Imprimir', exact: true }).click();
  await expect(page.getByText('Não foi possível preparar o atestado para impressão.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.printUrl)).toBeUndefined();
  failPrint = false;
  await page.getByRole('button', { name: 'Imprimir', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.printUrl || '')).toMatch(/^blob:/);
  const signature = await page.evaluate(async () => {
    const blob = await (await fetch(document.documentElement.dataset.printUrl!)).blob();
    return blob.slice(0, 5).text();
  });
  expect(signature).toBe('%PDF-');
  expect(printAudits).toBe(2);
});

test('certificate history keeps search on return', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  await page.goto('/documentos-clinicos?tab=atestados');
  const search = page.getByRole('textbox', { name: 'Buscar atestados por nome, CPF ou telefone' });
  await search.fill('Pessoa');
  await page.getByRole('button', { name: 'Novo Atestado', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Emitir Atestado', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar aos atestados', exact: true }).click();
  await expect(search).toHaveValue('Pessoa');
});

test('nursing cannot enter certificate creation or details directly', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'enfermagem', platformAdmin: false });
  for (const url of [createUrl, `/atestados/${certificateId}`]) {
    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'Acesso Negado' })).toBeVisible();
  }
});
