import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const clinicId = '00000000-0000-4000-8000-000000000002';
const userId = '00000000-0000-4000-8000-000000000001';
const loteId = '00000000-0000-4000-9000-000000000271';
const glosaId = '00000000-0000-4000-9000-000000000272';
const convenioId = '00000000-0000-4000-9000-000000000201';

function glosaFixture(status: string = 'pendente') {
  return {
    id: glosaId, clinica_id: clinicId, lote_id: loteId, status, codigo_glosa: 'G-QA-42',
    guia_referencia: 'GUIA-QA-81', motivo: 'Documentação complementar solicitada pela operadora.',
    valor_glosado: 125, valor_recuperado: 0, recurso_justificativa: status === 'recurso_enviado' ? 'A cobrança está respaldada pela documentação clínica e autorização vigente.' : null,
    recurso_prazo: status === 'recurso_enviado' ? '2026-11-15' : null,
    recurso_responsavel_id: status === 'recurso_enviado' ? userId : null,
    lotes_tiss: { numero_lote: 'QA-GLOSA-2026-02', convenios: { nome: 'Convênio QA' } },
  };
}

async function installGlosaWorkspace(page: Page, status = 'pendente') {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'financeiro' });
  const glosa = glosaFixture(status);
  await page.route('http://127.0.0.1:54321/rest/v1/glosas_convenio**', route => {
    const url = new URL(route.request().url());
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
    return route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/1' },
      body: JSON.stringify(id === glosaId ? glosa : [glosa]),
    });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/glosa_recurso_documentos**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '*/0' }, body: JSON.stringify([]),
  }));
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/listar_responsaveis_financeiro', route => route.fulfill({
    status: 200, json: [{ id: userId, nome: 'Financeiro QA' }],
  }));
  return { synthetic, glosa };
}

async function installBillingList(page: Page, status = 'pendente') {
  const context = await installGlosaWorkspace(page, status);
  await page.route('http://127.0.0.1:54321/rest/v1/convenios**', route => route.fulfill({ status: 200, json: [{ id: convenioId, nome: 'Convênio QA', versao_tiss: '04.01.00' }] }));
  await page.route('http://127.0.0.1:54321/rest/v1/lotes_tiss**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/1' },
    body: JSON.stringify([{
      id: loteId, numero_lote: 'QAG2602', convenio_id: convenioId, competencia: '2026-10-01',
      quantidade_guias: 1, valor_apresentado: 150, valor_pago: 0, valor_conciliado_financeiro: 0,
      retorno_em: null, status: 'enviado', versao_tiss: '04.01.00', convenios: { nome: 'Convênio QA', registro_ans: '123456' },
    }]),
  }));
  await page.route('http://127.0.0.1:54321/rest/v1/lote_tiss_guias**', route => route.fulfill({ status: 200, json: [] }));
  await page.route('http://127.0.0.1:54321/rest/v1/autorizacoes_convenio**', route => route.fulfill({ status: 200, json: [] }));
  return context;
}

test('preparação de recurso é página própria e preserva os mesmos dados na repetição', async ({ page }) => {
  const { synthetic } = await installGlosaWorkspace(page);
  const preparationPayloads: Record<string, unknown>[] = [];
  const assigneePayloads: Record<string, unknown>[] = [];
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/atualizar_glosa_convenio', async route => {
    preparationPayloads.push(route.request().postDataJSON() as Record<string, unknown>);
    if (preparationPayloads.length === 1) return route.fulfill({ status: 503, json: { code: 'SYNTHETIC_FAILURE', message: 'Falha sintética ao preparar recurso' } });
    return route.fulfill({ status: 200, json: { success: true } });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/definir_recurso_glosa', async route => {
    assigneePayloads.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ status: 200, json: { success: true } });
  });

  await page.goto(`/faturamento-convenios/glosas/${glosaId}/recurso`);
  await expect(page.getByRole('heading', { name: 'Preparar recurso de glosa' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(breadcrumb).toContainText('Preparar recurso de glosa');
  await expect(breadcrumb).not.toContainText(glosaId);
  await page.screenshot({ path: 'test-results/tiss-appeal-page-desktop.png', fullPage: true });
  await page.getByLabel('Justificativa').fill('A cobrança está respaldada pela documentação e autorização clínica vigente.');
  await page.getByLabel('Prazo para envio').fill('2026-11-15');
  await page.getByLabel('Responsável financeiro').selectOption(userId);
  await page.getByRole('button', { name: 'Salvar preparação' }).click();
  await expect(page.getByRole('alert')).toContainText('Falha sintética ao preparar recurso');
  await expect(page.getByLabel('Justificativa')).toHaveValue('A cobrança está respaldada pela documentação e autorização clínica vigente.');
  await page.getByRole('button', { name: 'Repetir a mesma tentativa' }).click();
  await expect(page).toHaveURL('/faturamento-convenios');
  expect(preparationPayloads).toHaveLength(2);
  expect(preparationPayloads[0]).toEqual(preparationPayloads[1]);
  expect(preparationPayloads[0]).toMatchObject({ p_glosa_id: glosaId, p_status: 'recurso_preparacao' });
  expect(assigneePayloads).toHaveLength(1);
  expect(assigneePayloads[0]).toMatchObject({ p_glosa_id: glosaId, p_prazo: '2026-11-15', p_responsavel_id: userId });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('anexo repete somente o registro de metadados depois de falha, sem reenviar o arquivo', async ({ page }) => {
  const { synthetic } = await installGlosaWorkspace(page, 'recurso_preparacao');
  let uploadCount = 0;
  let savedDocument: Record<string, unknown> | null = null;
  const metadataPayloads: Record<string, unknown>[] = [];
  await page.route('http://127.0.0.1:54321/rest/v1/glosa_recurso_documentos**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': savedDocument ? '0-0/1' : '*/0' },
    body: JSON.stringify(savedDocument ? [savedDocument] : []),
  }));
  await page.route('**/storage/v1/object/recursos-glosa/**', async route => {
    if (route.request().method() === 'POST') uploadCount++;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Id: 'object-qa', Key: 'synthetic-object' }) });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/registrar_documento_recurso_glosa', async route => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    metadataPayloads.push(payload);
    if (metadataPayloads.length === 1) return route.fulfill({ status: 503, json: { code: 'SYNTHETIC_FAILURE', message: 'Falha sintética ao vincular documento' } });
    savedDocument = { id: 'document-qa', glosa_id: glosaId, storage_path: payload.p_storage_path, file_name: payload.p_file_name, created_at: '2026-10-30T12:00:00Z' };
    return route.fulfill({ status: 200, json: { success: true } });
  });

  await page.goto(`/faturamento-convenios/glosas/${glosaId}/recurso`);
  await page.getByLabel('Anexar PDF, JPEG ou PNG (até 10 MB)').setInputFiles({ name: 'demonstrativo-qa.pdf', mimeType: 'application/pdf', buffer: Buffer.from('PDF sintético para QA.') });
  await expect(page.getByRole('alert')).toContainText('Falha sintética ao vincular documento');
  await page.getByRole('button', { name: 'Repetir registro do mesmo arquivo' }).click();
  await expect(page.getByText('demonstrativo-qa.pdf')).toBeVisible();
  expect(uploadCount).toBe(1);
  expect(metadataPayloads).toHaveLength(2);
  expect(metadataPayloads[1]).toEqual(metadataPayloads[0]);
  expect(metadataPayloads[0]).toMatchObject({ p_glosa_id: glosaId, p_file_name: 'demonstrativo-qa.pdf', p_content_type: 'application/pdf' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('decisão da operadora é própria, registra recuperação parcial e bloqueia valor sem centavos válidos', async ({ page }) => {
  const { synthetic, glosa } = await installGlosaWorkspace(page, 'recurso_enviado');
  let calls = 0;
  let payload: Record<string, unknown> | null = null;
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/atualizar_glosa_convenio', async route => {
    calls++;
    payload = route.request().postDataJSON() as Record<string, unknown>;
    glosa.status = 'aceita';
    glosa.valor_recuperado = 80.5;
    await route.fulfill({ status: 503, json: { code: 'SYNTHETIC_FAILURE', message: 'Falha sintética após a confirmação' } });
  });
  await page.goto(`/faturamento-convenios/glosas/${glosaId}/retorno`);
  await expect(page.getByRole('heading', { name: 'Registrar retorno da operadora' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const amount = page.getByLabel('Valor efetivamente recuperado (R$)');
  await amount.fill('10.123');
  await expect(page.getByRole('button', { name: 'Registrar decisão' })).toBeDisabled();
  await amount.fill('80.50');
  await page.getByRole('button', { name: 'Registrar decisão' }).click();
  await expect(page.getByRole('alert')).toContainText('Falha sintética após a confirmação');
  await page.getByRole('button', { name: 'Repetir a mesma decisão' }).click();
  await expect(page).toHaveURL('/faturamento-convenios');
  expect(payload).toMatchObject({ p_glosa_id: glosaId, p_status: 'aceita', p_valor_recuperado: 80.5 });
  expect(calls).toBe(1);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('retorno de glosa só é permitido depois do envio do recurso', async ({ page }) => {
  const { synthetic } = await installGlosaWorkspace(page, 'recurso_preparacao');
  let writes = 0;
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/atualizar_glosa_convenio', async route => {
    writes++;
    await route.fulfill({ status: 200, json: { success: true } });
  });
  await page.goto(`/faturamento-convenios/glosas/${glosaId}/retorno`);
  await expect(page.getByRole('heading', { name: 'Retorno indisponível' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar decisão' })).toHaveCount(0);
  expect(writes).toBe(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('as ações da lista de convênios navegam para páginas próprias em vez de abrir modais', async ({ page }) => {
  const { synthetic } = await installBillingList(page, 'pendente');
  await page.goto('/faturamento-convenios');
  await page.getByLabel(/Buscar lote por/).fill('QAG2602');
  await page.getByRole('button', { name: /Conferir guias do lote QAG2602/ }).click();
  await expect(page).toHaveURL(`/faturamento-convenios/lotes/${loteId}/guias`);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goto('/faturamento-convenios');
  await page.getByRole('tab', { name: /Glosas/ }).click();
  await page.getByRole('button', { name: 'Preparar recurso' }).click();
  await expect(page).toHaveURL(`/faturamento-convenios/glosas/${glosaId}/recurso`);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('as ações da glosa enviada abrem o registro próprio da decisão da operadora', async ({ page }) => {
  const { synthetic } = await installBillingList(page, 'recurso_enviado');
  await page.goto('/faturamento-convenios');
  await page.getByRole('tab', { name: /Glosas/ }).click();
  await page.getByRole('button', { name: 'Registrar retorno' }).click();
  await expect(page).toHaveURL(`/faturamento-convenios/glosas/${glosaId}/retorno`);
  await expect(page.getByRole('heading', { name: 'Registrar retorno da operadora' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

async function installGuidesWorkspace(page: Page, options: { status?: string; initialGuide?: Record<string, unknown> } = {}) {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'financeiro' });
  const batch = {
    id: loteId, clinica_id: clinicId, numero_lote: 'QAG2602', competencia: '2026-10-01',
    versao_tiss: '04.01.00', convenio_id: convenioId, quantidade_guias: options.initialGuide ? 1 : 1,
    valor_apresentado: options.initialGuide ? 150 : 150, status: options.status ?? 'rascunho',
    convenios: { nome: 'Convênio QA', registro_ans: '123456' },
  };
  let savedGuide = options.initialGuide ?? null;
  await page.route('http://127.0.0.1:54321/rest/v1/lotes_tiss**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/1' }, body: JSON.stringify(batch),
  }));
  await page.route('http://127.0.0.1:54321/rest/v1/lote_tiss_guias**', route => {
    const url = new URL(route.request().url());
    const number = url.searchParams.get('numero_guia')?.replace(/^eq\./, '');
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
    if (number) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': savedGuide ? '0-0/1' : '*/0' }, body: JSON.stringify(savedGuide?.numero_guia === number ? savedGuide : null) });
    if (id) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': savedGuide ? '0-0/1' : '*/0' }, body: JSON.stringify(savedGuide?.id === id ? savedGuide : null) });
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': savedGuide ? '0-0/1' : '*/0' }, body: JSON.stringify(savedGuide ? [savedGuide] : []) });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/autorizacoes_convenio**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '*/0' }, body: JSON.stringify([]),
  }));
  return { synthetic, batch, getSaved: () => savedGuide, setSaved: (guide: Record<string, unknown> | null) => { savedGuide = guide; } };
}

test('conferência das guias tem página própria e recupera inclusão após resposta incerta sem duplicar', async ({ page }) => {
  const context = await installGuidesWorkspace(page);
  let rpcCalls = 0;
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/adicionar_guia_lote_tiss', async route => {
    rpcCalls++;
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    context.setSaved({
      id: '00000000-0000-4000-9000-000000000273', clinica_id: clinicId,
      lote_id: payload.p_lote_id, numero_guia: payload.p_numero_guia, numero_carteira: payload.p_numero_carteira,
      paciente_id: payload.p_paciente_id, autorizacao_id: payload.p_autorizacao_id,
      data_atendimento: payload.p_data_atendimento, codigo_procedimento: payload.p_codigo_procedimento,
      tipo_servico: payload.p_tipo_servico, quantidade: payload.p_quantidade, valor_total: payload.p_valor_total,
    });
    return route.fulfill({ status: 503, json: { code: 'SYNTHETIC_FAILURE', message: 'Falha sintética após inclusão' } });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/remover_guia_lote_tiss', route => route.fulfill({ status: 200, json: { success: true } }));

  await page.goto(`/faturamento-convenios/lotes/${loteId}/guias`);
  await expect(page.getByRole('heading', { name: /Conferir guias/ })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(breadcrumb).toContainText('Conferir guias do lote');
  await expect(breadcrumb).not.toContainText(loteId);
  await page.screenshot({ path: 'test-results/tiss-guides-workspace-desktop.png', fullPage: true });
  await page.getByLabel('Número da guia').fill('QA-901');
  await page.getByLabel('Carteira do beneficiário').fill('CART-901');
  await page.getByLabel('Data do atendimento').fill('2026-10-28');
  await page.getByLabel('Código TUSS').fill('12345678');
  await page.getByLabel('Valor (R$)').fill('150.00');
  await page.setViewportSize({ width: 390, height: 844 });
  const includeGuide = page.getByRole('button', { name: 'Incluir guia' });
  await includeGuide.scrollIntoViewIfNeeded();
  const [includeBox, bottomNavigation] = await Promise.all([
    includeGuide.boundingBox(), page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox(),
  ]);
  expect(includeBox && bottomNavigation && includeBox.y + includeBox.height <= bottomNavigation.y).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/tiss-guides-workspace-mobile-edit.png', fullPage: true });
  await page.getByRole('button', { name: 'Incluir guia' }).click();
  await expect(page.getByRole('alert')).toContainText('Falha sintética após inclusão');
  await expect(page.getByLabel('Número da guia')).toHaveValue('QA-901');
  await page.getByRole('button', { name: 'Repetir a mesma inclusão' }).click();
  await expect(page.getByText('QA-901')).toBeVisible();
  await expect(page.getByLabel('Número da guia')).toHaveValue('');
  expect(rpcCalls).toBe(1);
  expect(context.getSaved()).not.toBeNull();
  expect(context.synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('conferência de guias é somente leitura após o envio e adapta-se ao celular', async ({ page }) => {
  const context = await installGuidesWorkspace(page, { status: 'enviado' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/faturamento-convenios/lotes/${loteId}/guias`);
  await expect(page.getByRole('heading', { name: /Conferir guias/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/tiss-guides-workspace-mobile.png', fullPage: true });
  await expect(page.getByText('O lote já foi enviado; suas guias estão disponíveis apenas para consulta.')).toBeVisible();
  await expect(page.getByLabel('Número da guia')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(context.synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('as telas de recurso e decisão mantêm a ação final acima da navegação móvel', async ({ page }) => {
  const context = await installGlosaWorkspace(page, 'pendente');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/faturamento-convenios/glosas/${glosaId}/recurso`);
  const saveAppeal = page.getByRole('button', { name: 'Salvar preparação' });
  await saveAppeal.scrollIntoViewIfNeeded();
  const [appealBox, navigation] = await Promise.all([
    saveAppeal.boundingBox(), page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox(),
  ]);
  expect(appealBox && navigation && appealBox.y + appealBox.height <= navigation.y).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/tiss-appeal-page-mobile.png', fullPage: true });

  context.glosa.status = 'recurso_enviado';
  context.glosa.recurso_justificativa = 'A cobrança possui documentação clínica de apoio.';
  context.glosa.recurso_prazo = '2026-11-15';
  await page.goto(`/faturamento-convenios/glosas/${glosaId}/retorno`);
  const saveDecision = page.getByRole('button', { name: 'Registrar decisão' });
  await saveDecision.scrollIntoViewIfNeeded();
  const [decisionBox, decisionNavigation] = await Promise.all([
    saveDecision.boundingBox(), page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox(),
  ]);
  expect(decisionBox && decisionNavigation && decisionBox.y + decisionBox.height <= decisionNavigation.y).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/tiss-glosa-decision-page-mobile.png', fullPage: true });
  expect(context.synthetic.assertAllWritesAreMocked()).toBe(true);
});

