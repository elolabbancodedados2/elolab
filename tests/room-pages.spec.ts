import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
const id = '00000000-0000-4000-9000-000000000092';
const clinic = '00000000-0000-4000-8000-000000000002';
const room = { id, nome: 'Consultório QA', tipo: 'consultorio', capacidade: 1, status: 'disponivel', equipamentos: ['Oxigênio'], updated_at: '2026-10-29T12:00:00Z', horario_inicio: '07:00', horario_fim: '19:00', cor: '#1456C0' };
async function mock(page: Page) {
  await page.route('**/rest/v1/salas*', route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    if (params.has('id')) expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
    return route.fulfill({ json: [room] });
  });
}
for (const width of [1440, 768, 390]) {
  test(`room create and direct edit are usable pages at ${width}px`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
    await mock(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/gestao-fluxo?origem=qa');
    await page.getByRole('textbox', { name: 'Buscar salas, leitos ou equipamentos' }).fill('Consultório QA');
    await page.getByRole('button', { name: 'Nova Sala / Leito', exact: true }).click();
    await expect(page).toHaveURL('/gestao-fluxo/salas/nova');
    await expect(page.getByRole('heading', { name: 'Nova Sala', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByLabel('Nome *', { exact: true }).fill('Sala sintética');
    await page.screenshot({ path: info.outputPath(`room-create-${width}.png`) });
    await page.getByRole('button', { name: 'Salvar', exact: true }).scrollIntoViewIfNeeded();
    await expect.poll(async () => { const box = await page.getByRole('button', { name: 'Salvar', exact: true }).boundingBox(); return box ? box.y + box.height : Infinity; }).toBeLessThanOrEqual(width < 1024 ? 840 : 900);
    await page.screenshot({ path: info.outputPath(`room-footer-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByLabel('Nome *', { exact: true })).toHaveValue('Sala sintética');
    await page.getByRole('button', { name: 'Voltar às salas e leitos' }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL('/gestao-fluxo?origem=qa');
    await expect(page.getByRole('textbox', { name: 'Buscar salas, leitos ou equipamentos' })).toHaveValue('Consultório QA');
    await page.getByRole('button', { name: 'Editar sala Consultório QA' }).click();
    await page.reload();
    await expect(page.getByLabel('Nome *', { exact: true })).toHaveValue(room.nome);
    await expect(page.getByRole('checkbox', { name: 'Oxigênio' })).toBeChecked();
  });
}
test('room saves preserve schedule validation, failed drafts and version checks', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let writes = 0;
  await page.route('**/rest/v1/salas*', route => {
    const request = route.request();
    if (request.method() !== 'PATCH') return route.fallback();
    writes++;
    const params = new URL(request.url()).searchParams;
    expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
    expect(params.get('id')).toBe(`eq.${id}`);
    expect(params.get('updated_at')).toBe(`eq.${room.updated_at}`);
    expect(request.postDataJSON().nome).toBe('Sala atualizada QA');
    return route.fulfill({ json: writes === 1 ? [] : [{ id }] });
  });
  await page.goto(`/gestao-fluxo/salas/${id}/editar`);
  await page.getByLabel('Nome *', { exact: true }).fill('Sala atualizada QA');
  await page.getByLabel('Horário Fim', { exact: true }).fill('06:00');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('O horário de encerramento deve ser posterior ao horário de início.', { exact: true })).toBeVisible();
  expect(writes).toBe(0);
  await page.getByLabel('Horário Fim', { exact: true }).fill('19:00');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Esta sala foi alterada por outra pessoa ou removida. Atualize a lista e confira os dados antes de salvar novamente.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Nome *', { exact: true })).toHaveValue('Sala atualizada QA');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL('/gestao-fluxo');
  expect(writes).toBe(2);
});
test('room page handles inaccessible records', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await page.route('**/rest/v1/salas*', route => route.fulfill({ json: [] }));
  await page.goto(`/gestao-fluxo/salas/${id}/editar`);
  await expect(page.getByRole('status').filter({ hasText: 'Sala não encontrada' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(0);
});
test('room creation keeps bed fields and recovers a failed insert', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let writes = 0;
  await page.route('**/rest/v1/salas*', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes++;
    expect(route.request().postDataJSON()).toMatchObject({ clinica_id: clinic, tipo: 'leito_enfermaria', numero_cama: 'QA1', nome: 'Leito QA' });
    return route.fulfill(writes === 1 ? { status: 400, json: { message: 'Não foi possível salvar o leito QA.' } } : { status: 201, json: null });
  });
  await page.goto('/gestao-fluxo/salas/nova');
  await page.getByLabel('Nome *', { exact: true }).fill('Leito QA');
  await page.getByLabel('Tipo *', { exact: true }).click();
  await page.getByRole('option', { name: 'Leito — Enfermaria', exact: true }).click();
  await page.getByLabel('Número da Cama', { exact: true }).fill('QA1');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Não foi possível salvar o leito QA.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Número da Cama', { exact: true })).toHaveValue('QA1');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL('/gestao-fluxo');
  expect(writes).toBe(2);
});
test('room page rejects a role without access to the workspace', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false });
  await page.goto('/gestao-fluxo/salas/nova');
  await expect(page.getByRole('heading', { name: 'Acesso Negado', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(0);
});
