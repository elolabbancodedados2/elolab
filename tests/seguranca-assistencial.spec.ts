import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('fluxo de relato confidencial com revisão e ação corretiva oculta a identidade na interface', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, role: 'admin' });
  const reportId = '00000000-0000-4000-8000-000000000092';
  const calls: Array<{ action: string; body: Record<string, unknown> }> = [];
  let created = false;
  let reviewed = false;
  let correctionRequested = false;
  let correctionApproved = false;

  await page.route('**/functions/v1/seguranca-assistencial', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const action = String(body.action || '');
    calls.push({ action, body });
    const report = {
      id: reportId, category: 'near_miss', severity: 'moderate', occurred_at: '2026-10-14T13:00:00.000Z',
      location_label: 'Sala de coleta', summary: correctionApproved ? 'A versão corrigida preserva os fatos e corrige a ordem da ocorrência.' : 'Material estava sem identificação e foi separado antes da coleta.',
      immediate_action: 'Material isolado e equipe avisada.', status: reviewed ? 'action_required' : 'submitted',
      reporter_confidential: true, reporter_display: 'Identidade protegida', is_reporter: true, assigned_to: reviewed ? synthetic.userId : null,
      due_at: reviewed ? '2026-10-20T12:00:00.000Z' : null, created_at: '2026-10-14T13:05:00.000Z', updated_at: correctionApproved ? '2026-10-14T13:15:00.000Z' : reviewed ? '2026-10-14T13:10:00.000Z' : '2026-10-14T13:05:00.000Z',
    };
    if (action === 'list') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reports: created ? [report] : [], reviewers: [{ id: synthetic.userId, nome: 'QA Admin' }] }) });
    } else if (action === 'create') {
      created = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ report: { id: reportId, status: 'submitted' } }) });
    } else if (action === 'get') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ report, updates: reviewed ? [{ id: 'update-1', from_status: 'submitted', to_status: 'action_required', review_note: 'Risco confirmado pela revisão.', corrective_action: 'Atualizar checklist de conferência.', created_at: '2026-10-14T13:10:00.000Z', actor_user_id: synthetic.userId }] : [], correction_requests: correctionRequested ? [{ id: 'correction-1', previous_summary: 'Material estava sem identificação e foi separado antes da coleta.', previous_immediate_action: 'Material isolado e equipe avisada.', proposed_summary: 'A versão corrigida preserva os fatos e corrige a ordem da ocorrência.', proposed_immediate_action: 'Material isolado, etiquetado e equipe avisada.', reason: 'Corrigi a ordem dos fatos registrada no primeiro relato.', report_updated_at: '2026-10-14T13:10:00.000Z', status: correctionApproved ? 'approved' : 'pending', review_note: correctionApproved ? 'Correção conferida e aplicada.' : null, created_at: '2026-10-14T13:12:00.000Z', reviewed_at: correctionApproved ? '2026-10-14T13:15:00.000Z' : null }] : [] }) });
    } else if (action === 'update') {
      reviewed = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ report: { id: reportId, status: 'action_required', updated_at: '2026-10-14T13:10:00.000Z' } }) });
    } else if (action === 'request_correction') {
      correctionRequested = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ correction_request: { id: 'correction-1', status: 'pending' } }) });
    } else if (action === 'resolve_correction') {
      correctionApproved = body.decision && (body.decision as Record<string, unknown>).status === 'approved';
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ correction_request: { id: 'correction-1', status: correctionApproved ? 'approved' : 'rejected' } }) });
    } else {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Ação inesperada' }) });
    }
  });

  await page.goto('/seguranca-assistencial');
  await expect(page.getByRole('heading', { name: 'Qualidade e segurança assistencial' })).toBeVisible();
  const criticalIndicator = page.getByTestId('safety-indicator-value-critical_open');
  await expect(criticalIndicator).toHaveText('0');
  await expect(criticalIndicator).toHaveClass(/text-muted-foreground/);
  await expect(page.getByRole('button', { name: /Críticos pendentes/ })).toHaveAttribute('aria-pressed', 'false');
  await page.screenshot({ path: testInfo.outputPath('seguranca-vazio-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('heading', { name: 'Qualidade e segurança assistencial' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('seguranca-vazio-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole('checkbox', { name: 'Proteger minha identidade dos revisores' })).toBeChecked();
  await page.getByLabel('O que aconteceu? *').fill('Material estava sem identificação e foi separado antes da coleta.');
  await page.getByLabel('Ação imediata tomada').fill('Material isolado e equipe avisada.');
  await page.getByRole('button', { name: 'Enviar relato', exact: true }).click();

  await expect(page.getByText('Identidade protegida', { exact: true })).toBeVisible();
  await expect(page.getByText('Relator: Identidade protegida')).toBeVisible();
  await page.getByLabel('Buscar relatos').fill('Material');
  await expect(page.getByTestId('safety-indicator-value-critical_open')).toHaveClass(/text-muted-foreground/);
  await page.screenshot({ path: testInfo.outputPath('seguranca-relato-desktop-before.png'), fullPage: true });
  await expect(page.getByText(synthetic.userId)).toHaveCount(0);
  const createPayload = calls.find((call) => call.action === 'create')?.body.report as Record<string, unknown>;
  expect(createPayload.reporter_confidential).toBe(true);
  expect(createPayload).not.toHaveProperty('reporter_user_id');
  expect(createPayload).not.toHaveProperty('patient_id');

  await page.getByRole('link', { name: 'Revisar e acompanhar' }).click();
  await expect(page).toHaveURL(`/seguranca-assistencial/${reportId}`);
  await expect(page.getByRole('heading', { name: 'Revisar relato assistencial' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('seguranca-detalhe-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('seguranca-detalhe-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByLabel('Status da revisão').click();
  await page.getByRole('option', { name: 'Ação necessária' }).click();
  await page.getByLabel('Responsável', { exact: true }).click();
  await page.getByRole('option', { name: 'QA Admin' }).click();
  await page.getByLabel('Prazo da ação').fill('2026-10-20T12:00');
  await page.getByLabel('Análise da qualidade *').fill('Risco confirmado pela revisão.');
  await page.getByLabel('Ação corretiva ou preventiva').fill('Atualizar checklist de conferência.');
  await page.getByRole('button', { name: 'Salvar revisão' }).click();
  await expect(page.getByText('Ação corretiva: Atualizar checklist de conferência.')).toBeVisible();
  await page.getByRole('link', { name: 'Solicitar retificação' }).click();
  await expect(page).toHaveURL(`/seguranca-assistencial/${reportId}/retificacao`);
  await expect(page.getByRole('heading', { name: 'Solicitar retificação do relato' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('seguranca-retificacao-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  const proposedSummary = 'A versão corrigida preserva os fatos e corrige a ordem da ocorrência.';
  const proposedAction = 'Material isolado, etiquetado e equipe avisada.';
  const correctionReason = 'Corrigi a ordem dos fatos registrada no primeiro relato.';
  await page.getByLabel('Texto corrigido *', { exact: true }).fill(proposedSummary);
  await page.getByLabel('Ação imediata corrigida', { exact: true }).fill(proposedAction);
  await page.getByLabel('Motivo da retificação *', { exact: true }).fill(correctionReason);
  await page.getByRole('link', { name: 'Voltar aos relatos' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar nesta página' }).click();
  await expect(page.getByLabel('Texto corrigido *', { exact: true })).toHaveValue(proposedSummary);
  await expect(page.getByLabel('Ação imediata corrigida', { exact: true })).toHaveValue(proposedAction);
  await expect(page.getByLabel('Motivo da retificação *', { exact: true })).toHaveValue(correctionReason);
  await page.getByRole('button', { name: 'Enviar pedido de retificação' }).click();
  await expect(page).toHaveURL(`/seguranca-assistencial/${reportId}`);
  await expect(page.getByText('Aguardando análise')).toBeVisible();
  await page.getByLabel('Nota da decisão *').fill('Correção conferida e aplicada.');
  await page.getByRole('button', { name: 'Aprovar e aplicar retificação' }).click();
  await expect(page.getByText('A versão corrigida preserva os fatos e corrige a ordem da ocorrência.', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Aprovada', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar aos relatos' }).click();
  await expect(page).toHaveURL('/seguranca-assistencial');
  await expect(page.getByLabel('Buscar relatos')).toHaveValue('Material');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.mouse.move(10, 10);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: testInfo.outputPath('seguranca-relato-desktop-after.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('heading', { name: 'Qualidade e segurança assistencial' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('seguranca-relato-mobile-after.png'), fullPage: true });
  expect(calls.map((call) => call.action)).toContain('get');
  expect(calls.map((call) => call.action)).toContain('update');
  expect(calls.map((call) => call.action)).toContain('request_correction');
  expect(calls.map((call) => call.action)).toContain('resolve_correction');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('risco crítico vencido recebe destaque sem depender apenas da cor', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, role: 'admin' });
  const reportId = '00000000-0000-4000-8000-000000000093';
  await page.route('**/functions/v1/seguranca-assistencial', async (route) => {
    const { action } = route.request().postDataJSON() as { action: string };
    if (action === 'list') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        reports: [{
          id: reportId, category: 'near_miss', severity: 'critical', occurred_at: '2026-10-14T13:00:00.000Z',
          location_label: 'Sala de coleta', summary: 'Falha crítica sintética aguardando investigação.', immediate_action: '',
          status: 'action_required', reporter_confidential: true, reporter_display: 'Identidade protegida', is_reporter: false,
          assigned_to: synthetic.userId, due_at: '2026-10-20T12:00:00.000Z', created_at: '2026-10-14T13:05:00.000Z', updated_at: '2026-10-14T13:10:00.000Z',
        }], reviewers: [{ id: synthetic.userId, nome: 'QA Admin' }],
      }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ report: {}, updates: [], correction_requests: [] }) });
    }
  });
  await page.goto('/seguranca-assistencial');
  await expect(page.getByText('Prazo vencido', { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId('safety-indicator-value-critical_open')).toHaveText('1');
  await expect(page.getByTestId('safety-indicator-value-critical_open')).toHaveClass(/text-destructive/);
  await expect(page.getByText('Prazo vencido', { exact: true }).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('seguranca-critico-vencido-mobile-after.png'), fullPage: true });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('médico acompanha apenas os próprios relatos sem ações administrativas', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, role: 'medico', platformAdmin: false });
  const report = {
    id: '00000000-0000-4000-8000-000000000094', category: 'near_miss', severity: 'moderate',
    occurred_at: '2026-10-14T13:00:00.000Z', location_label: 'Sala de coleta', summary: 'Relato sintético do profissional.',
    immediate_action: 'Material separado.', status: 'submitted', reporter_confidential: true,
    reporter_display: 'Identidade protegida', is_reporter: true, assigned_to: null, due_at: null,
    created_at: '2026-10-14T13:05:00.000Z', updated_at: '2026-10-14T13:05:00.000Z',
  };
  await page.route('**/functions/v1/seguranca-assistencial', async (route) => {
    const { action } = route.request().postDataJSON() as { action: string };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(action === 'list'
      ? { reports: [report], reviewers: [] }
      : { report, updates: [], correction_requests: [] }) });
  });
  await page.goto('/seguranca-assistencial');
  await expect(page.getByRole('heading', { name: 'Meus relatos' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Acompanhar relato' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Revisar e acompanhar' })).toHaveCount(0);
  await expect(page.getByText(synthetic.userId)).toHaveCount(0);
  await page.getByRole('link', { name: 'Acompanhar relato' }).click();
  await expect(page).toHaveURL(new RegExp(`/seguranca-assistencial/${report.id}$`));
  await expect(page.getByRole('heading', { name: 'Acompanhar relato' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Status da revisão')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Salvar revisão' })).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('erro ao carregar relatos oferece recuperação por tentativa novamente', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, role: 'admin' });
  let attempts = 0;
  await page.route('**/functions/v1/seguranca-assistencial', async (route) => {
    attempts += 1;
    if (attempts <= 2) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Falha sintética de carregamento' }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reports: [], reviewers: [] }) });
  });
  await page.goto('/seguranca-assistencial');
  await expect(page.getByRole('alert')).toHaveText('Não foi possível carregar os relatos.');
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('Nenhum relato registrado')).toBeVisible();
  expect(attempts).toBe(3);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('detalhe do relato permite tentar novamente após falha de carregamento', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, role: 'admin' });
  const reportId = '00000000-0000-4000-8000-000000000095';
  let detailAttempts = 0;
  await page.route('**/functions/v1/seguranca-assistencial', async (route) => {
    const { action } = route.request().postDataJSON() as { action: string };
    if (action === 'list') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reports: [], reviewers: [] }) });
      return;
    }
    detailAttempts += 1;
    if (detailAttempts <= 2) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Falha sintética de leitura' }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      report: {
        id: reportId, category: 'near_miss', severity: 'moderate', occurred_at: '2026-10-14T13:00:00.000Z',
        location_label: 'Sala de coleta', summary: 'Relato disponível após nova tentativa.', immediate_action: '',
        status: 'submitted', reporter_confidential: true, is_reporter: false, assigned_to: null, due_at: null,
        created_at: '2026-10-14T13:05:00.000Z', updated_at: '2026-10-14T13:05:00.000Z',
      }, updates: [], correction_requests: [],
    }) });
  });

  await page.goto(`/seguranca-assistencial/${reportId}`);
  await expect(page.getByRole('alert')).toContainText('Não foi possível carregar este relato');
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('Relato disponível após nova tentativa.')).toBeVisible();
  expect(detailAttempts).toBe(3);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('pedido de retificação não é exibido para quem não registrou o relato', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, role: 'medico', platformAdmin: false });
  const reportId = '00000000-0000-4000-8000-000000000096';
  await page.route('**/functions/v1/seguranca-assistencial', async (route) => {
    const { action } = route.request().postDataJSON() as { action: string };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(action === 'get'
      ? { report: {
        id: reportId, category: 'near_miss', severity: 'moderate', occurred_at: '2026-10-14T13:00:00.000Z',
        location_label: 'Sala de coleta', summary: 'Relato de outro profissional.', immediate_action: '', status: 'submitted',
        reporter_confidential: true, is_reporter: false, assigned_to: null, due_at: null,
        created_at: '2026-10-14T13:05:00.000Z', updated_at: '2026-10-14T13:05:00.000Z',
      }, updates: [], correction_requests: [] }
      : { reports: [], reviewers: [] }) });
  });

  await page.goto(`/seguranca-assistencial/${reportId}/retificacao`);
  await expect(page.getByRole('alert')).toHaveText('Somente quem registrou este relato pode solicitar a retificação.');
  await expect(page.getByLabel('Texto corrigido *')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Enviar pedido de retificação' })).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
