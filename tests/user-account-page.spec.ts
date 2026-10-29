import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
const id = '00000000-0000-4000-9000-000000000111';
const account = { id, nome: 'Conta Operacional QA', email: 'conta@example.test', telefone: '', avatar: null, created_at: '2026-10-01T12:00:00Z', ultimo_acesso: null };
async function mock(page: Page, roles: string[] = ['recepcao']) {
  await page.route('**/rest/v1/profiles*', route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('select') !== 'id,nome,email,telefone,avatar,created_at,ultimo_acesso') return route.fallback();
    return route.fulfill({ json: !params.get('id') || params.get('id') === `eq.${id}` ? [account] : [] });
  });
  await page.route('**/rest/v1/user_roles*', route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('select') !== 'id,user_id,role') return route.fallback();
    return route.fulfill({ json: roles.map((role, index) => ({ id: String(index), user_id: id, role })) });
  });
  await page.route('**/rest/v1/rpc/admin_situacao_contas', route => route.fulfill({ json: [] }));
}
for (const width of [1440, 390]) {
  test(`platform user editor is a page at ${width}px`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL) });
    await mock(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/usuarios/${id}/editar`);
    await expect(page.getByLabel('Nome Completo *')).toHaveValue(account.nome);
    await expect(page.getByRole('heading', { name: 'Editar usuário' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByLabel('Email', { exact: true })).toBeDisabled();
    await page.screenshot({ path: info.outputPath(`account-${width}.png`) });
    await page.getByLabel('Telefone', { exact: true }).fill('11999990000');
    const save = page.getByRole('button', { name: 'Salvar', exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect.poll(async () => { const b = await save.boundingBox(); return b ? b.y + b.height : Infinity; }).toBeLessThanOrEqual(width < 1024 ? 840 : 900);
    await page.screenshot({ path: info.outputPath(`account-footer-${width}.png`) });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByLabel('Telefone')).toHaveValue('11999990000');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL('/usuarios');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('atomic account edit keeps draft on failure and restores list filter', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL) });
  await mock(page);
  let writes = 0;
  await page.route('**/rest/v1/rpc/platform_update_clinic_user', async route => {
    writes++;
    expect(route.request().postDataJSON()).toEqual({ p_user_id: id, p_nome: account.nome, p_telefone: '11999990000', p_roles: ['recepcao', 'enfermagem'] });
    await new Promise(resolve => setTimeout(resolve, 350));
    await route.fulfill(writes === 1 ? { status: 400, json: { message: 'Falha sintética da conta' } } : { json: null });
  });
  await page.goto('/usuarios');
  await page.getByLabel('Buscar usuários').fill('Operacional');
  await page.getByRole('button', { name: `Editar usuário ${account.nome}` }).click();
  await page.getByLabel('Telefone').fill('11999990000');
  await page.getByLabel('Enfermagem', { exact: true }).click();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByLabel('Telefone')).toBeDisabled();
  await expect(page.getByText('Falha sintética da conta', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Telefone')).toHaveValue('11999990000');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL('/usuarios');
  await expect(page.getByLabel('Buscar usuários')).toHaveValue('Operacional');
  expect(writes).toBe(2);
});

test('account without roles requires an explicit selection', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL) });
  await mock(page, []);
  await page.goto(`/usuarios/${id}/editar`);
  await expect(page.getByLabel('Nome Completo *')).toHaveValue(account.nome);
  await expect(page.getByLabel('Recepção', { exact: true })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeDisabled();
  await page.getByLabel('Recepção', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeEnabled();
});

test('missing account and self-edit do not expose an editable form', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL) });
  await mock(page);
  await page.goto('/usuarios/00000000-0000-4000-9000-000000000999/editar');
  await expect(page.getByRole('heading', { name: 'Usuário não encontrado' })).toBeVisible();
  await page.goto('/usuarios/00000000-0000-4000-8000-000000000001/editar');
  await expect(page.getByRole('heading', { name: 'Esta tela não permite editar sua própria conta' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(0);
});

test('clinic admin cannot access platform account editor', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await page.goto(`/usuarios/${id}/editar`);
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByRole('heading', { name: 'Editar usuário' })).toHaveCount(0);
});
