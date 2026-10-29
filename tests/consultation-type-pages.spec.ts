import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
const clinic = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-9000-000000000093';
const convenioId = '00000000-0000-4000-9000-000000000094';
const type = { id, nome: 'Consulta QA', descricao: 'Descrição sintética', instrucoes_preparo: 'Orientação sintética', duracao_minutos: 30, valor_particular: 120, cor: '#320ee9', ativo: true };
async function mock(page: Page) {
  await page.route('**/rest/v1/tipos_consulta*', route => {
    if (route.request().method() !== 'GET') return route.fallback();
    expect(new URL(route.request().url()).searchParams.get('clinica_id')).toBe(`eq.${clinic}`);
    return route.fulfill({ json: [type] });
  });
  await page.route('**/rest/v1/convenios*', route => route.fulfill({ json: [{ id: convenioId, nome: 'Convênio QA', codigo: 'QA', ativo: true }] }));
}
for (const width of [1440, 768, 390]) {
  test(`consultation types and prices have pages at ${width}px`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
    await mock(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/precos-servicos?tab=tipos');
    await page.getByRole('button', { name: 'Novo Tipo', exact: true }).click();
    await expect(page).toHaveURL('/precos-servicos/tipos/novo');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByLabel('Nome *', { exact: true }).fill('Consulta sintética');
    await page.screenshot({ path: info.outputPath(`consultation-type-${width}.png`) });
    await page.getByRole('button', { name: 'Criar', exact: true }).scrollIntoViewIfNeeded();
    await expect.poll(async () => { const box = await page.getByRole('button', { name: 'Criar', exact: true }).boundingBox(); return box ? box.y + box.height : Infinity; }).toBeLessThanOrEqual(width < 1024 ? 840 : 900);
    await page.screenshot({ path: info.outputPath(`consultation-footer-${width}.png`) });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByLabel('Nome *', { exact: true })).toHaveValue('Consulta sintética');
    await page.getByRole('button', { name: 'Voltar aos tipos de consulta' }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await page.getByRole('button', { name: 'Editar Consulta QA', exact: true }).click();
    await page.reload();
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue(type.descricao);
    await expect(page.getByText('Cor salva será preservada')).toBeVisible();
    await page.getByRole('button', { name: 'Voltar aos tipos de consulta' }).click();
    await page.getByRole('button', { name: 'Preços', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Preços — Consulta QA', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Editar preço para Convênio QA' }).click();
    await page.getByLabel('Preço para Convênio QA').fill('99.90');
    await page.screenshot({ path: info.outputPath(`consultation-prices-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Voltar aos tipos de consulta' }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByLabel('Preço para Convênio QA')).toHaveValue('99.90');
  });
}
test('consultation type create keeps failed draft and confirmed payload', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let writes = 0;
  await page.route('**/rest/v1/tipos_consulta*', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes++;
    expect(route.request().postDataJSON()).toMatchObject({ clinica_id: clinic, nome: 'Nova consulta QA', duracao_minutos: 40, valor_particular: 135.50, instrucoes_preparo: 'Orientação QA' });
    return route.fulfill(writes === 1 ? { status: 400, json: { message: 'Falha sintética no cadastro' } } : { status: 201, json: null });
  });
  await page.goto('/precos-servicos/tipos/novo');
  await page.getByLabel('Nome *', { exact: true }).fill('Nova consulta QA');
  await page.getByLabel('Duração (min)', { exact: true }).fill('40');
  await page.getByLabel('Valor Particular (R$)', { exact: true }).fill('135.50');
  await page.getByLabel('Instruções de preparo para o paciente', { exact: true }).fill('Orientação QA');
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(page.getByText('Falha sintética no cadastro', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Nome *', { exact: true })).toHaveValue('Nova consulta QA');
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(page).toHaveURL('/precos-servicos?tab=tipos');
  expect(writes).toBe(2);
});
test('finance can change a price with recovery but cannot edit consultation types', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'financeiro', platformAdmin: false });
  await mock(page);
  let writes = 0;
  let saved = false;
  await page.route('**/rest/v1/precos_consulta_convenio*', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: saved ? [{ id: 'price-qa', tipo_consulta_id: id, convenio_id: convenioId, valor: 99.90, ativo: true }] : [] });
    writes++;
    expect(route.request().postDataJSON()).toMatchObject({ tipo_consulta_id: id, convenio_id: convenioId, clinica_id: clinic, valor: 99.90 });
    saved = writes > 1;
    return route.fulfill(saved ? { status: 201, json: null } : { status: 400, json: { message: 'Falha sintética no preço' } });
  });
  await page.goto(`/precos-servicos/tipos/${id}/precos`);
  await page.getByRole('button', { name: 'Editar preço para Convênio QA' }).click();
  await page.getByLabel('Preço para Convênio QA').fill('99.90');
  await page.getByRole('button', { name: 'Salvar preço', exact: true }).click();
  await expect(page.getByText('Falha sintética no preço', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Preço para Convênio QA')).toHaveValue('99.90');
  await page.getByRole('button', { name: 'Salvar preço', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Editar preço para Convênio QA' })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar aos tipos de consulta' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page).toHaveURL('/precos-servicos?tab=tipos');
  expect(writes).toBe(2);
  await page.goto('/precos-servicos/tipos/novo');
  await expect(page.getByRole('status').filter({ hasText: 'Somente administradores' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar', exact: true })).toHaveCount(0);
});
test('consultation type editing preserves saved colors and returns to its cash tab', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let updated = false;
  await page.route('**/rest/v1/tipos_consulta*', route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    expect(new URL(route.request().url()).searchParams.get('clinica_id')).toBe(`eq.${clinic}`);
    expect(new URL(route.request().url()).searchParams.get('id')).toBe(`eq.${id}`);
    expect(route.request().postDataJSON()).toMatchObject({ nome: 'Consulta QA revisada', cor: type.cor, instrucoes_preparo: type.instrucoes_preparo });
    updated = true;
    return route.fulfill({ json: [{ id }] });
  });
  await page.goto('/recepcao?tab=caixa');
  await page.getByRole('tab', { name: 'Tipos de Consulta', exact: true }).click();
  await page.getByRole('button', { name: 'Editar Consulta QA', exact: true }).click();
  await page.getByLabel('Nome *', { exact: true }).fill('Consulta QA revisada');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL('/recepcao?tab=caixa');
  await expect(page.getByRole('tab', { name: 'Tipos de Consulta', exact: true })).toHaveAttribute('data-state', 'active');
  await expect(page.getByRole('heading', { name: 'Tipos & Preços de Consulta', exact: true })).toBeVisible();
  expect(updated).toBe(true);
});
test('consultation type page recovers loading errors and missing records', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  let failed = true;
  await page.route('**/rest/v1/tipos_consulta*', route => route.fulfill(failed ? { status: 500, json: { message: 'Falha sintética' } } : { json: [] }));
  await page.goto(`/precos-servicos/tipos/${id}/editar`);
  await expect(page.getByText('Não foi possível abrir o tipo de consulta', { exact: true })).toBeVisible();
  failed = false;
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Tipo de consulta não encontrado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(0);
});
