import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('checklist concluído exige revisão antes de liberar sala', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, role: 'admin' });
  const roomId = '00000000-0000-4000-8000-000000000201';
  const executionId = '00000000-0000-4000-8000-000000000202';
  const checklistId = '00000000-0000-4000-8000-000000000203';
  const items = [
    { id: 'item_1', label: 'Higienizar superfícies de contato', required: true },
    { id: 'item_2', label: 'Trocar descartáveis e forros', required: true },
  ];
  const calls: Array<Record<string, unknown>> = [];
  let started = false;
  let submitted = false;
  let reviewed = false;
  let completedItems = items.map((item) => ({ ...item, completed: true }));

  await page.route('**/functions/v1/higiene-salas', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    calls.push(body);
    if (body.action === 'list') {
      const execution = started ? [{ id: executionId, room_id: roomId, checklist_version_id: checklistId, started_by: synthetic.userId,
        started_at: '2026-10-14T13:00:00.000Z', submitted_by: submitted ? synthetic.userId : null,
        submitted_at: submitted ? '2026-10-14T13:05:00.000Z' : null,
        completed_items: submitted ? completedItems : null, notes: submitted ? 'Superfícies revisadas.' : null }] : [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        rooms: [{ id: roomId, nome: 'Consultório QA', status: reviewed ? 'disponivel' : 'limpeza', localizacao: 'Unidade sintética', clinica_id: synthetic.clinicId }],
        activeChecklistId: checklistId, checklists: [{ id: checklistId, version: 1, title: 'Checklist de QA', items, created_at: '2026-10-14T12:00:00.000Z' }],
        executions: execution, reviews: reviewed ? [{ id: 'review-1', execution_id: executionId, reviewer_id: synthetic.userId, decision: 'approved', note: 'Inspeção visual aprovada.', created_at: '2026-10-14T13:10:00.000Z' }] : [],
        canReview: true, canConfigure: true,
      }) });
    } else if (body.action === 'start') {
      started = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ executionId }) });
    } else if (body.action === 'submit') {
      completedItems = body.completed_items as typeof completedItems;
      submitted = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    } else if (body.action === 'review') {
      reviewed = body.decision === 'approved';
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    } else {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Ação inesperada' }) });
    }
  });

  await page.goto('/higiene-salas');
  await expect(page.getByRole('heading', { name: 'Higienização de salas' })).toBeVisible();
  const hygieneMain = page.locator('#main-content main');
  expect(await hygieneMain.evaluate((main) => /#[0-9a-fA-F]{3,8}|gradient-primary|rgba\(/.test(main.innerHTML))).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('higiene-desktop.png'), fullPage: true });
  const statusGroup = page.getByRole('group', { name: 'Situação da higienização' });
  const firstStatus = statusGroup.getByRole('button').first();
  await firstStatus.focus();
  await firstStatus.press('Enter');
  await expect(firstStatus).toHaveAttribute('aria-pressed', 'true');
  await firstStatus.press('Enter');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('higiene-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Iniciar higienização' }).click();
  await expect(page.getByLabel('Higienizar superfícies de contato')).toBeVisible();
  await page.getByLabel('Higienizar superfícies de contato').check();
  await page.getByLabel('Trocar descartáveis e forros').check();
  await page.getByLabel('Observação da execução').fill('Superfícies revisadas.');
  await page.getByRole('button', { name: 'Enviar para revisão' }).click();
  await expect(page.getByText('Higienização enviada; sala bloqueada até revisão.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Iniciar higienização' })).toBeDisabled();
  expect(calls.some((call) => call.action === 'review')).toBe(false);
  await page.getByLabel('Observação da inspeção *').fill('Inspeção visual aprovada.');
  await page.getByRole('button', { name: 'Aprovar e liberar sala' }).click();
  await expect(page.getByText('Aprovada · sala liberada')).toBeVisible();
  await expect(page.getByText('Disponível', { exact: true })).toBeVisible();
  expect(calls.find((call) => call.action === 'submit')).toMatchObject({ execution_id: executionId });
  expect(calls.find((call) => call.action === 'review')).toMatchObject({ decision: 'approved', note: 'Inspeção visual aprovada.' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('falha de carregamento oferece tentativa novamente', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, role: 'recepcao' });

  await page.route('**/functions/v1/higiene-salas', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    expect(body.action).toBe('list');
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'indisponível' }) });
  });

  await page.goto('/higiene-salas');
  await expect(page.getByRole('alert')).toContainText('Não foi possível carregar a higienização');
  await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('estado vazio respeita as permissões de recepção', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, role: 'recepcao' });

  await page.route('**/functions/v1/higiene-salas', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    expect(body.action).toBe('list');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      rooms: [], activeChecklistId: null, checklists: [], executions: [], reviews: [], canReview: false, canConfigure: false,
    }) });
  });

  await page.goto('/higiene-salas');
  await expect(page.getByText('Nenhuma sala cadastrada nesta unidade.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Configurar checklist' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Inspeção e liberação' })).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
