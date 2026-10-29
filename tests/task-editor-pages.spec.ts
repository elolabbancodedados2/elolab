import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
const clinic = '00000000-0000-4000-8000-000000000002';
const user = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-9000-000000000131';
const task = { id, clinica_id: clinic, titulo: 'Revisar material QA', descricao: 'Conferência operacional', status: 'pendente', prioridade: 'media', responsavel_id: user, categoria: 'Administrativo', data_vencimento: null, paciente_id: null, criado_por: user, updated_at: '2026-10-29T10:00:00Z', created_at: '2026-10-29T10:00:00Z' };
async function mock(page: Page) {
  await page.route('**/rest/v1/tarefas*', route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
    return route.fulfill({ json: !params.get('id') || params.get('id') === `eq.${id}` ? [task] : [] });
  });
  await page.route('**/rest/v1/profiles*', route => new URL(route.request().url()).searchParams.get('select') === 'id,nome,ativo' ? route.fulfill({ json: [{ id: user, nome: 'Responsável QA', ativo: true }] }) : route.fallback());
}
for (const width of [1440, 768, 390]) {
  test(`task editor is a guarded page at ${width}px`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
    await mock(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/tarefas/${id}/editar`);
    await expect(page.getByLabel('Título *')).toHaveValue(task.titulo);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`task-edit-${width}.png`) });
    await page.getByLabel('Descrição', { exact: true }).fill('Conferência alterada QA');
    const save = page.getByRole('button', { name: 'Salvar alterações', exact: true });
    await save.evaluate(element => element.scrollIntoView({ block: 'center' }));
    await expect.poll(async () => { const b = await save.boundingBox(); return b ? b.y + b.height : Infinity; }).toBeLessThanOrEqual(width < 1024 ? 840 : 900);
    await page.screenshot({ path: info.outputPath(`task-footer-${width}.png`) });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue('Conferência alterada QA');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL('/tarefas');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('task edit keeps draft on version conflict and restores list filters', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let writes = 0;
  await page.route('**/rest/v1/tarefas*', route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    writes++;
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('id')).toBe(`eq.${id}`);
    expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
    expect(params.get('updated_at')).toBe(`eq.${task.updated_at}`);
    expect(route.request().postDataJSON()).toMatchObject({ descricao: 'Conferência alterada QA', responsavel_id: user });
    expect(route.request().postDataJSON()).not.toHaveProperty('status');
    return route.fulfill({ json: writes === 1 ? [] : [{ id }] });
  });
  await page.goto('/tarefas');
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await page.getByLabel('Buscar tarefas').fill('material');
  await page.getByRole('button', { name: `Editar tarefa ${task.titulo}`, exact: true }).click();
  await page.getByLabel('Descrição', { exact: true }).fill('Conferência alterada QA');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText('Não foi possível atualizar a tarefa: Esta tarefa foi alterada por outra pessoa. Atualize a lista e tente novamente.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue('Conferência alterada QA');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page).toHaveURL('/tarefas');
  await expect(page.getByLabel('Buscar tarefas')).toHaveValue('material');
  await expect(page.getByRole('button', { name: 'Lista', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(writes).toBe(2);
});

test('task creation recovers the existing draft and keeps clinic and author', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  const key = `elolab:draft:task:${clinic}:${user}`;
  await page.addInitScript(({ key }) => sessionStorage.setItem(key, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), value: { titulo: 'Rascunho QA', descricao: 'Detalhes QA', prioridade: 'media', responsavel_id: '', data_vencimento: '', categoria: '', paciente_id: '' } })), { key });
  let writes = 0;
  await page.route('**/rest/v1/tarefas*', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes++;
    expect(route.request().postDataJSON()).toMatchObject({ titulo: 'Rascunho QA', descricao: 'Detalhes QA', clinica_id: clinic, criado_por: user });
    await new Promise(resolve => setTimeout(resolve, 300));
    return route.fulfill(writes === 1 ? { status: 400, json: { message: 'Falha sintética da tarefa' } } : { json: null });
  });
  await page.goto('/tarefas/nova');
  await page.getByRole('button', { name: 'Restaurar', exact: true }).click();
  await expect(page.getByLabel('Título *')).toHaveValue('Rascunho QA');
  await page.getByRole('button', { name: 'Criar Tarefa' }).click();
  await expect(page.getByLabel('Título *')).toBeDisabled();
  await expect(page.getByText('Erro ao criar tarefa: Falha sintética da tarefa', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Criar Tarefa' }).click();
  await expect(page).toHaveURL('/tarefas');
  expect(await page.evaluate(key => sessionStorage.getItem(key), key)).toBeNull();
  expect(writes).toBe(2);
});

test('task page recovers failed assignee reads without losing input', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let fail = true;
  await page.route('**/rest/v1/profiles*', route => {
    if (new URL(route.request().url()).searchParams.get('select') !== 'id,nome,ativo') return route.fallback();
    return route.fulfill(fail ? { status: 400, json: { message: 'Falha sintética da equipe' } } : { json: [] });
  });
  await page.goto('/tarefas/nova');
  await page.getByLabel('Título *').fill('Tarefa preservada QA');
  await expect(page.getByRole('heading', { name: 'Não foi possível carregar os responsáveis' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar Tarefa' })).toBeDisabled();
  fail = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('button', { name: 'Criar Tarefa' })).toBeEnabled();
  await expect(page.getByLabel('Título *')).toHaveValue('Tarefa preservada QA');
});

test('finance task editor does not expose the patient search', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'financeiro' });
  await mock(page);
  await page.goto(`/tarefas/${id}/editar`);
  await expect(page.getByLabel('Título *')).toHaveValue(task.titulo);
  await expect(page.getByLabel(/Paciente relacionado/)).toHaveCount(0);
});

test('missing task cannot be edited', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  await page.goto('/tarefas/00000000-0000-4000-9000-000000000999/editar');
  await expect(page.getByRole('heading', { name: 'Tarefa não encontrada' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar alterações' })).toHaveCount(0);
});
