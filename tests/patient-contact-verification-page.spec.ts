import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const patientId = '00000000-0000-4000-8000-000000000004';
const patient = {
  id: patientId,
  nome: 'Pessoa Exemplo QA',
  nome_social: null,
  telefone: '(11) 90000-0000',
  email: 'pessoa.qa@example.test',
  telefone_confirmado_em: null,
  telefone_confirmacao_origem: null,
  email_confirmado_em: null,
  email_confirmacao_origem: null,
  ativo: true,
  clinica_id: '00000000-0000-4000-8000-000000000001',
};

async function installContactPatient(page: import('@playwright/test').Page, appOrigin: string, role = 'recepcao') {
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role });
  const currentPatient = { ...patient };
  await page.route('**/rest/v1/pacientes*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.searchParams.get('id') === `eq.${patientId}`) {
      await route.fulfill({ status: 200, json: currentPatient });
      return;
    }
    return route.fallback();
  });
  return { synthetic, currentPatient };
}

test('confirma telefone em página própria e retorna à ficha com a origem registrada', async ({ page }, testInfo) => {
  const { synthetic, currentPatient } = await installContactPatient(page, String(testInfo.project.use.baseURL));
  const writes: Array<Record<string, unknown>> = [];
  await page.route('**/rest/v1/rpc/registrar_confirmacao_contato_paciente', async route => {
    writes.push(route.request().postDataJSON() as Record<string, unknown>);
    const confirmadoEm = new Date().toISOString();
    currentPatient.telefone_confirmado_em = confirmadoEm;
    currentPatient.telefone_confirmacao_origem = 'responsavel';
    await route.fulfill({ status: 200, json: { canal: 'telefone', confirmado_em: confirmadoEm, origem: 'responsavel' } });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/pacientes/${patientId}?tab=dados`);
  await page.getByRole('button', { name: 'Confirmar telefone' }).click();

  await expect(page).toHaveURL(`/pacientes/${patientId}/contatos/telefone/confirmar`);
  await expect(page.getByRole('heading', { name: 'Confirmar telefone', exact: true })).toBeVisible();
  await expect(page.getByText('(11) 90000-0000')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Ficha do paciente');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('patient-contact-verification-mobile.png'), fullPage: true, animations: 'disabled' });

  await page.getByRole('combobox', { name: 'Confirmado com *' }).click();
  await page.getByRole('option', { name: 'Responsável' }).click();
  const submit = page.getByRole('button', { name: 'Registrar confirmação' });
  const cancel = page.getByRole('button', { name: 'Cancelar' });
  await page.locator('#main-content').evaluate(element => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }));
  await expect(cancel).toBeInViewport();
  await expect(submit).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('patient-contact-verification-mobile-actions.png'), animations: 'disabled' });
  const [submitBox, cancelBox, mobileNavigationBox] = await Promise.all([
    submit.boundingBox(),
    cancel.boundingBox(),
    page.locator('nav').last().boundingBox(),
  ]);
  expect(submitBox && cancelBox && mobileNavigationBox).toBeTruthy();
  expect(submitBox!.y + submitBox!.height <= mobileNavigationBox!.y).toBe(true);
  expect(cancelBox!.y + cancelBox!.height <= mobileNavigationBox!.y).toBe(true);
  await page.getByRole('button', { name: 'Registrar confirmação' }).click();

  await expect(page).toHaveURL(`/pacientes/${patientId}?tab=dados`);
  await expect(page.getByRole('button', { name: 'Confirmar telefone' })).toBeVisible();
  await expect(page.getByText(/Confirmado em .*Responsável/)).toBeVisible();
  expect(writes).toEqual([{ p_paciente_id: patientId, p_canal: 'telefone', p_origem: 'responsavel' }]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('falha ao registrar confirmação mantém a origem e explica o erro', async ({ page }, testInfo) => {
  await installContactPatient(page, String(testInfo.project.use.baseURL));
  await page.route('**/rest/v1/rpc/registrar_confirmacao_contato_paciente', async route => {
    await route.fulfill({ status: 400, json: { code: '23514', message: 'Canal ou origem de confirmação inválidos.' } });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/pacientes/${patientId}/contatos/email/confirmar`);
  await expect(page.getByRole('heading', { name: 'Confirmar e-mail', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Confirmado com *' }).click();
  await page.getByRole('option', { name: 'Equipe consultou o cadastro' }).click();
  await page.screenshot({ path: testInfo.outputPath('patient-contact-verification-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Registrar confirmação' }).click();

  await expect(page).toHaveURL(`/pacientes/${patientId}/contatos/email/confirmar`);
  await expect(page.getByRole('alert')).toContainText('A confirmação foi recusada. Revise o canal e a origem escolhida; nenhum dado foi alterado.');
  await expect(page.getByRole('combobox', { name: 'Confirmado com *' })).toContainText('Equipe consultou o cadastro');
});

test('perfil médico não acessa a confirmação administrativa do contato', async ({ page }, testInfo) => {
  const { synthetic } = await installContactPatient(page, String(testInfo.project.use.baseURL), 'medico');
  await page.goto(`/pacientes/${patientId}/contatos/telefone/confirmar`);
  await expect(page.getByRole('heading', { name: 'Acesso Negado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar confirmação' })).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('página bloqueia confirmação se o contato não estiver cadastrado', async ({ page }, testInfo) => {
  await installContactPatient(page, String(testInfo.project.use.baseURL));
  await page.route('**/rest/v1/pacientes*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.searchParams.get('id') === `eq.${patientId}`) {
      await route.fulfill({ status: 200, json: { ...patient, email: null } });
      return;
    }
    return route.fallback();
  });

  await page.goto(`/pacientes/${patientId}/contatos/email/confirmar`);
  await expect(page.getByRole('heading', { name: 'Contato não cadastrado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar confirmação' })).toHaveCount(0);
});
