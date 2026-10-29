import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
test.setTimeout(60_000);
const patientId = '00000000-0000-4000-8000-000000000004';

for (const width of [1440, 768, 390]) {
  test(`patient registration uses a page at ${width}px and guards unsaved data`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/pacientes/novo');
    await expect(page.getByRole('heading', { name: 'Novo Paciente', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByLabel('Nome Completo').fill('Paciente sintético');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`patient-page-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Salvar', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`patient-page-footer-${width}.png`) });
    await page.getByRole('button', { name: 'Voltar à lista', exact: true }).click();
    await expect(page.getByRole('alertdialog', { name: 'Sair sem salvar?' })).toBeVisible();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByLabel('Nome Completo')).toHaveValue('Paciente sintético');
    await page.getByRole('button', { name: 'Voltar à lista', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL(/\/pacientes$/);
  });
}

test('patient page retains fields after failure and completes a real-shaped create request', async ({ page }, info) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  let fail = true;
  let writes = 0;
  await page.route('**/rest/v1/rpc/buscar_possiveis_duplicidades_paciente*', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/pacientes*', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes += 1;
    expect(route.request().postDataJSON()).toMatchObject({ nome: 'Paciente sintético', clinica_id: '00000000-0000-4000-8000-000000000002' });
    return route.fulfill(fail ? { status: 503, json: { message: 'Falha sintética' } } : { json: { id: patientId } });
  });
  await page.goto('/pacientes/novo');
  await page.getByLabel('Nome Completo').fill('Paciente sintético');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Erro ao salvar paciente', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Nome Completo')).toHaveValue('Paciente sintético');
  fail = false;
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL(/\/pacientes$/);
  expect(writes).toBe(2);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('patient detail has its own address, accepts legacy links and preserves lookup on return', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await page.goto('/pacientes');
  const search = page.getByRole('textbox', { name: 'Buscar pacientes por nome, CPF, telefone ou e-mail' });
  await search.fill('Pessoa');
  await page.getByRole('button', { name: 'Ver detalhes de Pessoa Exemplo QA', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/pacientes/${patientId}$`));
  await expect(page.getByRole('heading', { name: 'Ficha do Paciente', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const tabs = page.locator('#main-content').getByRole('tablist');
    expect(await tabs.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`patient-detail-${width}.png`) });
  }
  await page.getByRole('button', { name: '← Voltar à lista', exact: true }).click();
  await expect(search).toHaveValue('Pessoa');
  await page.goto(`/pacientes?paciente=${patientId}&tab=endereco`);
  await expect(page).toHaveURL(new RegExp(`/pacientes/${patientId}\\?tab=endereco$`));
  await expect(page.getByRole('tab', { name: 'Endereço', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('nursing can view a patient but cannot open the editing form', async ({ page }, info) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'enfermagem' });
  await page.goto(`/pacientes/${patientId}/editar`);
  await expect(page.getByRole('heading', { name: 'Cadastro indisponível para seu perfil' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(0);
  await page.goto(`/pacientes/${patientId}`);
  await expect(page.getByRole('heading', { name: 'Ficha do Paciente', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar cadastro', exact: true })).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('editing blocks saving until clinical data is loaded and offers recovery', async ({ page }, info) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  let fail = true;
  await page.route('**/rest/v1/paciente_comorbidades*', route => fail
    ? route.fulfill({ status: 503, json: { message: 'Falha sintética ao carregar comorbidades' } })
    : route.fulfill({ json: [] }));
  await page.goto(`/pacientes/${patientId}/editar`);
  await expect(page.getByText('Não foi possível preparar a ficha', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: /Tentar novamente/ }).click();
  await expect(page.getByLabel('Nome Completo')).toHaveValue('Pessoa Exemplo QA');
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeEnabled();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
