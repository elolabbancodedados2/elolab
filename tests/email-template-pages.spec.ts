import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const clinic = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-9000-000000000151';
const template = { id, clinica_id: clinic, nome: 'Mensagem QA', categoria: 'aniversario', assunto: 'Olá {{paciente_nome}}', conteudo: '<p>Texto QA {{paciente_nome}}</p>', ativo: false, tipo: 'email', variaveis: ['paciente_nome'], updated_at: '2026-10-29T10:00:00Z' };
async function mock(page: Page) {
  await page.route('**/rest/v1/notification_templates*', route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
    return route.fulfill({ json: !params.has('id') || params.get('id') === `eq.${id}` ? [template] : [] });
  });
}
for (const width of [1440, 768, 390]) {
  test(`email editor at ${width}px protects changes and preserves synthetic preview`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
    await mock(page);
    await page.setViewportSize({ width, height: 960 });
    await page.goto(`/todos-templates/email/${id}/editar`);
    await expect(page.getByLabel('Nome', { exact: true })).toHaveValue(template.nome);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByLabel('Conteúdo (HTML)').fill('<p>Alteração QA {{paciente_nome}}</p>');
    await page.screenshot({ path: `.qa-artifacts/email-templates-20261029/editor-${width}.png` });
    await page.getByRole('tab', { name: 'Preview', exact: true }).click();
    await expect(page.getByText('Alteração QA João Silva', { exact: true })).toBeVisible();
    await page.screenshot({ path: `.qa-artifacts/email-templates-20261029/preview-${width}.png` });
    const save = page.getByRole('button', { name: 'Atualizar', exact: true });
    await save.evaluate(element => element.scrollIntoView({ block: 'center' }));
    const box = await save.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(width < 1024 ? 900 : 960);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL('/todos-templates?tab=email');
    await expect(page.getByRole('heading', { name: 'Templates de e-mail', exact: true })).toBeVisible();
  });
}

test('email version conflict retains form and successful retry restores list filters', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let writes = 0;
  await page.route('**/rest/v1/notification_templates*', route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    writes++;
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('id')).toBe(`eq.${id}`);
    expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
    expect(params.get('updated_at')).toBe(`eq.${template.updated_at}`);
    expect(route.request().postDataJSON()).toMatchObject({ nome: template.nome, assunto: 'Assunto alterado QA', ativo: false });
    return route.fulfill({ json: writes === 1 ? [] : [{ id }] });
  });
  await page.goto('/todos-templates?tab=email');
  await page.getByLabel('Buscar modelos de e-mail').fill('Mensagem');
  await page.getByRole('button', { name: 'Editar modelo Mensagem QA', exact: true }).click();
  await page.getByLabel('Assunto', { exact: true }).fill('Assunto alterado QA');
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(page.getByText(/Este modelo foi alterado ou removido/)).toBeVisible();
  await expect(page.getByLabel('Assunto', { exact: true })).toHaveValue('Assunto alterado QA');
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(page).toHaveURL('/todos-templates?tab=email');
  await expect(page.getByLabel('Buscar modelos de e-mail')).toHaveValue('Mensagem');
  expect(writes).toBe(2);
});

test('email creation strips unsafe HTML and does not submit when inserting a variable', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let writes = 0;
  await page.route('**/rest/v1/notification_templates*', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes++;
    const body = route.request().postDataJSON()[0];
    expect(body).toMatchObject({ nome: 'Novo QA', categoria: 'aniversario', assunto: 'Parabéns', tipo: 'email', clinica_id: clinic });
    expect(body.conteudo).not.toContain('<script');
    expect(body.conteudo).not.toContain('onerror');
    expect(body.variaveis).toContain('paciente_nome');
    await new Promise(resolve => setTimeout(resolve, 250));
    return route.fulfill(writes === 1 ? { status: 400, json: { message: 'Falha sintética de salvamento' } } : { json: null });
  });
  await page.goto('/todos-templates/email/novo');
  await page.getByLabel('Nome', { exact: true }).fill('Novo QA');
  await page.getByLabel('Categoria', { exact: true }).selectOption('aniversario');
  await page.getByLabel('Assunto', { exact: true }).fill('Parabéns');
  await page.getByLabel('Conteúdo (HTML)').fill('<p>Texto QA</p><script>window.bad=true</script><img onerror="window.bad=true">');
  await page.getByRole('button', { name: 'paciente_nome', exact: true }).click();
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(page.getByLabel('Nome', { exact: true })).toBeDisabled();
  await expect(page.getByText('Falha sintética de salvamento', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(page).toHaveURL('/todos-templates?tab=email');
  expect(writes).toBe(2);
});

test('email history recovers errors, handles empty state and rejects unauthorized editors', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await mock(page);
  let fail = true;
  await page.route('**/rest/v1/notification_template_versions*', route => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
    expect(params.get('template_id')).toBe(`eq.${id}`);
    return route.fulfill(fail ? { status: 403, json: { message: 'Falha sintética do histórico' } } : { json: [] });
  });
  await page.goto(`/todos-templates/email/${id}/historico`);
  await expect(page.getByText('Não foi possível carregar o histórico', { exact: true })).toBeVisible({ timeout: 15000 });
  fail = false;
  await page.getByRole('button', { name: /Tentar novamente/ }).click();
  await expect(page.getByText('Nenhuma versão disponível para este modelo.', { exact: true })).toBeVisible();
  await page.goto('/todos-templates/email/ausente/editar');
  await expect(page.getByText(/Modelo indisponível nesta clínica/)).toBeVisible();
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'medico' });
  await page.goto('/todos-templates/email/novo');
  await expect(page.getByText('Acesso Negado', { exact: true })).toBeVisible();
});
