import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const clinicId = '00000000-0000-4000-8000-000000000001';
const patientId = '00000000-0000-4000-8000-000000000004';
const token = 'a'.repeat(64);

function patientRow(active: boolean) {
  return {
    id: patientId,
    clinica_id: clinicId,
    nome: 'Pessoa Exemplo QA',
    nome_social: null,
    cpf: '000.000.000-00',
    telefone: '(11) 90000-0000',
    email: 'pessoa.qa@example.test',
    data_nascimento: '1990-05-14',
    sexo: 'nao_informado',
    convenio_id: null,
    ativo: active,
  };
}

async function installPortalFixtures(page: import('@playwright/test').Page, appOrigin: string, role = 'recepcao') {
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role });
  let active = true;
  await page.route('**/rest/v1/rpc/buscar_pacientes_paginado*', async route => {
    const request = route.request().postDataJSON() as { p_status?: string; p_termo?: string };
    const matchesStatus = request.p_status === 'todos' || (request.p_status === 'inativos' ? !active : active);
    const matchesTerm = !request.p_termo || 'pessoa exemplo qa'.includes(request.p_termo.toLocaleLowerCase());
    await route.fulfill({ status: 200, json: matchesStatus && matchesTerm ? [patientRow(active)] : [], headers: { 'content-range': '0-0/1' } });
  });
  await page.route('**/rest/v1/pacientes*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const idFilter = url.searchParams.get('id') ?? '';
    if (request.method() === 'GET' && (idFilter === `eq.${patientId}` || idFilter.includes(patientId))) {
      const row = patientRow(active);
      await route.fulfill({ status: 200, json: idFilter.startsWith('in.') ? [row] : row });
      return;
    }
    return route.fallback();
  });
  return {
    synthetic,
    setActive(value: boolean) { active = value; },
  };
}

test('geração do Portal tem página própria e mantém token fora da URL e do armazenamento', async ({ page }, testInfo) => {
  const fixtures = await installPortalFixtures(page, String(testInfo.project.use.baseURL));
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const writes: Array<Record<string, unknown>> = [];
  await page.route('**/rest/v1/rpc/link_portal_paciente', async route => {
    writes.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 200, json: `https://app.elolab.com.br/portal-paciente?token=${token}` });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/pacientes', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('textbox', { name: 'Buscar pacientes por nome, CPF, telefone ou e-mail' })).toBeVisible({ timeout: 20000 });
  await page.getByRole('textbox', { name: 'Buscar pacientes por nome, CPF, telefone ou e-mail' }).fill('Pessoa');
  await page.getByRole('button', { name: 'Gerar link do portal para Pessoa Exemplo QA' }).click();

  await expect(page).toHaveURL(`/pacientes/${patientId}/portal/link`);
  await expect(page.getByRole('heading', { name: 'Acesso ao Portal do Paciente', exact: true })).toBeVisible();
  await expect(page.getByText('A emissão substitui o link anterior')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Gerar e substituir link anterior' })).toBeEnabled();
  expect(page.url()).not.toContain('token=');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('patient-portal-link-mobile-before.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: testInfo.outputPath('patient-portal-link-desktop-before.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.getByRole('button', { name: 'Gerar e substituir link anterior' }).click();
  const linkField = page.getByRole('textbox', { name: 'Link de acesso ao portal do paciente' });
  await expect(linkField).toHaveValue(`https://app.elolab.com.br/portal-paciente?token=${token}`);
  await expect(page.getByText(/Link gerado e copiado/)).toBeVisible();
  expect(page.url()).not.toContain(token);
  const persisted = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, history: history.state }));
  expect(persisted).not.toContain(token);
  expect(writes).toEqual([{ p_paciente_id: patientId }]);
  expect(fixtures.synthetic.assertAllWritesAreMocked()).toBe(true);
  await page.locator('#main-content').evaluate(element => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }));
  const [backBox, copyBox, mobileNavigationBox] = await Promise.all([
    page.getByRole('button', { name: 'Voltar à ficha' }).last().boundingBox(),
    page.getByRole('button', { name: 'Copiar novamente' }).boundingBox(),
    page.locator('nav').last().boundingBox(),
  ]);
  expect(backBox && copyBox && mobileNavigationBox).toBeTruthy();
  expect(backBox!.y + backBox!.height <= mobileNavigationBox!.y).toBe(true);
  expect(copyBox!.y + copyBox!.height <= mobileNavigationBox!.y).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('patient-portal-link-mobile-actions.png'), animations: 'disabled' });

  await page.reload();
  await expect(page.getByRole('button', { name: 'Gerar e substituir link anterior' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Link de acesso ao portal do paciente' })).toHaveCount(0);
  expect(writes).toHaveLength(1);
  expect(page.url()).not.toContain('token=');
  expect(pageErrors).toEqual([]);
});

test('perfil médico não pode gerar link do Portal', async ({ page }, testInfo) => {
  const fixtures = await installPortalFixtures(page, String(testInfo.project.use.baseURL), 'medico');
  await page.goto(`/pacientes/${patientId}/portal/link`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Acesso Negado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gerar e substituir link anterior' })).toHaveCount(0);
  expect(fixtures.synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('paciente inativo não recebe novo link do Portal', async ({ page }, testInfo) => {
  const fixtures = await installPortalFixtures(page, String(testInfo.project.use.baseURL));
  fixtures.setActive(false);
  await page.route('**/rest/v1/rpc/link_portal_paciente', async route => {
    await route.fulfill({ status: 400, json: { code: '23514', message: 'Não é possível gerar link do portal para paciente inativo.' } });
  });

  await page.goto(`/pacientes/${patientId}/portal/link`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Paciente inativo' })).toBeVisible();
  await expect(page.locator('#main-content').getByRole('button', { name: 'Gerar link do Portal' })).toHaveCount(0);
  expect(fixtures.synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('ficha indisponível oferece retorno à lista sem emitir link', async ({ page }, testInfo) => {
  await installPortalFixtures(page, String(testInfo.project.use.baseURL));
  await page.route('**/rest/v1/pacientes*', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET' && url.searchParams.get('id') === `eq.${patientId}`) {
      await route.fulfill({ status: 200, json: null });
      return;
    }
    return route.fallback();
  });

  await page.goto(`/pacientes/${patientId}/portal/link`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Paciente indisponível' })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(page).toHaveURL('/pacientes');
  expect(page.url()).not.toContain('token=');
});
