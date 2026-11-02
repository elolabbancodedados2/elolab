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
  await expect(page.getByText('Não foi possível salvar o paciente', { exact: true })).toBeVisible();
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
  await page.getByRole('complementary', { name: 'Resumo de Pessoa Exemplo QA' }).getByRole('button', { name: 'Abrir ficha', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/pacientes/${patientId}$`));
  await expect(page.getByRole('heading', { name: 'Ficha do paciente', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // As abas da ficha rolam na horizontal dentro do próprio contêiner; a última precisa continuar alcançável.
    const tabs = page.locator('#main-content').getByRole('tablist');
    await expect(tabs.locator('xpath=..')).toHaveCSS('overflow-x', 'auto');
    const lastTab = tabs.getByRole('tab').last();
    await lastTab.scrollIntoViewIfNeeded();
    await expect(lastTab).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`patient-detail-${width}.png`) });
  }
  await page.getByRole('button', { name: '← Voltar à lista', exact: true }).click();
  await expect(search).toHaveValue('Pessoa');
  await page.goto(`/pacientes?paciente=${patientId}&tab=endereco`);
  await expect(page).toHaveURL(new RegExp(`/pacientes/${patientId}\\?tab=endereco$`));
  // O endereço passou para a aba Dados; o link antigo continua abrindo a seção certa.
  await expect(page.getByRole('tab', { name: 'Dados', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('patient consent registration and revocation use dedicated responsive pages', async ({ page }, info) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  const consents: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/consentimentos_lgpd*', async route => {
    const method = route.request().method();
    if (method === 'GET') {
      return route.fulfill({ json: consents, headers: { 'content-range': `0-${Math.max(consents.length - 1, 0)}/${consents.length}` } });
    }
    if (method === 'POST') {
      const consent = {
        ...route.request().postDataJSON(),
        id: `00000000-0000-4000-9000-0000000000${15 + consents.length}`,
        clinica_id: '00000000-0000-4000-8000-000000000002',
        revogado: false,
        data_revogacao: null,
        updated_at: new Date().toISOString(),
      };
      consents.push(consent);
      return route.fulfill({ status: 201, json: [consent], headers: { 'content-range': '0-0/1' } });
    }
    if (method === 'PATCH') {
      const id = new URL(route.request().url()).searchParams.get('id')?.replace(/^eq\./, '');
      const index = consents.findIndex(item => item.id === id);
      expect(index).toBeGreaterThanOrEqual(0);
      consents[index] = { ...consents[index], ...route.request().postDataJSON(), updated_at: new Date().toISOString() };
      return route.fulfill({ status: 200, json: [consents[index]], headers: { 'content-range': '0-0/1' } });
    }
    return route.fallback();
  });

  await page.goto(`/pacientes/${patientId}?tab=lgpd`);
  // A LGPD passou para a aba "Documentos e LGPD"; ?tab=lgpd continua valendo.
  await expect(page.getByRole('tab', { name: 'Documentos e LGPD', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Novo Consentimento' }).click();
  await expect(page).toHaveURL(new RegExp(`/pacientes/${patientId}/consentimentos/novo$`));
  await expect(page.getByRole('heading', { name: 'Novo consentimento', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`consent-page-${width}.png`), fullPage: true });
    if (width === 390) {
      const submit = page.getByRole('button', { name: 'Registrar Consentimento' });
      await submit.scrollIntoViewIfNeeded();
      const submitBox = await submit.boundingBox();
      const bottomNavBox = await page.locator('nav').last().boundingBox();
      expect(submitBox && bottomNavBox && submitBox.y + submitBox.height < bottomNavBox.y).toBe(true);
      await page.screenshot({ path: info.outputPath('consent-page-mobile-footer.png') });
    }
  }

  await page.getByRole('checkbox', { name: /Comunicações e Marketing/ }).click();
  // Sem o tratamento de dados aceito, os demais consentimentos não podem ser registrados.
  await page.getByRole('button', { name: 'Registrar Consentimento' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Tratamento de Dados Pessoais' }).first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/pacientes/${patientId}/consentimentos/novo$`));
  expect(consents).toHaveLength(0);
  await page.getByRole('checkbox', { name: /Tratamento de Dados Pessoais/ }).click();
  await page.getByRole('button', { name: 'Registrar Consentimento' }).click();
  await expect(page).toHaveURL(new RegExp(`/pacientes/${patientId}\\?tab=lgpd$`));
  expect(consents.map(item => item.tipo_consentimento).sort()).toEqual(['comunicacao_marketing', 'tratamento_dados']);
  const marketingRow = page.locator('div.border.rounded-lg').filter({ hasText: 'Comunicações e Marketing' });
  await expect(marketingRow.getByRole('button', { name: 'Revogar' })).toBeVisible();
  await marketingRow.getByRole('button', { name: 'Revogar' }).click();
  await expect(page).toHaveURL(new RegExp(`/pacientes/${patientId}/consentimentos/comunicacao_marketing/revogar$`));
  await page.getByLabel('Motivo da revogação').fill('Solicitação do paciente');
  await page.getByRole('button', { name: 'Confirmar Revogação' }).click();
  await expect(page).toHaveURL(new RegExp(`/pacientes/${patientId}\\?tab=lgpd$`));
  await expect(page.getByText('Revogado', { exact: true })).toBeVisible();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('nursing can view a patient but cannot open the editing form', async ({ page }, info) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'enfermagem' });
  await page.goto(`/pacientes/${patientId}/editar`);
  await expect(page.getByRole('heading', { name: 'Cadastro indisponível para seu perfil' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(0);
  await page.goto(`/pacientes/${patientId}`);
  await expect(page.getByRole('heading', { name: 'Ficha do paciente', exact: true })).toBeVisible();
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
