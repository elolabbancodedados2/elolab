import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('cadastro patrimonial, ordem concluída, documento privado e bloqueio de sala', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, role: 'admin' });
  const assetId = '00000000-0000-4000-8000-000000000401';
  const orderId = '00000000-0000-4000-8000-000000000402';
  const documentId = '00000000-0000-4000-8000-000000000403';
  const roomId = '00000000-0000-4000-8000-000000000404';
  const calls: Array<Record<string, unknown>> = [];
  let asset: Record<string, unknown> | null = null;
  let order: Record<string, unknown> | null = null;
  let document: Record<string, unknown> | null = null;
  let roomStatus = 'disponivel';
  let uploadedPath = '';

  await page.route('**/functions/v1/patrimonio-equipamentos', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    calls.push(body);
    if (body.action === 'list') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        assets: asset ? [asset] : [], orders: order ? [order] : [], documents: document ? [document] : [],
        audit: asset ? [{ id: 1, asset_id: assetId, work_order_id: orderId, document_id: null, actor_id: synthetic.userId, action: 'asset_created', details: { status: asset.status }, created_at: '2026-10-14T13:00:00Z' }] : [],
        rooms: [{ id: roomId, nome: 'Consultório QA', status: roomStatus }],
        profiles: [{ id: synthetic.userId, nome: 'Admin QA' }], canManageAssets: true, canMaintain: true, canOpenOrders: true,
      }) });
    } else if (body.action === 'create_asset') {
      const fields = body.asset as Record<string, unknown>;
      asset = { id: assetId, ...fields, status: 'active', created_at: '2026-10-14T13:00:00Z', updated_at: '2026-10-14T13:00:00Z' };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ assetId }) });
    } else if (body.action === 'create_order') {
      const fields = body.order as Record<string, unknown>;
      order = { id: orderId, ...fields, status: 'open', opened_by: synthetic.userId, completion_note: null, completed_at: null, created_at: '2026-10-14T13:01:00Z', updated_at: '2026-10-14T13:01:00Z' };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ workOrderId: orderId }) });
    } else if (body.action === 'update_order') {
      const patch = body.patch as Record<string, unknown>;
      order = { ...order, ...patch, status: patch.status, completed_at: patch.status === 'completed' ? '2026-10-14T13:10:00Z' : null, updated_at: patch.status === 'in_progress' ? '2026-10-14T13:05:00Z' : '2026-10-14T13:10:00Z' };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    } else if (body.action === 'update_asset') {
      const patch = body.patch as Record<string, unknown>;
      asset = { ...asset, ...patch, updated_at: '2026-10-14T13:15:00Z' };
      if (patch.status && patch.status !== 'active') roomStatus = 'manutencao';
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    } else if (body.action === 'add_document') {
      uploadedPath = String(body.storage_path);
      document = { id: documentId, asset_id: assetId, file_name: String(body.file_name), content_type: body.content_type, byte_size: body.byte_size, uploaded_by: synthetic.userId, created_at: '2026-10-14T13:12:00Z' };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documentId }) });
    } else if (body.action === 'document_url') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: `${appOrigin}/fixture-private-document` }) });
    } else {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Ação inesperada' }) });
    }
  });

  await page.route('**/storage/v1/object/clinic-equipment-documents/**', async (route) => {
    uploadedPath = new URL(route.request().url()).pathname.split('/').slice(5).join('/') || uploadedPath;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: uploadedPath }) });
  });

  await page.goto('/patrimonio-equipamentos');
  await expect(page.getByRole('heading', { name: 'Patrimônio e manutenção' })).toBeVisible();
  await page.getByRole('button', { name: 'Novo equipamento' }).click();
  await page.getByLabel('Nome *').fill('Autoclave consultório');
  await page.getByLabel('Sala / localização').click();
  await page.getByRole('option', { name: 'Consultório QA' }).click();
  await page.getByLabel('Patrimônio').fill('PAT-QA-001');
  await page.getByLabel('Calibração até').fill('2026-11-01');
  await page.getByLabel('Bloquear disponibilidade da sala se este equipamento ficar indisponível').check();
  await page.getByRole('button', { name: 'Cadastrar ativo' }).click();
  await expect(page.getByText('Autoclave consultório', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir ordem de serviço' }).click();
  await page.getByRole('combobox', { name: 'Equipamento da ordem' }).click();
  await page.getByRole('option', { name: 'Autoclave consultório · PAT-QA-001' }).click();
  await page.getByLabel('Título da ordem *').fill('Calibração anual');
  await page.getByRole('button', { name: 'Abrir ordem' }).click();
  await page.getByRole('button', { name: 'Iniciar serviço' }).click();
  await page.getByLabel('Serviço executado em Calibração anual').fill('Calibração concluída pelo técnico credenciado.');
  await page.getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByText('Concluído: Calibração concluída pelo técnico credenciado.')).toBeVisible();
  await page.getByLabel('Anexar PDF ou imagem').setInputFiles({ name: 'certificado.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 sintético') });
  await expect(page.getByText('certificado.pdf · 0 KB')).toBeVisible();
  await page.getByRole('button', { name: 'Abrir', exact: true }).click();
  await page.getByRole('button', { name: 'Marcar indisponível' }).click();
  await expect(page.getByText('Indisponível', { exact: true })).toBeVisible();
  await expect(page.getByText('A sala fica bloqueada se este equipamento estiver fora de operação.')).toBeVisible();
  expect(calls.find((call) => call.action === 'create_asset')).toMatchObject({ action: 'create_asset' });
  expect(calls.find((call) => call.action === 'create_order')).toMatchObject({ action: 'create_order' });
  expect(calls.filter((call) => call.action === 'update_order').find((call) => (call.patch as Record<string, unknown>).status === 'completed')?.patch).toMatchObject({ status: 'completed', completion_note: 'Calibração concluída pelo técnico credenciado.' });
  expect(calls.find((call) => call.action === 'add_document')?.storage_path).toContain(`${synthetic.clinicId}/${assetId}/`);
  expect(calls.map((call) => call.action)).toContain('document_url');
  expect(uploadedPath).toContain(`${synthetic.clinicId}/${assetId}/`);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
