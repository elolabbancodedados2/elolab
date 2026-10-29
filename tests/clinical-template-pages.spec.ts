import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
const clinic = '00000000-0000-4000-8000-000000000002';
const user = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-9000-000000000141';
const globalId = '00000000-0000-4000-9000-000000000142';
const shared = { id, clinica_id: clinic, criado_por: user, created_at: '2026-10-29T10:00:00Z', updated_at: '2026-10-29T10:00:00Z' };
const prescription = { ...shared, nome: 'Receita QA', tipo: 'simples', medicamentos: [{ medicamento: 'Medicamento QA', posologia: 'Revisar pelo profissional' }], observacoes_gerais: 'Orientação QA' };
const certificate = { ...shared, nome: 'Afastamento QA', tipo: 'afastamento', conteudo: 'Texto QA {{paciente}}', cid: 'QA', dias_afastamento: 2 };
async function mock(page: Page) {
  for (const [table, record] of [['templates_prescricao', prescription], ['templates_atestado', certificate]] as const) {
    await page.route(`**/rest/v1/${table}*`, route => {
      if (route.request().method() !== 'GET') return route.fallback();
      const params = new URL(route.request().url()).searchParams;
      if (params.has('id')) {
        expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
        return route.fulfill({ json: params.get('id') === `eq.${id}` ? [record] : [] });
      }
      return route.fulfill({ json: [record, { ...record, id: globalId, nome: 'Modelo global QA', clinica_id: null }] });
    });
  }
}
for (const width of [1440, 768, 390]) {
  test(`clinical template editor preserves draft and fits ${width}px`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
    await mock(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/todos-templates/atestados/${id}/editar`);
    await expect(page.getByLabel('Nome do modelo *')).toHaveValue(certificate.nome);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByLabel('Conteúdo do Atestado *').fill('Revisão QA');
    await page.screenshot({ path: info.outputPath(`clinical-template-${width}.png`) });
    const save = page.getByRole('button', { name: 'Salvar modelo', exact: true });
    await save.evaluate(element => element.scrollIntoView({ block: 'center' }));
    await expect.poll(async () => { const b = await save.boundingBox(); return b ? b.y + b.height : Infinity; }).toBeLessThanOrEqual(width < 1024 ? 840 : 900);
    await page.screenshot({ path: info.outputPath(`clinical-template-footer-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByLabel('Conteúdo do Atestado *')).toHaveValue('Revisão QA');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL('/todos-templates');
    await expect(page.getByRole('button', { name: 'Editar modelo Afastamento QA', exact: true })).toBeVisible();
  });
}

test('prescription edits retain version, medications and list search after conflict', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'medico' });
  await mock(page);
  let writes = 0;
  await page.route('**/rest/v1/templates_prescricao*', route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    writes++;
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('id')).toBe(`eq.${id}`);
    expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
    expect(params.get('updated_at')).toBe(`eq.${shared.updated_at}`);
    expect(route.request().postDataJSON()).toMatchObject({ nome: prescription.nome, observacoes_gerais: 'Revisão QA' });
    expect(route.request().postDataJSON().medicamentos.length).toBeGreaterThan(0);
    return route.fulfill({ json: writes === 1 ? [] : [{ id }] });
  });
  await page.goto('/todos-templates');
  await page.getByLabel('Buscar templates de prescrição').fill('Receita');
  await page.getByRole('button', { name: 'Editar modelo Receita QA', exact: true }).click();
  await page.getByLabel('Observações Gerais').fill('Revisão QA');
  await page.getByRole('button', { name: 'Salvar modelo' }).click();
  await expect(page.getByText(/Este modelo foi alterado ou removido/)).toBeVisible();
  await expect(page.getByLabel('Observações Gerais')).toHaveValue('Revisão QA');
  await page.getByRole('button', { name: 'Salvar modelo' }).click();
  await expect(page).toHaveURL('/todos-templates');
  await expect(page.getByLabel('Buscar templates de prescrição')).toHaveValue('Receita');
  expect(writes).toBe(2);
});

test('certificate creation clears conditional clinical fields and recovers a failed save', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let writes = 0;
  await page.route('**/rest/v1/templates_atestado*', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes++;
    expect(route.request().postDataJSON()).toMatchObject({ nome: 'Novo QA', tipo: 'comparecimento', cid: null, dias_afastamento: null, conteudo: 'Texto QA {{paciente}}', clinica_id: clinic, criado_por: user });
    await new Promise(resolve => setTimeout(resolve, 250));
    return route.fulfill(writes === 1 ? { status: 400, json: { message: 'Falha sintética do modelo' } } : { json: null });
  });
  await page.goto('/todos-templates/atestados/novo');
  await page.getByLabel('Nome do modelo *').fill('Novo QA');
  await page.getByLabel('Tipo *', { exact: true }).click();
  await page.getByRole('option', { name: 'Afastamento', exact: true }).click();
  await page.getByLabel('Dias de Afastamento').fill('2');
  await page.getByLabel('CID', { exact: true }).fill('QA');
  await page.getByLabel('Tipo *', { exact: true }).click();
  await page.getByRole('option', { name: 'Comparecimento', exact: true }).click();
  await expect(page.getByLabel('CID', { exact: true })).toHaveCount(0);
  await page.getByLabel('Conteúdo do Atestado *').fill('Texto QA {{paciente}}');
  await page.getByRole('button', { name: 'Salvar modelo' }).click();
  await expect(page.getByLabel('Nome do modelo *')).toBeDisabled();
  await expect(page.getByText('Falha sintética do modelo', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Nome do modelo *')).toHaveValue('Novo QA');
  await page.getByRole('button', { name: 'Salvar modelo' }).click();
  await expect(page).toHaveURL('/todos-templates');
  expect(writes).toBe(2);
});

test('global templates cannot be edited directly and reception cannot open the editor', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  await page.goto(`/todos-templates/prescricoes/${globalId}/editar`);
  await expect(page.getByText(/Modelo indisponível para edição/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar modelo' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Voltar aos modelos' }).click();
  await expect(page.getByRole('button', { name: 'Editar modelo Modelo global QA' })).toHaveCount(0);
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'recepcao' });
  await page.goto('/todos-templates/atestados/novo');
  await expect(page.getByText('Acesso Negado', { exact: true })).toBeVisible();
});

test('template load error can be retried without exposing another clinic', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let fail = true;
  await page.route('**/rest/v1/templates_atestado*', route => fail ? route.fulfill({ status: 403, json: { message: 'Falha sintética de leitura' } }) : route.fallback());
  await page.goto(`/todos-templates/atestados/${id}/editar`);
  await expect(page.getByText('Não foi possível carregar o modelo', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Salvar modelo' })).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: /Tentar novamente/ }).click();
  await expect(page.getByLabel('Nome do modelo *')).toHaveValue(certificate.nome);
});
