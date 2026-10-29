import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
test.setTimeout(60_000);
const patientId = '00000000-0000-4000-8000-000000000004';
const doctorId = '00000000-0000-4000-8000-000000000003';
const prescriptionId = '00000000-0000-4000-9000-000000000099';
const createUrl = `/documentos-clinicos/nova-prescricao?paciente=${patientId}`;
const medication = 'Paracetamol 500 mg — texto sintético para testar a emissão';

for (const width of [1440, 768, 390]) {
  test(`prescription workspace preserves patient context and protects the draft at ${width}px`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(createUrl);
    await expect(page.getByRole('heading', { name: 'Nova Prescrição', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Paciente *', exact: true })).toContainText('Pessoa Exemplo QA');
    await expect(page.getByLabel('Médico Prescritor')).toBeDisabled();
    await expect(page.getByLabel('Médico Prescritor')).toContainText('Marina');
    await page.getByLabel('Medicamentos e Posologia').fill(medication);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`prescription-page-${width}.png`) });
    const save = page.getByRole('button', { name: 'Gerar Receita PDF', exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeEnabled();
    expect((await save.boundingBox())!.y + (await save.boundingBox())!.height).toBeLessThanOrEqual(width < 1024 ? 840 : 900);
    await page.screenshot({ path: info.outputPath(`prescription-actions-${width}.png`) });
    await page.getByRole('button', { name: 'Voltar às prescrições', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByLabel('Medicamentos e Posologia')).toHaveValue(medication);
    await page.getByRole('button', { name: 'Voltar às prescrições', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL(`/documentos-clinicos?paciente=${patientId}`);
  });
}

test('prescription keeps a failed draft, saves once on retry and delivers an audited PDF without a result modal', async ({ page }, info) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  let fail = true;
  let uploads = 0;
  let inserts = 0;
  let downloadsAudited = 0;
  await page.route('**/storage/v1/object/medical-attachments/**', async route => {
    expect(route.request().method()).toBe('POST');
    uploads += 1;
    await route.fulfill(fail ? { status: 400, json: { message: 'Falha sintética de armazenamento' } } : { json: { Key: 'medical-attachments/qa.pdf' } });
  });
  await page.route('**/rest/v1/prescricoes*', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    inserts += 1;
    expect(route.request().postDataJSON()).toMatchObject({ paciente_id: patientId, medico_id: doctorId, clinica_id: synthetic.clinicId, posologia: medication });
    await route.fulfill({ json: { id: prescriptionId } });
  });
  await page.route('**/rest/v1/rpc/registrar_acesso_documento_clinico', async route => {
    expect(route.request().postDataJSON()).toMatchObject({ p_tipo: 'prescricao', p_documento_id: prescriptionId, p_acao: 'exportacao' });
    downloadsAudited += 1;
    await route.fulfill({ json: 'audit-qa' });
  });
  await page.goto(createUrl);
  await page.getByLabel('Medicamentos e Posologia').fill(medication);
  await page.getByRole('button', { name: 'Gerar Receita PDF', exact: true }).click();
  await expect(page.getByText('Não foi possível gerar a receita.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Medicamentos e Posologia')).toHaveValue(medication);
  expect(inserts).toBe(0);
  fail = false;
  await page.getByRole('button', { name: 'Gerar Receita PDF', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Receita Gerada!' })).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(inserts).toBe(1);
  expect(uploads).toBe(2);
  await page.screenshot({ path: info.outputPath('prescription-result.png') });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar Receita PDF', exact: true }).click();
  const download = await downloadPromise;
  expect((await readFile((await download.path())!)).subarray(0, 5).toString()).toBe('%PDF-');
  expect(downloadsAudited).toBe(1);
  await page.getByRole('button', { name: 'Voltar às prescrições', exact: true }).click();
  await expect(page).toHaveURL(`/documentos-clinicos?paciente=${patientId}`);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('critical allergy still blocks issuing and lets the doctor return to the draft', async ({ page }, info) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  await page.goto(createUrl);
  await page.getByLabel('Medicamentos e Posologia').fill('Dipirona 500 mg — teste sintético');
  await page.getByRole('button', { name: 'Gerar Receita PDF', exact: true }).click();
  const alerts = page.getByRole('dialog', { name: /Alertas de Segurança Clínica/ });
  await expect(alerts).toBeVisible();
  await expect(alerts.getByRole('button', { name: 'Confirmar e Gerar Receita' })).toHaveCount(0);
  await alerts.getByRole('button', { name: 'Voltar à Prescrição' }).click();
  await expect(page.getByLabel('Medicamentos e Posologia')).toHaveValue('Dipirona 500 mg — teste sintético');
  expect(synthetic.writes.some(write => /POST.*(?:prescricoes|storage\/v1)/.test(write))).toBe(false);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('opening a new prescription returns to the same history search', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  await page.goto('/documentos-clinicos');
  const search = page.getByPlaceholder('Buscar paciente, CPF ou medicamento...');
  await search.fill('Paracetamol');
  await page.getByRole('button', { name: 'Nova Prescrição', exact: true }).click();
  await expect(page).toHaveURL('/documentos-clinicos/nova-prescricao');
  await expect(page.getByRole('heading', { name: 'Nova Prescrição', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar às prescrições', exact: true }).click();
  await expect(search).toHaveValue('Paracetamol');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('direct prescription route respects the existing professional permissions', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'enfermagem', platformAdmin: false });
  await page.goto(createUrl);
  await expect(page.getByRole('heading', { name: 'Acesso Negado' })).toBeVisible();
  await expect(page.getByLabel('Medicamentos e Posologia')).toHaveCount(0);
});

test('doctor identity failure can be retried without leaving a disabled empty prescriber', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  let fail = true;
  await page.route('**/rest/v1/rpc/buscar_medico_atual', route => fail
    ? route.fulfill({ status: 403, json: { message: 'Falha sintética de vínculo' } })
    : route.fulfill({ json: [{ id: doctorId, nome: 'Médico QA', ativo: true }] }));
  await page.goto(createUrl);
  await expect(page.getByRole('heading', { name: 'Não foi possível confirmar seu vínculo médico' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Gerar Receita PDF', exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByLabel('Médico Prescritor')).toContainText('Marina');
  await expect(page.getByLabel('Médico Prescritor')).toBeDisabled();
  await page.getByLabel('Medicamentos e Posologia').fill(medication);
  await expect(page.getByRole('button', { name: 'Gerar Receita PDF', exact: true })).toBeEnabled();
});
