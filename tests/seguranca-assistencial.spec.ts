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
  await expect(page.getByRole('checkbox', { name: 'Proteger minha identidade dos revisores' })).toBeChecked();
  await page.getByLabel('O que aconteceu? *').fill('Material estava sem identificação e foi separado antes da coleta.');
  await page.getByLabel('Ação imediata tomada').fill('Material isolado e equipe avisada.');
  await page.getByRole('button', { name: 'Enviar relato', exact: true }).click();

  await expect(page.getByText('Identidade protegida', { exact: true })).toBeVisible();
  await expect(page.getByText('Relator: Identidade protegida')).toBeVisible();
  await expect(page.getByText(synthetic.userId)).toHaveCount(0);
  const createPayload = calls.find((call) => call.action === 'create')?.body.report as Record<string, unknown>;
  expect(createPayload.reporter_confidential).toBe(true);
  expect(createPayload).not.toHaveProperty('reporter_user_id');
  expect(createPayload).not.toHaveProperty('patient_id');

  await page.getByRole('button', { name: 'Revisar e acompanhar' }).click();
  await expect(page.getByRole('heading', { name: 'Revisar relato assistencial' })).toBeVisible();
  await page.getByLabel('Status').click();
  await page.getByRole('option', { name: 'Ação necessária' }).click();
  await page.getByLabel('Responsável').click();
  await page.getByRole('option', { name: 'QA Admin' }).click();
  await page.getByLabel('Prazo da ação').fill('2026-10-20T12:00');
  await page.getByLabel('Análise da qualidade *').fill('Risco confirmado pela revisão.');
  await page.getByLabel('Ação corretiva ou preventiva').fill('Atualizar checklist de conferência.');
  await page.getByRole('button', { name: 'Salvar revisão' }).click();
  await expect(page.getByText('Ação corretiva: Atualizar checklist de conferência.')).toBeVisible();
  await page.getByRole('button', { name: 'Solicitar retificação' }).click();
  await page.getByLabel('Texto corrigido *').fill('A versão corrigida preserva os fatos e corrige a ordem da ocorrência.');
  await page.getByLabel('Ação imediata corrigida').fill('Material isolado, etiquetado e equipe avisada.');
  await page.getByLabel('Motivo da retificação *').fill('Corrigi a ordem dos fatos registrada no primeiro relato.');
  await page.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(page.getByText('Aguardando análise')).toBeVisible();
  await page.getByLabel('Nota da decisão *').fill('Correção conferida e aplicada.');
  await page.getByRole('button', { name: 'Aprovar e aplicar retificação' }).click();
  await expect(page.getByText('A versão corrigida preserva os fatos e corrige a ordem da ocorrência.', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Aprovada', { exact: true })).toBeVisible();
  expect(calls.map((call) => call.action)).toContain('get');
  expect(calls.map((call) => call.action)).toContain('update');
  expect(calls.map((call) => call.action)).toContain('request_correction');
  expect(calls.map((call) => call.action)).toContain('resolve_correction');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
