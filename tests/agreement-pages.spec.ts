import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
const clinic = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-9000-000000000097';
const priceId = '00000000-0000-4000-9000-000000000098';
const agreement = { id, clinica_id: clinic, nome: 'Operadora QA', codigo: 'QA', ativo: true, cnpj: null, valor_consulta: 120, valor_retorno: 45, carencia: 0, prazo_retorno: 30, taxa_glosa: 2, versao_tiss: '04.01.00', registro_ans: '123456', tipo_planos: ['Executivo'], updated_at: '2026-10-29T12:00:00Z' };
const price = { id: priceId, convenio_id: id, clinica_id: clinic, tipo_exame: 'Hemograma QA', codigo_tuss: '40304361', descricao: 'Exame sintético', valor_tabela: 35, valor_filme: 5, valor_total: 40, valor_custo: 10, valor_repasse: 5, ativo: true };
async function mock(page: Page) {
  await page.route('**/rest/v1/convenios*', route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    if (params.has('id')) expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
    return route.fulfill({ json: [agreement] });
  });
  await page.route('**/rest/v1/precos_exames_convenio*', route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
    if (params.has('id')) expect(params.get('convenio_id')).toBe(`eq.${id}`);
    return route.fulfill({ json: [price] });
  });
}
for (const width of [1440, 768, 390]) {
  test(`agreement and price tasks are real pages at ${width}px`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
    await mock(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/convenios/${id}/editar`);
    await expect(page.getByLabel('Código Interno *')).toHaveValue('QA');
    await expect(page.getByRole('heading', { name: 'Editar Convênio', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`agreement-${width}.png`) });
    await page.getByLabel('Nome *', { exact: true }).fill('Operadora editada');
    await page.getByRole('tab', { name: 'Tabela de Exames', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByLabel('Nome *', { exact: true })).toHaveValue('Operadora editada');
    const save = page.getByRole('button', { name: 'Salvar', exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect.poll(async () => { const b = await save.boundingBox(); return b ? b.y + b.height : Infinity; }).toBeLessThanOrEqual(width < 1024 ? 840 : 900);
    await page.screenshot({ path: info.outputPath(`agreement-footer-${width}.png`) });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL('/convenios');
    await page.getByRole('button', { name: 'Gerenciar preços de exames do convênio Operadora QA' }).click();
    await expect(page.getByRole('heading', { name: 'Tabela de preços de exames', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Adicionar Exame', exact: true }).click();
    await expect(page).toHaveURL(`/convenios/${id}/exames/novo`);
    await page.getByLabel('Tipo do Exame *').fill('Novo exame QA');
    await page.getByLabel('Valor de tabela (R$) *').fill('25');
    await page.getByLabel('Valor de filme (R$)').fill('5');
    await expect(page.getByText('R$ 30,00', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Salvar', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`agreement-price-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('agreement edit preserves version, plans, draft recovery and filtered return', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let writes = 0;
  await page.route('**/rest/v1/convenios*', route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('id')).toBe(`eq.${id}`);
    expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
    expect(params.get('updated_at')).toBe(`eq.${agreement.updated_at}`);
    expect(route.request().postDataJSON()).toMatchObject({ nome: 'Operadora revisada', valor_consulta: 120, valor_retorno: 45, versao_tiss: '04.01.00', tipo_planos: ['Executivo', 'Básico'] });
    writes++;
    return route.fulfill(writes === 1 ? { status: 400, json: { message: 'Falha sintética ao salvar' } } : { json: [{ id, updated_at: '2026-10-29T13:00:00Z' }] });
  });
  await page.goto('/convenios');
  await page.getByPlaceholder(/Buscar.*nome/i).fill('Operadora');
  await page.getByRole('button', { name: 'Editar convênio Operadora QA', exact: true }).click();
  await page.getByLabel('Nome *', { exact: true }).fill('Operadora revisada');
  await page.getByLabel('Adicionar nome do plano de convênio').fill('Básico');
  await page.getByLabel('Adicionar nome do plano de convênio').press('Enter');
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Falha sintética ao salvar', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Nome *', { exact: true })).toHaveValue('Operadora revisada');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL('/convenios');
  await expect(page.getByPlaceholder(/Buscar.*nome/i)).toHaveValue('Operadora');
  expect(writes).toBe(2);
});

test('financial role edits scoped exam prices and recovers from failure without access to agreement data', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'financeiro' });
  await mock(page);
  let writes = 0;
  await page.route('**/rest/v1/precos_exames_convenio*', route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('id')).toBe(`eq.${priceId}`);
    expect(params.get('convenio_id')).toBe(`eq.${id}`);
    expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
    expect(route.request().postDataJSON()).toMatchObject({ tipo_exame: 'Hemograma QA', valor_tabela: 50, valor_filme: 5, valor_custo: 10, valor_repasse: 5 });
    writes++;
    return route.fulfill(writes === 1 ? { status: 400, json: { message: 'Falha sintética de preço' } } : { json: [{ id: priceId }] });
  });
  await page.goto(`/convenios/${id}/exames/${priceId}/editar`);
  await expect(page.getByLabel('Tipo do Exame *')).toHaveValue('Hemograma QA');
  await expect(page.getByRole('tab', { name: 'Dados do Convênio' })).toHaveCount(0);
  await page.getByLabel('Valor de tabela (R$) *').fill('50');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Falha sintética de preço', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Valor de tabela (R$) *')).toHaveValue('50');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL(`/convenios/${id}/exames`);
  expect(writes).toBe(2);
  await page.goto(`/convenios/${id}/editar`);
  await expect(page.getByRole('status').filter({ hasText: 'Seu perfil não pode alterar' })).toBeVisible();
});

test('agreement direct links handle failed and missing records', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let failed = true;
  await page.route('**/rest/v1/convenios*', route => route.fulfill(failed ? { status: 500, json: { message: 'Falha sintética' } } : { json: [] }));
  await page.goto(`/convenios/${id}/editar`);
  await expect(page.getByText('Não foi possível abrir o convênio', { exact: true })).toBeVisible();
  failed = false;
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Convênio não encontrado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(0);
});

test('reception cannot open agreement or exam creation', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'recepcao' });
  await mock(page);
  for (const path of ['/convenios/novo', `/convenios/${id}/exames/novo`]) {
    await page.goto(path);
    await expect(page.getByRole('status').filter({ hasText: 'Seu perfil não pode alterar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(0);
  }
});

test('new agreement and exam persist clinic-scoped payloads without nested overlays', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let agreements = 0;
  let prices = 0;
  await page.route('**/rest/v1/convenios*', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    expect(route.request().postDataJSON()).toMatchObject({ clinica_id: clinic, nome: 'Nova operadora QA', codigo: 'NEWQA' });
    agreements++;
    return route.fulfill({ json: { id } });
  });
  await page.route('**/rest/v1/precos_exames_convenio*', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    expect(route.request().postDataJSON()).toMatchObject({ clinica_id: clinic, convenio_id: id, tipo_exame: 'Novo exame QA', valor_tabela: 25 });
    prices++;
    return route.fulfill({ status: 201, json: null });
  });
  await page.goto('/convenios/novo');
  await page.getByLabel('Nome *', { exact: true }).fill('Nova operadora QA');
  await page.getByLabel('Código Interno *').fill('NEWQA');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL('/convenios');
  expect(agreements).toBe(1);
  await page.goto(`/convenios/${id}/exames/novo`);
  await page.getByLabel('Tipo do Exame *').fill('Novo exame QA');
  await page.getByLabel('Valor de tabela (R$) *').fill('25');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL(`/convenios/${id}/exames`);
  expect(prices).toBe(1);
});

test('price direct page shows loading and missing record without editable fields', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/rest/v1/precos_exames_convenio*', async route => {
    if (!new URL(route.request().url()).searchParams.has('id')) return route.fallback();
    await pending;
    await route.fulfill({ json: [] });
  });
  await page.goto(`/convenios/${id}/exames/${priceId}/editar`);
  await expect(page.getByRole('status').filter({ hasText: 'Carregando preço' })).toBeVisible();
  finish();
  await expect(page.getByRole('status').filter({ hasText: 'Exame não encontrado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(0);
});
