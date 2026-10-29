import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const id = '00000000-0000-4000-9000-000000000191';
const patientId = '00000000-0000-4000-8000-000000000004';
const path = `/laboratorio/coletas/${id}/resultados`;

async function setup(page: Page, info: TestInfo) {
  const fixture = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  const state = { status: 'em_analise', missing: false, fail: false, resultsFail: false, saveFail: false, writes: [] as Record<string, unknown>[], results: [] as Record<string, unknown>[] };
  await page.route('**/rest/v1/coletas_laboratorio*', route => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('clinica_id')).toBe(`eq.${fixture.clinicId}`);
    if (params.has('id')) expect(params.get('id')).toBe(`eq.${id}`);
    return route.fulfill(state.fail ? { status: 403, json: { message: 'Falha QA' } } : { json: state.missing ? [] : [{ id, paciente_id: patientId, codigo_amostra: 'AM-QA-191', status: state.status, tipo_amostra: 'sangue', created_at: new Date().toISOString(), pacientes: { nome: 'Pessoa Exemplo QA' }, exames: { tipo_exame: 'Hemograma', tipo_exames_catalog: { nome: 'Hemoglobina', unidade_padrao: 'g/dL', referencia_min: 12, referencia_max: 16, metodo_padrao: 'Método QA' } } }] });
  });
  await page.route('**/rest/v1/resultados_laboratorio*', route => {
    if (route.request().method() === 'GET') {
      const params = new URL(route.request().url()).searchParams;
      expect(params.get('coleta_id')).toBe(`eq.${id}`);
      expect(params.get('clinica_id')).toBe(`eq.${fixture.clinicId}`);
      return route.fulfill(state.resultsFail ? { status: 403, json: { message: 'Falha QA' } } : { json: state.results });
    }
    const body = route.request().postDataJSON();
    state.writes.push(Array.isArray(body) ? body[0] : body);
    if (state.saveFail) return route.fulfill({ status: 400, json: { message: 'Falha QA de registro' } });
    state.results = [...state.results, { ...state.writes.at(-1), id: 'resultado-qa' }];
    return route.fulfill({ status: 201, json: null });
  });
  return { fixture, state };
}

for (const width of [1440, 768, 390]) {
  test(`result workspace at ${width}px keeps sample context and protects draft`, async ({ page }, info) => {
    const { state } = await setup(page, info);
    state.results = [{ id: 'existing', parametro: 'Hemoglobina', resultado: '8', unidade: 'g/dL', valor_referencia_min: 12, valor_referencia_max: 16, critico: true }];
    await page.setViewportSize({ width, height: 960 });
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Resultados da amostra', exact: true })).toBeVisible();
    await expect(page.getByText('AM-QA-191', { exact: true })).toBeVisible();
    await expect(page.getByText('Fora da referência', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: `.qa-artifacts/lab-results-20261029/results-${width}.png` });
    await page.getByLabel('Parâmetro *', { exact: true }).fill('Ferritina');
    const save = page.getByRole('button', { name: 'Adicionar', exact: true });
    await save.evaluate(el => el.scrollIntoView({ block: 'center' }));
    expect((await save.boundingBox())!.y + (await save.boundingBox())!.height).toBeLessThanOrEqual(width < 1024 ? 900 : 960);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.qa-artifacts/lab-results-20261029/footer-${width}.png` });
    await page.getByRole('link', { name: 'Voltar ao laboratório', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByLabel('Parâmetro *', { exact: true })).toHaveValue('Ferritina');
    await page.getByRole('link', { name: 'Voltar ao laboratório', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL('/laboratorio');
  });
}

test('results validate references, reread sample state, recover failures and save within the clinic', async ({ page }, info) => {
  const { fixture, state } = await setup(page, info);
  await page.goto(path);
  await page.getByLabel('Parâmetro *', { exact: true }).fill('Hemoglobina QA');
  await page.getByLabel('Resultado *', { exact: true }).fill('14,5');
  await page.getByRole('button', { name: 'Usar perfil do exame', exact: true }).click();
  await expect(page.getByLabel('Ref. Mínimo', { exact: true })).toHaveValue('12');
  await expect(page.getByLabel('Método', { exact: true })).toHaveValue('Método QA');
  await page.getByLabel('Ref. Mínimo', { exact: true }).fill('20');
  const save = page.getByRole('button', { name: 'Adicionar', exact: true });
  await save.click();
  await expect(page.getByText('O valor de referência mínimo não pode ser maior que o máximo.', { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await page.getByLabel('Ref. Mínimo', { exact: true }).fill('12,5');
  state.status = 'validado';
  await save.click();
  await expect(page.getByText(/Só é possível registrar resultado em uma amostra coletada/)).toBeVisible();
  expect(state.writes).toHaveLength(0);
  state.status = 'em_analise'; state.saveFail = true;
  await save.click();
  await expect(page.getByText('Falha QA de registro', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Resultado *', { exact: true })).toHaveValue('14,5');
  state.saveFail = false;
  await save.click();
  await expect(page.getByLabel('Resultado *', { exact: true })).toHaveValue('');
  await expect(page.getByText('Hemoglobina QA', { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1]).toMatchObject({ clinica_id: fixture.clinicId, paciente_id: patientId, coleta_id: id, valor_referencia_min: 12.5, valor_referencia_max: 16 });
});

test('results handle failed reads, locked sample, missing sample and denied access', async ({ page }, info) => {
  const { state } = await setup(page, info);
  state.resultsFail = true;
  await page.goto(path);
  await expect(page.getByText('Não foi possível carregar os resultados desta amostra', { exact: true })).toBeVisible();
  state.resultsFail = false;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByText('Nenhum resultado cadastrado', { exact: true })).toBeVisible();
  state.status = 'liberado';
  await page.reload();
  await expect(page.getByText(/A amostra não está mais aberta para lançamento/)).toBeVisible();
  await expect(page.getByRole('form', { name: 'Adicionar resultado', exact: true })).toHaveCount(0);
  state.missing = true;
  await page.reload();
  await expect(page.getByText('Amostra não encontrada nesta clínica.', { exact: true })).toBeVisible();
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'financeiro' });
  await page.goto(path);
  await expect(page.getByText('Acesso Negado', { exact: true })).toBeVisible();
});
