import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const id = '00000000-0000-4000-9000-000000000071';
const resultId = '00000000-0000-4000-9000-000000000081';
async function fixture(page: Page, origin: string, role = 'admin') {
  const clinic = await installSyntheticClinic(page, { appOrigin: origin, platformAdmin: false, role });
  const result = { id: resultId, parametro: 'Hemoglobina', resultado: '13,8', unidade: 'g/dL', critico: true, numero_versao: 1, valor_referencia_min: 12, valor_referencia_max: 16, liberado: false, metodo: 'Automatizado', exames: { tipo_exame: 'Hemograma', laboratorios: { nome: 'Laboratório QA' } }, confirmacoes: [] as any[] };
  const sample = { id, codigo_amostra: 'QA-LAUDO-001', status: 'em_analise', created_at: '2026-10-29T12:00:00Z', data_coleta: '2026-10-29T12:15:00Z', tipo_amostra: 'sangue', tubo: 'EDTA', pacientes: { nome: 'Paciente Laudo QA', cpf: '000.000.000-00', data_nascimento: '1990-01-01' }, medicos: { nome: 'Médico QA', crm: '000000' }, resultados_laboratorio: [result] };
  let failRead = false; let missing = false; let failWrite = false; let failHistory = false;
  const calls: any[] = []; const notifications: any[] = []; const versions: any[] = [];
  await page.route('**/rest/v1/coletas_laboratorio?*', route => {
    expect(route.request().method()).toBe('GET');
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('clinica_id')).toBe(`eq.${clinic.clinicId}`);
    return route.fulfill(failRead ? { status: 400, json: { message: 'Laudo QA indisponível' } } : { json: missing ? [] : [sample] });
  });
  await page.route('**/rest/v1/resultados_laboratorio?*', route => route.fulfill({ json: [{ liberado: result.liberado }] }));
  await page.route('**/rest/v1/resultados_laboratorio_versoes?*', route => route.fulfill(failHistory ? { status: 400, json: { message: 'Versões QA indisponíveis' } } : { json: versions }));
  await page.route('**/rest/v1/rpc/*laboratorio', route => {
    const body = route.request().postDataJSON(); const url = route.request().url(); calls.push({ url, body });
    if (failWrite) return route.fulfill({ status: 400, json: { message: 'Operação QA recusada' } });
    if (url.includes('validar_coleta')) sample.status = 'validado';
    if (url.includes('liberar_resultados')) { result.liberado = true; sample.status = 'liberado'; }
    if (url.includes('retificar_resultado')) {
      versions.unshift({ id: `version-${versions.length}`, numero_versao: result.numero_versao, registro_anterior: { ...result }, motivo: body.p_motivo, alterado_em: '2026-10-29T15:00:00Z', autor: { nome: 'Responsável QA' } });
      result.resultado = body.p_resultado; result.numero_versao++;
    }
    return route.fulfill({ json: url.includes('liberar_resultados') ? [{ id: resultId }] : null });
  });
  await page.route('**/rest/v1/rpc/confirmar_ciencia_resultado_critico', route => {
    const body = route.request().postDataJSON(); calls.push({ url: route.request().url(), body });
    result.confirmacoes = [{ id: 'confirmacao', numero_versao: result.numero_versao, conduta: body.p_conduta, confirmado_em: '2026-10-29T15:00:00Z', confirmador: { nome: 'Responsável QA' } }];
    return route.fulfill({ json: null });
  });
  await page.route('**/functions/v1/exam-result-notification', route => { notifications.push(route.request().postDataJSON()); return route.fulfill({ json: {} }); });
  return { clinic, result, sample, calls, versions, notifications, failRead: (v: boolean) => failRead = v, missing: (v: boolean) => missing = v, failWrite: (v: boolean) => failWrite = v, failHistory: (v: boolean) => failHistory = v };
}

for (const width of [1440, 768, 390]) {
  test(`report at ${width}px protects notes and returns to filtered worklist`, async ({ page }, info) => {
    await fixture(page, String(info.project.use.baseURL));
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/laudos-lab');
    await page.getByPlaceholder('Nome, CPF, código ou exame...').fill('QA-LAUDO-001');
    await page.getByRole('button', { name: 'Ver Laudo', exact: true }).click();
    await expect(page).toHaveURL(`/laudos-lab/${id}`);
    await expect(page.getByRole('heading', { name: 'Laudo — QA-LAUDO-001', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Liberar', exact: true })).toBeDisabled();
    await page.screenshot({ path: `.qa-artifacts/lab-report-20261029/detail-${width}.png` });
    await page.getByLabel('Observações para impressão').fill('Observação local QA.');
    const print = page.getByRole('button', { name: 'Imprimir Laudo', exact: true });
    await print.evaluate(el => el.scrollIntoView({ block: 'center' }));
    expect((await print.boundingBox())!.y + (await print.boundingBox())!.height).toBeLessThanOrEqual(width < 1024 ? 900 : 960);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.qa-artifacts/lab-report-20261029/footer-${width}.png` });
    await page.getByRole('link', { name: 'Voltar aos laudos' }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByLabel('Observações para impressão')).toHaveValue('Observação local QA.');
    await page.getByRole('link', { name: 'Voltar aos laudos' }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page.getByPlaceholder('Nome, CPF, código ou exame...')).toHaveValue('QA-LAUDO-001');
  });
}

test('report recovers validation failure, releases through RPC and records critical acknowledgement', async ({ page }, info) => {
  const data = await fixture(page, String(info.project.use.baseURL));
  await page.goto(`/laudos-lab/${id}`);
  data.failWrite(true);
  await page.getByRole('button', { name: 'Validar Coleta', exact: true }).click();
  await expect(page.getByText('Operação QA recusada', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Liberar', exact: true })).toBeDisabled();
  data.failWrite(false);
  await page.getByRole('button', { name: 'Validar Coleta', exact: true }).click();
  await expect(page.getByText('Validado', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Liberar Todos (1)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retificar laudo', exact: true })).toBeVisible();
  expect(data.calls.at(-1).body).toEqual({ p_coleta_id: id, p_resultado_ids: [resultId] });
  expect(data.notifications).toEqual([{ resultado_id: resultId }]);
  await page.getByLabel('Conduta documentada pelo profissional responsável').fill('Conduta documentada no teste sintético.');
  await page.getByRole('button', { name: 'Confirmar ciência', exact: true }).click();
  await expect(page.getByText('Conduta registrada por Responsável QA', { exact: true })).toBeVisible();
  expect(data.calls.at(-1).body).toMatchObject({ p_resultado_id: resultId, p_conduta: 'Conduta documentada no teste sintético.' });
  await page.getByRole('link', { name: 'Voltar aos laudos' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('report distinguishes history failure from empty and refreshes versions after rectification', async ({ page }, info) => {
  const data = await fixture(page, String(info.project.use.baseURL));
  data.sample.status = 'liberado'; data.result.liberado = true;
  data.failHistory(true);
  await page.goto(`/laudos-lab/${id}`);
  await page.getByRole('button', { name: 'Histórico de versões' }).click();
  await expect(page.getByText('Não foi possível carregar as versões deste resultado.', { exact: true })).toBeVisible();
  await expect(page.getByText('Nenhuma versão anterior registrada.', { exact: true })).toHaveCount(0);
  data.failHistory(false);
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('Nenhuma versão anterior registrada.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retificar laudo', exact: true }).click();
  await page.getByLabel('Resultado', { exact: true }).fill('14,2');
  await page.getByRole('link', { name: 'Voltar aos laudos' }).click();
  await page.getByRole('button', { name: 'Continuar nesta página' }).click();
  await expect(page.getByRole('button', { name: 'Salvar retificação' })).toBeDisabled();
  await page.getByLabel('Justificativa obrigatória').fill('Revisão documentada do resultado sintético.');
  await page.getByRole('button', { name: 'Salvar retificação' }).click();
  await expect(page.getByText('Resultado anterior: 13,8 g/dL', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ocultar histórico' })).toBeVisible();
  expect(data.notifications).toHaveLength(1);
  expect(data.calls.at(-1).body).toMatchObject({ p_resultado_id: resultId, p_resultado: '14,2', p_motivo: 'Revisão documentada do resultado sintético.' });
  await page.screenshot({ path: '.qa-artifacts/lab-report-20261029/history.png' });
});

test('report read failure, absent record and empty results have clear recovery', async ({ page }, info) => {
  const data = await fixture(page, String(info.project.use.baseURL));
  data.failRead(true);
  await page.goto(`/laudos-lab/${id}`);
  await expect(page.getByText('Não foi possível carregar este laudo', { exact: true })).toBeVisible();
  data.failRead(false); data.missing(true);
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('A coleta não foi encontrada ou não está acessível nesta clínica.', { exact: true })).toBeVisible();
  data.missing(false); data.sample.resultados_laboratorio = [];
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('heading', { name: 'Nenhum resultado registrado' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Registrar resultados' })).toHaveAttribute('href', `/laboratorio/coletas/${id}/resultados`);
  await expect(page.getByRole('button', { name: 'Validar Coleta' })).toBeDisabled();
});

test('report exports a real PDF and opens the print preview', async ({ page }, info) => {
  await fixture(page, String(info.project.use.baseURL));
  await page.goto(`/laudos-lab/${id}`);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar PDF' }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toMatch(/^laudo-QA-LAUDO-001.*\.pdf$/);
  expect((await readFile((await file.path())!)).subarray(0, 4).toString()).toBe('%PDF');
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Imprimir Laudo' }).click();
  const preview = await opened;
  const pdf = preview.locator('iframe[title="Pré-visualização do laudo em PDF"]');
  await expect(pdf).toBeVisible();
  expect(await pdf.getAttribute('src')).toMatch(/^blob:/);
  await preview.close();
});

test('lab worklist has valid semantic nesting', async ({ page }, info) => {
  const nestingWarnings: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error' && message.text().includes('validateDOMNesting')) nestingWarnings.push(message.text());
  });
  const data = await fixture(page, String(info.project.use.baseURL));
  data.sample.urgente = true;
  await page.goto('/laudos-lab');
  await expect(page.getByRole('heading', { name: 'Laudos Laboratoriais' })).toBeVisible();
  expect(nestingWarnings).toEqual([]);
});

test('finance cannot access report workspace', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'financeiro' });
  await page.goto(`/laudos-lab/${id}`);
  await expect(page.getByText('Acesso Negado', { exact: true })).toBeVisible();
});
