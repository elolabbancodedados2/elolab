import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
const clinic = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-9000-000000000121';
const product = { id, clinica_id: clinic, nome: 'Material Operacional QA', categoria: 'materiais_hospitalares', unidade: 'caixa', quantidade: 10, quantidade_minima: 5, quantidade_maxima: 20, valor_unitario: 8.5, lote: 'LOTE-QA', updated_at: '2026-10-29T10:00:00Z' };
async function stock(page: Page) {
  await page.route('**/rest/v1/estoque*', route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
    return route.fulfill({ json: !params.get('id') || params.get('id') === `eq.${id}` ? [product] : [] });
  });
}
for (const width of [1440, 768, 390]) {
  test(`stock editor is a guarded page at ${width}px`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
    await stock(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/estoque/${id}/editar`);
    await expect(page.getByLabel('Nome *', { exact: true })).toHaveValue(product.nome);
    await expect(page.getByRole('heading', { name: 'Editar produto', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByLabel('Quantidade atual')).toBeDisabled();
    await page.screenshot({ path: info.outputPath(`stock-edit-${width}.png`) });
    await page.getByLabel('Localização', { exact: true }).fill('Prateleira QA');
    const save = page.getByRole('button', { name: 'Salvar', exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect.poll(async () => { const b = await save.boundingBox(); return b ? b.y + b.height : Infinity; }).toBeLessThanOrEqual(width < 1024 ? 840 : 900);
    await page.screenshot({ path: info.outputPath(`stock-footer-${width}.png`) });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByLabel('Localização', { exact: true })).toHaveValue('Prateleira QA');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL('/estoque');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('stock editing preserves version, balance and original list filters', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await stock(page);
  let writes = 0;
  await page.route('**/rest/v1/estoque*', route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    writes++;
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
    expect(params.get('id')).toBe(`eq.${id}`);
    expect(params.get('updated_at')).toBe(`eq.${product.updated_at}`);
    expect(route.request().postDataJSON()).toMatchObject({ localizacao: 'Prateleira QA' });
    expect(route.request().postDataJSON()).not.toHaveProperty('quantidade');
    return route.fulfill({ json: writes === 1 ? [] : [{ id }] });
  });
  await page.goto('/estoque');
  await page.getByLabel('Buscar produtos').fill('Operacional');
  await page.getByRole('button', { name: `Editar item ${product.nome}` }).click();
  await page.getByLabel('Localização', { exact: true }).fill('Prateleira QA');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Este produto foi alterado por outra pessoa ou removido. Atualize a lista e confira os dados antes de salvar novamente.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Localização', { exact: true })).toHaveValue('Prateleira QA');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL('/estoque');
  await expect(page.getByLabel('Buscar produtos')).toHaveValue('Operacional');
  expect(writes).toBe(2);
});

test('new stock reuses its idempotency key after an uncertain response', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await stock(page);
  let writes = 0;
  let firstKey: string | undefined;
  await page.route('**/rest/v1/rpc/cadastrar_item_estoque', async route => {
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({ p_clinica_id: clinic, p_nome: 'Novo material QA', p_quantidade: 3, p_valor_unitario: 12.5 });
    firstKey ??= body.p_chave_cadastro;
    expect(body.p_chave_cadastro).toBe(firstKey);
    writes++;
    await route.fulfill(writes === 1 ? { status: 400, json: { message: 'Resposta sintética indisponível' } } : { json: id });
  });
  await page.goto('/estoque/novo');
  await page.getByLabel('Nome *', { exact: true }).fill('Novo material QA');
  await page.getByLabel('Saldo inicial').fill('3');
  await page.getByLabel('Valor Custo (R$)', { exact: true }).fill('12,50');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Resposta sintética indisponível', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL('/estoque');
  expect(writes).toBe(2);
});

for (const operation of ['entrada', 'saida']) {
  test(`stock ${operation} validates limits and preserves idempotency`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'enfermagem' });
    await stock(page);
    let writes = 0;
    let firstKey: string | undefined;
    await page.route('**/rest/v1/rpc/registrar_movimentacao_estoque', async route => {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({ p_item_id: id, p_tipo: operation, p_quantidade: 2, p_motivo: 'Conferência QA' });
      firstKey ??= body.p_chave_idempotencia;
      expect(body.p_chave_idempotencia).toBe(firstKey);
      writes++;
      await new Promise(resolve => setTimeout(resolve, 250));
      await route.fulfill(writes === 1 ? { status: 400, json: { message: 'Falha sintética da movimentação' } } : { json: operation === 'entrada' ? 12 : 8 });
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/estoque/${id}/${operation}`);
    await expect(page.getByRole('heading', { name: operation === 'entrada' ? 'Entrada de estoque' : 'Saída de estoque' })).toBeVisible();
    await page.getByLabel(/Quantidade \*/).fill('11');
    await page.getByLabel('Motivo *', { exact: true }).fill('Conferência QA');
    await expect(page.getByRole('button', { name: 'Confirmar', exact: true })).toBeDisabled();
    await page.getByLabel(/Quantidade \*/).fill('2');
    await expect(page.getByRole('status').filter({ hasText: 'Saldo atual' })).toContainText(operation === 'entrada' ? '12' : '8');
    await page.screenshot({ path: info.outputPath(`stock-${operation}-390.png`) });
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(page.getByLabel('Motivo *', { exact: true })).toBeDisabled();
    await expect(page.getByText('Falha sintética da movimentação', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(page).toHaveURL('/estoque');
    expect(writes).toBe(2);
  });
}

test('stock history handles empty and failed reads without an overlay', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await stock(page);
  let fail = true;
  await page.route('**/rest/v1/movimentacoes_estoque*', route => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
    expect(params.get('item_id')).toBe(`eq.${id}`);
    expect(params.get('limit')).toBe('50');
    return route.fulfill(fail ? { status: 400, json: { message: 'Falha sintética do histórico' } } : { json: [] });
  });
  await page.goto(`/estoque/${id}/historico`);
  await expect(page.getByRole('heading', { name: 'Histórico de movimentações' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('Nenhuma movimentação registrada', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('missing stock item and forbidden profile cannot submit changes', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await stock(page);
  await page.goto('/estoque/00000000-0000-4000-9000-000000000999/editar');
  await expect(page.getByRole('heading', { name: 'Produto não encontrado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(0);
});

test('reception cannot open stock movement page', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'recepcao' });
  await page.goto(`/estoque/${id}/entrada`);
  await expect(page.getByRole('heading', { name: 'Acesso Negado' })).toBeVisible();
});
