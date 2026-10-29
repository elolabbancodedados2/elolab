import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
const clinic = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-9000-000000000091';
const laboratory = { id, nome: 'Laboratório sintético QA', cnpj: '', telefone: '11999999999', email: 'qa@example.test', endereco: '', ativo: true };
async function mock(page: Page) {
  await page.route('**/rest/v1/laboratorios*', route => {
    if (route.request().method() !== 'GET') return route.fallback();
    expect(new URL(route.request().url()).searchParams.get('clinica_id')).toBe(`eq.${clinic}`);
    return route.fulfill({ json: [laboratory] });
  });
}
for (const width of [1440, 768, 390]) {
  test(`laboratory directory and forms are pages at ${width}px`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
    await mock(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/exames/laboratorios?voltar=%2Fexames%3Fstatus%3Dsolicitado');
    await expect(page.getByRole('heading', { name: 'Laboratórios/Fornecedores' })).toBeVisible();
    await page.getByRole('link', { name: 'Novo laboratório', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByLabel('Nome *', { exact: true }).fill('Laboratório de teste');
    await page.getByRole('button', { name: 'Voltar aos laboratórios' }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByLabel('Nome *', { exact: true })).toHaveValue('Laboratório de teste');
    await page.screenshot({ path: info.outputPath(`laboratory-create-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Adicionar', exact: true }).scrollIntoViewIfNeeded();
    await expect.poll(async () => {
      const box = await page.getByRole('button', { name: 'Adicionar', exact: true }).boundingBox();
      return box ? box.y + box.height : Infinity;
    }).toBeLessThanOrEqual(width < 1024 ? 840 : 900);
    await page.screenshot({ path: info.outputPath(`laboratory-footer-${width}.png`) });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await page.getByRole('button', { name: `Editar laboratório ${laboratory.nome}`, exact: true }).click();
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(laboratory.email);
    await page.reload();
    await expect(page.getByLabel('Nome *', { exact: true })).toHaveValue(laboratory.nome);
    await page.getByRole('button', { name: 'Voltar aos laboratórios' }).click();
    await page.getByRole('button', { name: 'Voltar aos exames' }).click();
    await expect(page).toHaveURL('/exames?status=solicitado');
  });
}
test('laboratory save preserves fields after failure and returns only on confirmed write', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let writes = 0;
  await page.route('**/rest/v1/laboratorios*', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes++;
    expect(route.request().postDataJSON()).toMatchObject({ clinica_id: clinic, nome: 'Parceiro QA' });
    return route.fulfill(writes === 1 ? { status: 400, json: { message: 'Falha sintética' } } : { status: 201, json: { id } });
  });
  await page.goto('/exames/laboratorios/novo');
  await page.getByLabel('Nome *', { exact: true }).fill('Parceiro QA');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível salvar' })).toBeVisible();
  await expect(page.getByLabel('Nome *', { exact: true })).toHaveValue('Parceiro QA');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(page).toHaveURL('/exames/laboratorios');
  expect(writes).toBe(2);
});
test('laboratory direct editing handles failure, missing record and clinic-scoped update', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  let mode = 'error';
  await page.route('**/rest/v1/laboratorios*', route => {
    const request = route.request();
    expect(new URL(request.url()).searchParams.get('clinica_id')).toBe(`eq.${clinic}`);
    if (request.method() === 'PATCH') {
      expect(new URL(request.url()).searchParams.get('id')).toBe(`eq.${id}`);
      expect(request.postDataJSON().nome).toBe('Atualizado QA');
      return route.fulfill({ json: [{ id }] });
    }
    return route.fulfill(mode === 'error' ? { status: 500, json: { message: 'Falha sintética' } } : { json: mode === 'missing' ? [] : [laboratory] });
  });
  await page.goto(`/exames/laboratorios/${id}/editar`);
  await expect(page.getByText('Não foi possível abrir o laboratório', { exact: true })).toBeVisible();
  mode = 'missing';
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Laboratório não encontrado' })).toBeVisible();
  mode = 'ready';
  await page.reload();
  await page.getByLabel('Nome *', { exact: true }).fill('Atualizado QA');
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(page).toHaveURL('/exames/laboratorios');
});
test('physician can consult but cannot edit the laboratory directory', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false });
  await mock(page);
  await page.goto('/exames/laboratorios');
  await expect(page.getByText(laboratory.nome, { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Novo laboratório' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Excluir laboratório/ })).toHaveCount(0);
  await page.goto('/exames/laboratorios/novo');
  await expect(page.getByRole('status').filter({ hasText: 'Seu perfil permite consultar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar', exact: true })).toHaveCount(0);
});
