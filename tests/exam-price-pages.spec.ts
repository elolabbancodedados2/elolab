import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
const clinic = '00000000-0000-4000-8000-000000000002';
const agreementId = '00000000-0000-4000-9000-000000000097';
const id = '00000000-0000-4000-9000-000000000098';
const version = '2026-10-29T12:00:00Z';
const internal = { nome: 'Hemograma QA', codigo_tuss: 'QA001', descricao: 'Preço sintético', valor: 40, custo: 10 };
const other = { nome: 'Glicose QA', codigo_tuss: 'QA002', descricao: '', valor: 20, custo: 5 };
const price = { id, convenio_id: agreementId, clinica_id: clinic, tipo_exame: internal.nome, codigo_tuss: internal.codigo_tuss, descricao: '', valor_tabela: 35, valor_filme: 5, valor_total: 40, valor_custo: 10, valor_repasse: 5, updated_at: version, convenios: { nome: 'Operadora QA', codigo: 'QA' } };
const editInternal = `/precos-servicos/exames/particular/editar?${new URLSearchParams({ item: JSON.stringify([internal.nome, internal.codigo_tuss]) })}`;
async function mock(page: Page, items = [other, internal]) {
  await page.route('**/rest/v1/configuracoes_clinica*', route => {
    if (route.request().method() !== 'GET' || new URL(route.request().url()).searchParams.get('chave') !== 'eq.precos_exames_internos') return route.fallback();
    expect(new URL(route.request().url()).searchParams.get('clinica_id')).toBe(`eq.${clinic}`);
    return route.fulfill({ json: [{ valor: items, updated_at: version }] });
  });
  await page.route('**/rest/v1/convenios*', route => route.fulfill({ json: [{ id: agreementId, nome: 'Operadora QA', codigo: 'QA', ativo: true }] }));
  await page.route('**/rest/v1/precos_exames_convenio*', route => {
    if (route.request().method() !== 'GET') return route.fallback();
    expect(new URL(route.request().url()).searchParams.get('clinica_id')).toBe(`eq.${clinic}`);
    return route.fulfill({ json: [price] });
  });
}
for (const width of [1440, 768, 390]) {
  test(`exam price editing is a page at ${width}px`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
    await mock(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(editInternal);
    await expect(page.getByRole('heading', { name: 'Editar Exame Particular', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Nome do exame' })).toContainText(internal.nome);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByLabel('Valor Particular (R$) *').fill('50');
    const save = page.getByRole('button', { name: 'Salvar Alterações', exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect.poll(async () => { const b = await save.boundingBox(); return b ? b.y + b.height : Infinity; }).toBeLessThanOrEqual(width < 1024 ? 840 : 900);
    await page.screenshot({ path: info.outputPath(`exam-price-particular-${width}.png`) });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByLabel('Valor Particular (R$) *')).toHaveValue('50');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL('/precos-servicos');
    await page.goto(`/precos-servicos/exames/convenios/${id}/editar`);
    await expect(page.getByLabel('Tipo de Exame *')).toHaveValue(internal.nome);
    await page.getByRole('button', { name: 'Salvar', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`exam-price-agreement-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('particular price resolves identity after reorder and preserves whole-table version on failure', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let writes = 0;
  await page.route('**/rest/v1/configuracoes_clinica*', route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('updated_at')).toBe(`eq.${version}`);
    expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
    expect(params.get('chave')).toBe('eq.precos_exames_internos');
    expect(route.request().postDataJSON().valor).toEqual([other, { ...internal, valor: 55 }]);
    writes++;
    return route.fulfill({ json: writes === 1 ? [] : [{ id: 'config-qa' }] });
  });
  await page.goto('/precos-servicos');
  await page.getByPlaceholder('Buscar exame...', { exact: true }).fill('Hemograma');
  await page.getByRole('button', { name: `Editar preço de ${internal.nome}`, exact: true }).click();
  await expect(page.getByLabel('Valor Particular (R$) *')).toHaveValue('40');
  await page.getByLabel('Valor Particular (R$) *').fill('55');
  await page.getByRole('button', { name: 'Salvar Alterações' }).click();
  await expect(page.getByText('Outra pessoa atualizou esta tabela de preços. Atualize os dados antes de salvar novamente.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Valor Particular (R$) *')).toHaveValue('55');
  await page.getByRole('button', { name: 'Salvar Alterações' }).click();
  await expect(page).toHaveURL('/precos-servicos');
  await expect(page.getByPlaceholder('Buscar exame...', { exact: true })).toHaveValue('Hemograma');
  expect(writes).toBe(2);
});

test('particular direct link refuses missing or duplicate identities', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page, [other]);
  await page.goto(editInternal);
  await expect(page.getByRole('status').filter({ hasText: 'Exame não encontrado ou identificação ambígua' })).toBeVisible();
  await mock(page, [internal, internal]);
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Exame não encontrado ou identificação ambígua' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar Alterações' })).toHaveCount(0);
});

test('agreement price keeps optimistic version and returns to its filtered tab', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'financeiro' });
  await mock(page);
  let writes = 0;
  await page.route('**/rest/v1/precos_exames_convenio*', route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('id')).toBe(`eq.${id}`);
    expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
    expect(params.get('updated_at')).toBe(`eq.${version}`);
    expect(route.request().postDataJSON()).toMatchObject({ convenio_id: agreementId, valor_tabela: 60, valor_filme: 5, valor_custo: 10, valor_repasse: 5 });
    writes++;
    return route.fulfill(writes === 1 ? { status: 400, json: { message: 'Falha sintética de preço' } } : { json: [{ id, updated_at: version }] });
  });
  await page.goto('/precos-servicos');
  await page.getByRole('tab', { name: 'Por Convênio', exact: true }).click();
  await page.getByLabel('Buscar exame ou código TUSS').fill('Hemograma');
  await page.getByRole('button', { name: `Editar preço de ${internal.nome}`, exact: true }).click();
  await page.getByLabel('Valor Tabela (R$) *').fill('60');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Falha sintética de preço', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Valor Tabela (R$) *')).toHaveValue('60');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL('/precos-servicos');
  await expect(page.getByRole('tab', { name: 'Por Convênio', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Buscar exame ou código TUSS')).toHaveValue('Hemograma');
  expect(writes).toBe(2);
});

test('price tasks handle load errors, missing record and denied access', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let failed = true;
  await page.route('**/rest/v1/precos_exames_convenio*', route => route.fulfill(failed ? { status: 500, json: { message: 'Falha sintética' } } : { json: [] }));
  await page.goto(`/precos-servicos/exames/convenios/${id}/editar`);
  await expect(page.getByText('Não foi possível abrir o preço', { exact: true })).toBeVisible();
  failed = false;
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Preço não encontrado' })).toBeVisible();
});

test('reception cannot access price tasks directly', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'recepcao' });
  await page.goto('/precos-servicos/exames/particular/novo');
  await expect(page.getByRole('heading', { name: 'Acesso Negado', exact: true })).toBeVisible();
});

test('new particular price preserves other rows and returns to the price table tab', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let writes = 0;
  await page.route('**/rest/v1/configuracoes_clinica*', route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    expect(route.request().postDataJSON().valor).toEqual([other, internal, { nome: 'Novo exame QA', codigo_tuss: '', descricao: '', valor: 75, custo: 0 }]);
    writes++;
    return route.fulfill({ json: [{ id: 'config-qa' }] });
  });
  await page.goto('/precos-servicos');
  await page.getByRole('tab', { name: 'Tabela de Preços', exact: true }).click();
  await page.getByRole('button', { name: 'Novo Exame', exact: true }).click();
  await expect(page).toHaveURL('/precos-servicos/exames/particular/novo');
  await page.getByRole('combobox', { name: 'Nome do exame' }).click();
  await page.getByPlaceholder('Buscar ou digitar nome do exame...').fill('Novo exame QA');
  await page.getByRole('option', { name: 'Cadastrar "Novo exame QA"' }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.getByLabel('Valor Particular (R$) *').fill('75');
  await page.getByRole('button', { name: 'Cadastrar Exame', exact: true }).click();
  await expect(page).toHaveURL('/precos-servicos');
  await expect(page.getByRole('tab', { name: 'Tabela de Preços', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect(writes).toBe(1);
});

test('new agreement price validates duplicates then inserts the selected clinic and agreement', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let writes = 0;
  await page.route('**/rest/v1/precos_exames_convenio*', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    expect(route.request().postDataJSON()).toMatchObject({ clinica_id: clinic, convenio_id: agreementId, tipo_exame: 'Novo exame QA', valor_tabela: 70 });
    writes++;
    return route.fulfill({ status: 201, json: null });
  });
  await page.goto('/precos-servicos/exames/convenios/novo');
  await page.getByRole('combobox', { name: 'Convênio', exact: true }).click();
  await page.getByRole('option', { name: 'Operadora QA', exact: true }).click();
  await page.getByLabel('Tipo de Exame *').fill(internal.nome);
  await page.getByLabel('Valor Tabela (R$) *').fill('70');
  await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
  await expect(page.getByText('Este nome ou código já está cadastrado para o convênio selecionado. Edite o preço existente para evitar cobranças ambíguas.', { exact: true })).toBeVisible();
  expect(writes).toBe(0);
  await page.getByLabel('Tipo de Exame *').fill('Novo exame QA');
  await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
  await expect(page).toHaveURL('/precos-servicos');
  expect(writes).toBe(1);
});
