import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
const clinic = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-8000-000000000003';
const version = '2026-10-29T12:00:00Z';
const doctor = { id, clinica_id: clinic, nome: 'Marina Ribeiro', crm: '12345', crm_uf: 'SP', tipo_registro: 'CRM', especialidade: 'Clínico Geral', intervalo_consulta: 30, ativo: true, updated_at: version };
async function mock(page: Page) {
  await page.route('**/rest/v1/rpc/listar_medicos_equipe_admin', route => route.fulfill({ json: [doctor] }));
  await page.route('**/rest/v1/rpc/registrar_visualizacao_historico_medico', route => {
    expect(route.request().postDataJSON()).toEqual({ p_medico_id: id });
    return route.fulfill({ json: 0 });
  });
  for (const table of ['agendamentos', 'prontuarios', 'prescricoes', 'atestados', 'medico_disponibilidade']) {
    await page.route(`**/rest/v1/${table}*`, route => route.request().method() === 'GET' ? route.fulfill({ json: [] }) : route.fallback());
  }
}
for (const width of [1440, 768, 390]) {
  test(`doctor editing and profile have dedicated pages at ${width}px`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
    await mock(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/equipe/medicos/${id}/editar`);
    await expect(page.getByRole('heading', { name: 'Editar Médico', exact: true })).toBeVisible();
    await expect(page.getByLabel('Nome Completo *')).toHaveValue(doctor.nome);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`doctor-edit-${width}.png`) });
    await page.getByLabel('Nome Completo *').fill('Marina QA');
    await page.getByRole('button', { name: 'Gerenciar disponibilidade', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    const save = page.getByRole('button', { name: 'Salvar Alterações', exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect.poll(async () => { const b = await save.boundingBox(); return b ? b.y + b.height : Infinity; }).toBeLessThanOrEqual(width < 1024 ? 840 : 900);
    await page.screenshot({ path: info.outputPath(`doctor-footer-${width}.png`) });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL('/equipe');
    await page.getByRole('button', { name: 'Ver Perfil', exact: true }).click();
    await expect(page).toHaveURL(`/equipe/medicos/${id}`);
    await expect(page.getByRole('heading', { name: 'Perfil do Médico', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`doctor-profile-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('doctor edit preserves scope and version with draft recovery and filtered return', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let writes = 0;
  await page.route('**/rest/v1/medicos*', route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('id')).toBe(`eq.${id}`);
    expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
    expect(params.get('updated_at')).toBe(`eq.${version}`);
    expect(route.request().postDataJSON()).toMatchObject({ nome: 'Marina QA', crm: '12345', crm_uf: 'SP', intervalo_consulta: 30 });
    writes++;
    return route.fulfill(writes === 1 ? { status: 400, json: { message: 'Falha sintética de cadastro' } } : { json: [{ id }] });
  });
  await page.goto('/equipe');
  await page.getByLabel('Buscar médicos por nome, CRM, especialidade ou e-mail').fill('Marina');
  await page.getByRole('button', { name: 'Editar médico Marina Ribeiro', exact: true }).click();
  await page.getByLabel('Nome Completo *').fill('Marina QA');
  await page.getByRole('button', { name: 'Salvar Alterações', exact: true }).click();
  await expect(page.getByText('Falha sintética de cadastro', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Nome Completo *')).toHaveValue('Marina QA');
  await page.getByRole('button', { name: 'Salvar Alterações', exact: true }).click();
  await expect(page).toHaveURL('/equipe');
  await expect(page.getByLabel('Buscar médicos por nome, CRM, especialidade ou e-mail')).toHaveValue('Marina');
  expect(writes).toBe(2);
});

test('new doctor preserves employee linkage and reports invitation failure without repeating creation', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let doctors = 0;
  let employees = 0;
  let invites = 0;
  await page.route('**/rest/v1/medicos*', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    expect(route.request().postDataJSON()).toMatchObject({ clinica_id: clinic, nome: 'Profissional QA', email: 'profissional@example.test', crm: '98765' });
    doctors++;
    return route.fulfill({ json: { id: 'new-doctor-qa' } });
  });
  await page.route('**/rest/v1/funcionarios*', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    expect(route.request().postDataJSON()).toMatchObject({ clinica_id: clinic, pending_roles: ['medico'] });
    employees++;
    return route.fulfill({ json: { id: 'employee-qa' } });
  });
  await page.route('**/functions/v1/invite-employee', route => {
    expect(route.request().postDataJSON()).toMatchObject({ email: 'profissional@example.test', roles: ['medico'] });
    invites++;
    return route.fulfill({ json: { success: false, error: 'Falha sintética de convite' } });
  });
  await page.goto('/equipe/medicos/novo');
  await page.getByLabel('Nome Completo *').fill('Profissional QA');
  await page.getByLabel('Número *', { exact: true }).fill('98765');
  await page.getByLabel('E-mail', { exact: true }).fill('profissional@example.test');
  await page.getByRole('button', { name: 'Cadastrar Médico', exact: true }).click();
  await expect(page).toHaveURL('/equipe');
  await expect(page.getByText('Médico cadastrado, mas o convite não pôde ser enviado. O vínculo está disponível na aba Funcionários.', { exact: true })).toBeVisible();
  expect([doctors, employees, invites]).toEqual([1, 1, 1]);
});

test('availability page validates range, protects draft, and saves with failure recovery', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let writes = 0;
  let saved = false;
  await page.route('**/rest/v1/medico_disponibilidade*', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: saved ? [{ id: 'availability-qa', dia_semana: 0, hora_inicio: '09:00', hora_fim: '12:00', duracao_consulta: 30, intervalo_consultas: 5, ativo: true }] : [] });
    expect(route.request().postDataJSON()).toMatchObject({ medico_id: id, dia_semana: 0, hora_inicio: '09:00', hora_fim: '12:00' });
    writes++;
    saved = writes > 1;
    return route.fulfill(saved ? { status: 201, json: null } : { status: 400, json: { message: 'Falha sintética de horário' } });
  });
  await page.goto(`/equipe/medicos/${id}/disponibilidade`);
  await page.getByRole('button', { name: 'Adicionar novo horário', exact: true }).click();
  await page.getByLabel('Dia da semana', { exact: true }).selectOption('0');
  await page.getByLabel('Horário de início', { exact: true }).fill('09:00');
  await page.getByLabel('Horário de término', { exact: true }).fill('09:00');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('O horário de término deve ser posterior ao início.', { exact: true })).toBeVisible();
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'Voltar à equipe médica' }).click();
  await page.getByRole('button', { name: 'Continuar nesta página' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.getByLabel('Horário de término', { exact: true }).fill('12:00');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Não foi possível salvar a disponibilidade', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Horário de término', { exact: true })).toHaveValue('12:00');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: 'Salvar', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('doctor-availability-390.png') });
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Domingo', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar à equipe médica' }).click();
  await expect(page).toHaveURL('/equipe');
  expect(writes).toBe(2);
});

test('doctor pages show RPC error and missing record without replacing unsaved fields', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let failed = true;
  await page.route('**/rest/v1/rpc/listar_medicos_equipe_admin', route => route.fulfill(failed ? { status: 500, json: { message: 'Falha sintética' } } : { json: [] }));
  await page.goto(`/equipe/medicos/${id}/editar`);
  await expect(page.getByText('Não foi possível abrir o profissional', { exact: true })).toBeVisible();
  failed = false;
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Profissional não encontrado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar Alterações' })).toHaveCount(0);
});

test('financial users cannot access clinical team administration', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'financeiro' });
  await page.goto('/equipe/medicos/novo');
  await expect(page.getByRole('heading', { name: 'Acesso Negado', exact: true })).toBeVisible();
});
