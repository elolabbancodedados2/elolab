import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
const clinic = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-9000-000000000099';
const userId = '00000000-0000-4000-9000-000000000100';
const employee = { id, clinica_id: clinic, nome: 'Pessoa da Equipe QA', email: 'equipe@example.test', telefone: '', cargo: 'Atendente', departamento: 'Recepção', ativo: true, edit_version: 7, user_id: userId, pending_roles: ['recepcao'], tipo_funcionario: 'atendente', turno: 'integral' };
async function mock(page: Page) {
  await page.route('**/rest/v1/rpc/listar_funcionarios_equipe_admin', route => route.fulfill({ json: [employee] }));
  await page.route('**/rest/v1/configuracoes_clinica*', route => {
    if (new URL(route.request().url()).searchParams.get('chave') !== 'eq.role_customization') return route.fallback();
    return route.fulfill({ json: [{ id: 'roles-qa', valor: {} }] });
  });
}
for (const width of [1440, 768, 390]) {
  test(`employee form is a page at ${width}px`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
    await mock(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/equipe/funcionarios/${id}/editar`);
    await expect(page.getByRole('heading', { name: 'Editar Funcionário', exact: true })).toBeVisible();
    await expect(page.getByLabel('Nome completo *')).toHaveValue(employee.nome);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`employee-${width}.png`) });
    await page.getByLabel('Cargo', { exact: true }).fill('Atendimento QA');
    const save = page.getByRole('button', { name: 'Salvar', exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect.poll(async () => { const b = await save.boundingBox(); return b ? b.y + b.height : Infinity; }).toBeLessThanOrEqual(width < 1024 ? 840 : 900);
    await page.screenshot({ path: info.outputPath(`employee-footer-${width}.png`) });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByLabel('Cargo', { exact: true })).toHaveValue('Atendimento QA');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL('/equipe?aba=funcionarios');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('employee edit preserves compare-and-set, atomic roles and list filters', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let writes = 0;
  let roleWrites = 0;
  await page.route('**/rest/v1/funcionarios*', route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('id')).toBe(`eq.${id}`);
    expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
    expect(params.get('edit_version')).toBe('eq.7');
    expect(route.request().postDataJSON()).toMatchObject({ nome: employee.nome, cargo: 'Atendimento QA' });
    writes++;
    return route.fulfill(writes === 1 ? { status: 400, json: { message: 'Falha sintética na ficha' } } : { json: [{ id, edit_version: 8 }] });
  });
  await page.route('**/rest/v1/rpc/sync_employee_roles_if_unchanged', route => {
    expect(route.request().postDataJSON()).toEqual({ _funcionario_id: id, _user_id: userId, _roles: ['recepcao'], _ativo: true, _expected_version: 8 });
    roleWrites++;
    return route.fulfill({ json: null });
  });
  await page.goto('/equipe?aba=funcionarios');
  await page.getByLabel('Buscar funcionários por nome ou e-mail').fill('Equipe');
  await page.getByRole('button', { name: `Editar funcionário ${employee.nome}` }).click();
  await page.getByLabel('Cargo', { exact: true }).fill('Atendimento QA');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Erro ao atualizar: Falha sintética na ficha', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Cargo', { exact: true })).toHaveValue('Atendimento QA');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL('/equipe?aba=funcionarios');
  await expect(page.getByLabel('Buscar funcionários por nome ou e-mail')).toHaveValue('Equipe');
  expect([writes, roleWrites]).toEqual([2, 1]);
});

test('employee concurrency keeps unsaved draft and partial permission failure returns to recovery list', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let conflict = true;
  await page.route('**/rest/v1/funcionarios*', route => route.request().method() === 'PATCH' ? route.fulfill({ json: conflict ? [] : [{ id, edit_version: 8 }] }) : route.fallback());
  await page.route('**/rest/v1/rpc/sync_employee_roles_if_unchanged', route => route.fulfill({ status: 400, json: { message: 'Falha sintética de vínculo' } }));
  await page.goto(`/equipe/funcionarios/${id}/editar`);
  await page.getByLabel('Cargo', { exact: true }).fill('Ficha alterada QA');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('A ficha mudou desde que você abriu a edição.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Cargo', { exact: true })).toHaveValue('Ficha alterada QA');
  conflict = false;
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL('/equipe?aba=funcionarios');
  await expect(page.getByText('Dados atualizados, mas as permissões não foram sincronizadas.', { exact: true })).toBeVisible();
});

test('new employee does not repeat a persisted creation after role sync failure', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let writes = 0;
  await page.route('**/rest/v1/funcionarios*', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    expect(route.request().postDataJSON()).toMatchObject({ clinica_id: clinic, nome: 'Funcionário novo QA', tipo_funcionario: 'atendente' });
    writes++;
    return route.fulfill({ json: { id } });
  });
  await page.route('**/rest/v1/rpc/sync_employee_roles', route => {
    expect(route.request().postDataJSON()).toMatchObject({ _funcionario_id: id, _roles: ['recepcao'], _ativo: true });
    return route.fulfill({ status: 400, json: { message: 'Falha sintética de permissões' } });
  });
  await page.goto('/equipe/funcionarios/novo');
  await page.getByLabel('Nome completo *').fill('Funcionário novo QA');
  await page.locator('#func-role-recepcao').check();
  await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
  await expect(page).toHaveURL('/equipe?aba=funcionarios');
  await expect(page.getByText('Funcionário cadastrado, mas as permissões não foram sincronizadas.', { exact: true })).toBeVisible();
  expect(writes).toBe(1);
});

test('role labels page changes presentation only and protects its draft', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let writes = 0;
  await page.route('**/rest/v1/configuracoes_clinica*', route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
    expect(params.get('id')).toBe('eq.roles-qa');
    const values = route.request().postDataJSON().valor;
    expect(values.admin).toMatchObject({ label: 'Gestão QA', modules: ['Todas as funcionalidades'] });
    expect(values.recepcao.label).toBe('Recepção');
    writes++;
    return route.fulfill({ json: [{ id: 'roles-qa' }] });
  });
  await page.goto('/equipe/funcionarios/perfis');
  await expect(page.getByRole('heading', { name: 'Personalizar perfis', exact: true })).toBeVisible();
  await page.locator('#role-label-admin').fill('Gestão QA');
  await page.getByRole('button', { name: 'Voltar aos funcionários' }).click();
  await page.getByRole('button', { name: 'Continuar nesta página' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: 'Salvar nomes e descrições', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('employee-labels-390.png') });
  await page.getByRole('button', { name: 'Salvar nomes e descrições', exact: true }).click();
  await expect(page).toHaveURL('/equipe?aba=funcionarios');
  expect(writes).toBe(1);
});

test('employee route handles RPC errors and missing records', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let failed = true;
  await page.route('**/rest/v1/rpc/listar_funcionarios_equipe_admin', route => route.fulfill(failed ? { status: 500, json: { message: 'Falha sintética' } } : { json: [] }));
  await page.goto(`/equipe/funcionarios/${id}/editar`);
  await expect(page.getByText('Não foi possível abrir o funcionário', { exact: true })).toBeVisible();
  failed = false;
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Funcionário não encontrado' })).toBeVisible();
});

test('reception cannot administer employees or role labels', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'recepcao' });
  for (const path of ['/equipe/funcionarios/novo', '/equipe/funcionarios/perfis']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Acesso Negado', exact: true })).toBeVisible();
  }
});
