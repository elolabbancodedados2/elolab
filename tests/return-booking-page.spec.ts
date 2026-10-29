import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
const clinic = '00000000-0000-4000-8000-000000000002';
const patient = '00000000-0000-4000-8000-000000000004';
const doctor = '00000000-0000-4000-8000-000000000003';
const id = '00000000-0000-4000-9000-000000000095';
const slotId = '00000000-0000-4000-9000-000000000096';
const record = { id, clinica_id: clinic, paciente_id: patient, medico_id: doctor, data_retorno_prevista: '2030-01-20', data_consulta_origem: '2026-10-29', status: 'pendente', motivo: 'Reavaliação sintética QA', tipo_retorno: 'consulta', agendamento_retorno_id: null as string | null, pacientes: { nome: 'Pessoa Exemplo QA', nome_social: null }, medicos: { nome: 'Marina Ribeiro', crm: '12345' } };
async function mock(page: Page, value = record) {
  await page.route('**/rest/v1/retornos*', route => {
    if (route.request().method() !== 'GET') return route.fallback();
    expect(new URL(route.request().url()).searchParams.get('clinica_id')).toBe(`eq.${clinic}`);
    return route.fulfill({ json: [value] });
  });
  await page.route('**/rest/v1/agendamentos*', route => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ json: new URL(route.request().url()).searchParams.has('id') ? { data: '2030-01-22', hora_inicio: '14:00:00' } : [] });
  });
  await page.route('**/rest/v1/medico_disponibilidade*', route => route.fulfill({ json: [{ hora_inicio: '07:00', hora_fim: '19:00' }] }));
  await page.route('**/rest/v1/bloqueios_agenda*', route => route.fulfill({ json: [] }));
}
for (const width of [1440, 768, 390]) {
  test(`return booking and rescheduling are pages at ${width}px`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, prontuarioPopulated: true });
    await mock(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/retornos/${id}/agendar`);
    await expect(page.getByRole('heading', { name: 'Agendar Retorno', exact: true })).toBeVisible();
    await expect(page.getByText('Pessoa Exemplo QA', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByLabel('Horário', { exact: true }).fill('10:00');
    await page.getByRole('button', { name: 'Confirmar Agendamento', exact: true }).scrollIntoViewIfNeeded();
    await expect.poll(async () => { const box = await page.getByRole('button', { name: 'Confirmar Agendamento', exact: true }).boundingBox(); return box ? box.y + box.height : Infinity; }).toBeLessThanOrEqual(width < 1024 ? 840 : 900);
    await page.screenshot({ path: info.outputPath(`return-booking-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Voltar aos retornos' }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByLabel('Horário', { exact: true })).toHaveValue('10:00');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL('/retornos');
    await mock(page, { ...record, status: 'agendado', agendamento_retorno_id: slotId });
    await page.goto(`/retornos/${id}/agendar`);
    await expect(page.getByRole('heading', { name: 'Remarcar Retorno', exact: true })).toBeVisible();
    await expect(page.getByLabel('Horário', { exact: true })).toHaveValue('14:00');
    await expect(page.getByRole('button', { name: 'Selecionar data do agendamento' })).toContainText('22/01/2030');
  });
}
test('return booking preserves conflicts, explicit out-of-hours confirmation and RPC recovery', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, prontuarioPopulated: true });
  await mock(page);
  let conflict = true;
  let writes = 0;
  await page.route('**/rest/v1/agendamentos*', route => route.fulfill({ json: conflict ? [{ id: 'conflict-qa', paciente_id: patient, medico_id: doctor, hora_inicio: '09:00', hora_fim: '09:30', status: 'agendado' }] : [] }));
  await page.route('**/rest/v1/medico_disponibilidade*', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/rpc/agendar_retorno_atomico', route => {
    writes++;
    expect(route.request().postDataJSON()).toEqual({ p_retorno_id: id, p_data: '2030-01-20', p_hora: '09:00', p_confirmou_fora_expediente: true });
    return route.fulfill(writes === 1 ? { status: 400, json: { message: 'Falha sintética de agendamento' } } : { json: slotId });
  });
  await page.goto(`/retornos/${id}/agendar`);
  await page.getByRole('button', { name: 'Confirmar Agendamento', exact: true }).click();
  await expect(page.getByText('Este médico já tem uma consulta neste horário. Escolha outro horário.', { exact: true })).toBeVisible();
  expect(writes).toBe(0);
  conflict = false;
  await page.getByRole('button', { name: 'Confirmar Agendamento', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Fora do expediente do médico');
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'Agendar mesmo assim', exact: true }).click();
  await expect(page.getByText('Falha sintética de agendamento', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Horário', { exact: true })).toHaveValue('09:00');
  await page.getByRole('button', { name: 'Confirmar Agendamento', exact: true }).click();
  await page.getByRole('button', { name: 'Agendar mesmo assim', exact: true }).click();
  await expect(page).toHaveURL('/retornos');
  expect(writes).toBe(2);
});
test('return page handles missing records, failures and terminal state', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  let mode = 'failed';
  await page.route('**/rest/v1/retornos*', route => route.fulfill(mode === 'failed' ? { status: 500, json: { message: 'Falha sintética' } } : { json: mode === 'missing' ? [] : [{ ...record, status: 'realizado' }] }));
  await page.goto(`/retornos/${id}/agendar`);
  await expect(page.getByText('Não foi possível abrir o retorno', { exact: true })).toBeVisible();
  mode = 'missing';
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Retorno não encontrado' })).toBeVisible();
  mode = 'closed';
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Este retorno já foi encerrado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar Agendamento', exact: true })).toHaveCount(0);
});
test('return booking is unavailable to financial-only users', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'financeiro', platformAdmin: false });
  await page.goto(`/retornos/${id}/agendar`);
  await expect(page.getByRole('heading', { name: 'Acesso Negado', exact: true })).toBeVisible();
});
test('return rescheduling preserves its linked slot and filtered list context', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, prontuarioPopulated: true });
  await mock(page, { ...record, status: 'agendado', agendamento_retorno_id: slotId });
  let writes = 0;
  await page.route('**/rest/v1/rpc/agendar_retorno_atomico', route => {
    writes++;
    expect(route.request().postDataJSON()).toEqual({ p_retorno_id: id, p_data: '2030-01-22', p_hora: '15:00', p_confirmou_fora_expediente: false });
    return route.fulfill({ json: slotId });
  });
  await page.goto(`/retornos?paciente=${patient}`);
  await page.getByRole('table').getByRole('button', { name: 'Remarcar', exact: true }).click();
  await expect(page).toHaveURL(`/retornos/${id}/agendar`);
  await expect(page.getByLabel('Horário', { exact: true })).toHaveValue('14:00');
  await page.getByLabel('Horário', { exact: true }).fill('15:00');
  await page.getByRole('button', { name: 'Confirmar Remarcação', exact: true }).click();
  await expect(page).toHaveURL(`/retornos?paciente=${patient}`);
  expect(writes).toBe(1);
});
