import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('bloqueios da agenda usam páginas próprias e preservam o fluxo de criação', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false, agendaPopulated: true });
  const blocks: Record<string, unknown>[] = [];
  let savedPayload: Record<string, unknown> | null = null;
  await page.route('**/rest/v1/bloqueios_agenda*', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(blocks) });
      return;
    }
    if (route.request().method() === 'POST') {
      savedPayload = route.request().postDataJSON() as Record<string, unknown>;
      blocks.push({ ...savedPayload, id: 'synthetic-block-1' });
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'synthetic-block-1' }) });
      return;
    }
    await route.fallback();
  });

  await page.goto('/agenda?data=2026-10-30&view=weekly');
  await page.getByRole('textbox', { name: 'Buscar paciente, CPF ou telefone' }).fill('Pessoa QA');
  await page.getByRole('button', { name: 'Mais opções da agenda' }).click();
  await page.getByRole('menuitem', { name: /Bloquear horário/ }).click();
  await expect(page).toHaveURL('/agenda/bloqueios');
  await expect(page.getByRole('heading', { name: 'Bloqueios da agenda', exact: true })).toBeVisible();
  const createBlockLink = page.getByRole('link', { name: 'Novo bloqueio', exact: true }).first();
  await expect(createBlockLink).toBeVisible();
  await createBlockLink.click();
  await expect(page).toHaveURL('/agenda/bloqueios/novo');
  await expect(page.getByRole('heading', { name: 'Novo bloqueio de agenda', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByLabel('Profissional *').click();
  await page.getByRole('option', { name: /Dra\. Marina Ribeiro/ }).click();
  await page.getByLabel('Motivo do bloqueio *').click();
  await page.getByRole('option', { name: 'Férias', exact: true }).click();
  await page.getByLabel('Data inicial *').fill('2026-11-03');
  await page.getByLabel('Data final *').fill('2026-11-04');
  await page.getByLabel('Observação').fill('Férias — QA sintético');
  await page.getByRole('button', { name: 'Salvar bloqueio' }).click();

  await expect(page).toHaveURL('/agenda/bloqueios');
  await expect(page.getByText('Férias — QA sintético')).toBeVisible();
  expect(savedPayload).toMatchObject({
    medico_id: '00000000-0000-4000-8000-000000000003',
    data_inicio: '2026-11-03',
    data_fim: '2026-11-04',
    dia_inteiro: true,
    hora_inicio: null,
    hora_fim: null,
    motivo: 'Férias — QA sintético',
    tipo: 'ferias',
    clinica_id: '00000000-0000-4000-8000-000000000002',
  });
  await page.getByRole('link', { name: 'Novo bloqueio', exact: true }).first().click();
  await expect(page.getByLabel('Observação')).toHaveValue('');
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page).toHaveURL('/agenda/bloqueios');
  await page.getByRole('link', { name: 'Voltar à agenda' }).click();
  await expect(page).toHaveURL('/agenda?data=2026-10-30&view=weekly');
  await expect(page.getByRole('textbox', { name: 'Buscar paciente, CPF ou telefone' })).toHaveValue('Pessoa QA');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('conflito do banco mantém campos e explica como recuperar', async ({ page }, testInfo) => {
  await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false, agendaPopulated: true });
  let attempts = 0;
  await page.route('**/rest/v1/bloqueios_agenda*', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    if (route.request().method() === 'POST') {
      attempts += 1;
      return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'AGENDA_BLOQUEIO_CONFLITO' }) });
    }
    return route.fallback();
  });
  await page.goto('/agenda/bloqueios/novo');
  await page.getByLabel('Profissional *').click();
  await page.getByRole('option', { name: /Dra\. Marina Ribeiro/ }).click();
  await page.getByLabel('Data inicial *').fill('2026-11-03');
  await page.getByLabel('Data final *').fill('2026-11-03');
  await page.getByLabel('Observação').fill('Reunião clínica sintética');
  await page.getByRole('button', { name: 'Salvar bloqueio' }).click();
  await expect(page.getByRole('alert')).toContainText('Existe uma consulta marcada neste período');
  await expect(page.getByLabel('Observação')).toHaveValue('Reunião clínica sintética');
  await expect(page).toHaveURL('/agenda/bloqueios/novo');
  expect(attempts).toBe(1);
});

test('bloqueio por faixa horária rejeita intervalos invertidos antes de gravar', async ({ page }, testInfo) => {
  await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false, agendaPopulated: true });
  let payload: Record<string, unknown> | null = null;
  await page.route('**/rest/v1/bloqueios_agenda*', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    if (route.request().method() === 'POST') {
      payload = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ status: 201, json: { id: 'synthetic-block-hours' } });
    }
    return route.fallback();
  });
  await page.goto('/agenda/bloqueios/novo');
  await page.getByLabel('Profissional *').click();
  await page.getByRole('option', { name: /Dra\. Marina Ribeiro/ }).click();
  await page.getByLabel('Data inicial *').fill('2026-11-03');
  await page.getByLabel('Data final *').fill('2026-11-03');
  await page.getByRole('switch', { name: 'Dia inteiro' }).click();
  await page.getByLabel('Horário inicial *').fill('13:00');
  await page.getByLabel('Horário final *').fill('12:00');
  await page.getByRole('button', { name: 'Salvar bloqueio' }).click();
  await expect(page.getByRole('alert')).toContainText('O horário final deve ser posterior');
  expect(payload).toBeNull();
  await page.getByLabel('Horário final *').fill('14:00');
  await page.getByRole('button', { name: 'Salvar bloqueio' }).click();
  await expect(page).toHaveURL('/agenda/bloqueios');
  expect(payload).toMatchObject({ hora_inicio: '13:00', hora_fim: '14:00', dia_inteiro: false });
});

test('remoção mantém confirmação curta e restringe a alteração à clínica atual', async ({ page }, testInfo) => {
  await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false, agendaPopulated: true });
  const block = {
    id: 'synthetic-block-delete', medico_id: '00000000-0000-4000-8000-000000000003',
    data_inicio: '2026-11-03', data_fim: '2026-11-04', hora_inicio: null, hora_fim: null,
    dia_inteiro: true, motivo: 'Férias sintéticas', tipo: 'ferias',
  };
  let blocks: Record<string, unknown>[] = [block];
  let deleteFilters: URLSearchParams | null = null;
  await page.route('**/rest/v1/bloqueios_agenda*', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: blocks });
    if (request.method() === 'DELETE') {
      deleteFilters = new URL(request.url()).searchParams;
      blocks = [];
      return route.fulfill({ status: 200, json: [{ id: block.id }] });
    }
    return route.fallback();
  });
  await page.goto('/agenda/bloqueios');
  await expect(page.getByText('Férias sintéticas')).toBeVisible();
  await page.getByRole('button', { name: /Remover bloqueio de Dra\. Marina Ribeiro/ }).click();
  const confirmation = page.getByRole('alertdialog', { name: 'Remover bloqueio da agenda?' });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('novos agendamentos poderão ocupar');
  await confirmation.getByRole('button', { name: 'Remover bloqueio', exact: true }).click();
  await expect(page.getByText('Nenhum bloqueio cadastrado')).toBeVisible();
  expect(deleteFilters?.get('id')).toBe('eq.synthetic-block-delete');
  expect(deleteFilters?.get('clinica_id')).toBe('eq.00000000-0000-4000-8000-000000000002');
});

test('formulário de bloqueio cabe no celular e protege trabalho não salvo', async ({ page }, testInfo) => {
  await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false, agendaPopulated: true });
  await page.route('**/rest/v1/bloqueios_agenda*', route => route.fulfill({ json: [] }));
  for (const width of [1440, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/agenda/bloqueios/novo');
    await expect(page.getByRole('heading', { name: 'Novo bloqueio de agenda', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`agenda-block-create-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/agenda/bloqueios/novo');
  await expect(page.getByRole('heading', { name: 'Novo bloqueio de agenda', exact: true })).toBeVisible();
  await page.getByLabel('Observação').fill('Rascunho sintético');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('agenda-block-create-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Sair sem salvar?' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar nesta página' }).click();
  await expect(page.getByLabel('Observação')).toHaveValue('Rascunho sintético');
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('button', { name: 'Descartar e sair' }).click();
  await expect(page).toHaveURL('/agenda/bloqueios');
});
