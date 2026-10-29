import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const id = '00000000-0000-4000-9000-000000000201';
const newId = '00000000-0000-4000-9000-000000000202';
const path = `/mapa-coleta/${id}`;
async function setup(page: Page, info: TestInfo) {
  const fixture = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  const state = { status: 'coletado', missing: false, historyFail: false, saveFail: false, writes: [] as Record<string, unknown>[], events: [] as Record<string, unknown>[] };
  await page.route('**/rest/v1/coletas_laboratorio*', route => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('clinica_id')).toBe(`eq.${fixture.clinicId}`);
    const selectedId = params.get('id')?.slice(3) || id;
    return route.fulfill({ json: state.missing ? [] : [{ id: selectedId, codigo_amostra: selectedId === newId ? 'AM-QA-202' : 'AM-QA-201', status: selectedId === newId ? 'recoleta' : state.status, created_at: '2026-10-29T10:00:00Z', tipo_amostra: 'sangue', pacientes: { nome: 'Pessoa Exemplo QA' }, exames: { tipo_exame: 'Hemograma QA' }, laboratorio_setores: { nome: 'Hematologia QA' }, tubo: 'EDTA (Roxo)', volume_ml: 4 }] });
  });
  await page.route('**/rest/v1/laboratorio_eventos_amostra*', route => {
    expect(new URL(route.request().url()).searchParams.get('clinica_id')).toBe(`eq.${fixture.clinicId}`);
    return route.fulfill(state.historyFail ? { status: 403, json: { message: 'Falha QA' } } : { json: state.events });
  });
  await page.route('**/rest/v1/rpc/laboratorio_registrar_evento_amostra', route => {
    const body = route.request().postDataJSON(); state.writes.push(body);
    if (state.saveFail) return route.fulfill({ status: 400, json: { message: 'Falha QA da movimentação' } });
    state.events = [{ id: 'evento-qa', tipo: body.p_tipo, local: body.p_local, detalhes: body.p_detalhes, created_at: '2026-10-29T10:00:00Z' }];
    if (body.p_tipo === 'recoleta' || body.p_tipo === 'rejeicao') state.status = 'rejeitada';
    return route.fulfill({ json: body.p_tipo === 'recoleta' ? newId : 'evento-qa' });
  });
  return state;
}

for (const width of [1440, 768, 390]) {
  test(`sample page at ${width}px protects movement draft and exposes identity`, async ({ page }, info) => {
    await setup(page, info);
    await page.setViewportSize({ width, height: 960 });
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Detalhes da coleta', exact: true })).toBeVisible();
    await expect(page.getByText('Pessoa Exemplo QA', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: `.qa-artifacts/lab-sample-20261029/sample-${width}.png` });
    await page.getByLabel('Local', { exact: true }).fill('Bancada QA');
    const save = page.getByRole('button', { name: 'Registrar evento', exact: true });
    await save.evaluate(el => el.scrollIntoView({ block: 'center' }));
    expect((await save.boundingBox())!.y + (await save.boundingBox())!.height).toBeLessThanOrEqual(width < 1024 ? 900 : 960);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.qa-artifacts/lab-sample-20261029/footer-${width}.png` });
    await page.getByRole('link', { name: 'Voltar ao mapa de coleta', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByLabel('Local', { exact: true })).toHaveValue('Bancada QA');
    await page.getByRole('link', { name: 'Voltar ao mapa de coleta', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL('/mapa-coleta');
  });
}

test('sample movements recover errors and recollection follows the newly linked sample', async ({ page }, info) => {
  const state = await setup(page, info);
  await page.goto(path);
  await page.getByLabel('Local', { exact: true }).fill('Bancada QA');
  state.saveFail = true;
  const save = page.getByRole('button', { name: 'Registrar evento', exact: true });
  await save.click();
  await expect(page.getByText('Falha QA da movimentação', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Local', { exact: true })).toHaveValue('Bancada QA');
  state.saveFail = false;
  await save.click();
  await expect(page.getByLabel('Local', { exact: true })).toHaveValue('');
  await expect(page.getByRole('region', { name: 'Histórico de rastreabilidade' }).getByText(/Bancada QA/)).toBeVisible();
  await page.getByRole('combobox', { name: 'Evento', exact: true }).click();
  await page.getByRole('option', { name: 'Solicitar recoleta', exact: true }).click();
  await save.click();
  await expect(page.getByText('Selecione um motivo para continuar.', { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(2);
  await page.getByRole('combobox', { name: 'Motivo', exact: true }).click();
  await page.getByRole('option', { name: 'Volume insuficiente', exact: true }).click();
  await save.click();
  await expect(page).toHaveURL(`/mapa-coleta/${newId}`);
  await expect(page.getByText(/Amostra AM-QA-202 ·/)).toBeVisible();
  expect(state.writes.at(-1)).toMatchObject({ p_coleta_id: id, p_tipo: 'recoleta', p_detalhes: { motivo_codigo: 'volume_insuficiente' } });
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('sample history can recover and routes enforce missing records and roles', async ({ page }, info) => {
  const state = await setup(page, info);
  state.historyFail = true;
  await page.goto(path);
  await expect(page.getByText('Não foi possível carregar o histórico', { exact: true })).toBeVisible();
  state.historyFail = false;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByText('Nenhuma movimentação registrada.', { exact: true })).toBeVisible();
  state.missing = true;
  await page.reload();
  await expect(page.getByText('Amostra não encontrada nesta clínica.', { exact: true })).toBeVisible();
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'medico' });
  await page.goto(path);
  await expect(page.getByText('Acesso Negado', { exact: true })).toBeVisible();
});
