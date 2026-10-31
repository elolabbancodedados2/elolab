import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const patientId = '00000000-0000-4000-8000-000000000004';
const examId = '00000000-0000-4000-9000-000000000181';
const sectorId = '00000000-0000-4000-9000-000000000182';

async function setup(page: Page, info: TestInfo) {
  const fixture = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await page.route('**/rest/v1/laboratorio_setores*', route => route.fulfill({ json: [{ id: sectorId, nome: 'Hematologia QA' }] }));
  await page.route('**/rest/v1/exames*', route => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('clinica_id')).toBe(`eq.${fixture.clinicId}`);
    expect(params.get('paciente_id')).toBe(`eq.${patientId}`);
    return route.fulfill({ json: [{ id: examId, tipo_exame: 'Hemograma QA', paciente_id: patientId, pacientes: { nome: 'Pessoa Exemplo QA' }, tipo_exames_catalog: { setor_id: sectorId } }] });
  });
  return fixture;
}

async function patient(page: Page) {
  await page.getByRole('combobox', { name: 'Paciente *', exact: true }).click();
  await page.getByPlaceholder('Buscar paciente...').fill('Pessoa Exemplo QA');
  await page.getByRole('option', { name: /Pessoa Exemplo QA/ }).click();
}

for (const width of [1440, 768, 390]) {
  test(`collection page at ${width}px has reachable actions and protects draft`, async ({ page }, info) => {
    await setup(page, info);
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/laboratorio/coletas/nova');
    await expect(page.getByRole('heading', { name: 'Nova coleta de amostra', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByLabel('Lote do insumo', { exact: true }).fill('QA-001');
    await page.screenshot({ path: `.qa-artifacts/lab-collection-20261029/new-${width}.png` });
    const save = page.getByRole('button', { name: 'Registrar Coleta', exact: true });
    await save.evaluate(el => el.scrollIntoView({ block: 'center' }));
    expect((await save.boundingBox())!.y + (await save.boundingBox())!.height).toBeLessThanOrEqual(width < 1024 ? 900 : 960);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.qa-artifacts/lab-collection-20261029/footer-${width}.png` });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByLabel('Lote do insumo', { exact: true })).toHaveValue('QA-001');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL('/laboratorio');
  });
}

test('collection validates time, prevents a duplicate exam and preserves sector, author and return filters', async ({ page }, info) => {
  const fixture = await setup(page, info);
  let duplicate = true;
  let fail = true;
  const writes: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/coletas_laboratorio*', route => {
    const params = new URL(route.request().url()).searchParams;
    if (route.request().method() === 'GET') return route.fulfill({ json: params.has('exame_id') && duplicate ? [{ id: 'coleta-existente' }] : [] });
    const body = route.request().postDataJSON();
    writes.push(Array.isArray(body) ? body[0] : body);
    return route.fulfill(fail ? { status: 400, json: { message: 'Falha QA ao salvar coleta' } } : { status: 201, json: null });
  });
  await page.goto('/laboratorio?status=pendente');
  await page.getByRole('button', { name: 'Nova coleta', exact: true }).first().click();
  await expect(page).toHaveURL('/laboratorio/coletas/nova');
  await patient(page);
  await page.getByRole('combobox', { name: 'Pedido de exame', exact: true }).click();
  await page.getByRole('option', { name: /Hemograma QA/ }).click();
  await expect(page.getByRole('combobox', { name: 'Setor responsável' })).toContainText('Hematologia QA');
  await page.getByLabel('Data e hora da coleta', { exact: true }).fill('2099-01-01T10:00');
  const save = page.getByRole('button', { name: 'Registrar Coleta', exact: true });
  await save.click();
  await expect(page.getByText('A coleta não pode ser registrada no futuro.', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.getByLabel('Data e hora da coleta', { exact: true }).fill('2026-01-01T09:00');
  await save.click();
  await expect(page.getByText(/Este pedido já possui uma coleta/)).toBeVisible();
  expect(writes).toHaveLength(0);
  duplicate = false;
  // O aviso anterior fica sobre o botão; o envio pelo teclado não depende do ponteiro.
  await save.press('Enter');
  await expect(page.getByText('Falha QA ao salvar coleta', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Setor responsável' })).toContainText('Hematologia QA');
  fail = false;
  await save.press('Enter');
  await expect(page).toHaveURL('/laboratorio?status=pendente');
  expect(writes).toHaveLength(2);
  expect(writes[1]).toMatchObject({ clinica_id: fixture.clinicId, paciente_id: patientId, exame_id: examId, setor_id: sectorId, status: 'coletado', data_coleta: '2026-01-01T12:00:00.000Z', coletado_por: '00000000-0000-4000-8000-000000000001' });
});

test('collection auxiliary errors recover and finance cannot open the form', async ({ page }, info) => {
  await setup(page, info);
  let fail = true;
  await page.route('**/rest/v1/laboratorio_setores*', route => route.fulfill(fail ? { status: 403, json: { message: 'Falha QA' } } : { json: [] }));
  await page.goto('/laboratorio/coletas/nova');
  await expect(page.getByText('Não foi possível carregar os setores. Atualize a lista antes de registrar a coleta.', { exact: true })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Setor responsável' })).toBeEnabled();
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'financeiro' });
  await page.goto('/laboratorio/coletas/nova');
  await expect(page.getByText('Acesso Negado', { exact: true })).toBeVisible();
});
