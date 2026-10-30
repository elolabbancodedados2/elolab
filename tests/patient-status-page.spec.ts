import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const patientId = '00000000-0000-4000-8000-000000000004';

function patientRow(active: boolean) {
  return {
    id: patientId,
    nome: 'Pessoa Exemplo QA',
    nome_social: null,
    cpf: '000.000.000-00',
    telefone: '(00) 00000-0000',
    email: 'paciente.qa@example.test',
    data_nascimento: '1990-05-14',
    sexo: 'nao_informado',
    convenio_id: null,
    ativo: active,
  };
}

async function installPatientStatusFixtures(page: import('@playwright/test').Page, appOrigin: string) {
  await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
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
    if (request.method() === 'GET' && url.searchParams.get('select') === 'id,nome,ativo') {
      await route.fulfill({ status: 200, json: patientRow(active) });
      return;
    }
    return route.fallback();
  });
  return {
    get active() { return active; },
    set active(value: boolean) { active = value; },
  };
}

test('inativação tem página própria, preserva filtros/foco e registra motivo pela RPC', async ({ page }, testInfo) => {
  const state = await installPatientStatusFixtures(page, String(testInfo.project.use.baseURL));
  const statusWrites: Array<Record<string, unknown>> = [];
  await page.route('**/rest/v1/rpc/alterar_status_paciente', async route => {
    statusWrites.push(route.request().postDataJSON() as Record<string, unknown>);
    state.active = false;
    await route.fulfill({ status: 200, json: { ativo: false, alterado: true } });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/pacientes');
  const search = page.getByRole('textbox', { name: 'Buscar pacientes por nome, CPF, telefone ou e-mail' });
  await search.fill('Pessoa');
  await expect(page.getByRole('button', { name: 'Inativar Pessoa Exemplo QA' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('patient-status-list-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Inativar Pessoa Exemplo QA' }).click();

  await expect(page).toHaveURL(`/pacientes/${patientId}/status`);
  await expect(page.getByRole('heading', { name: 'Inativar paciente', exact: true })).toBeVisible();
  await expect(page.getByText('Novos agendamentos ficam bloqueados')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const submit = page.getByRole('button', { name: 'Inativar paciente', exact: true });
  await expect(submit).toBeDisabled();
  await page.getByRole('combobox', { name: 'Motivo administrativo *' }).click();
  await page.getByRole('option', { name: 'Solicitação do titular' }).click();
  await expect(submit).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('patient-status-page-mobile.png'), fullPage: true, animations: 'disabled' });
  await submit.scrollIntoViewIfNeeded();
  const [submitBox, navigationBox] = await Promise.all([submit.boundingBox(), page.locator('nav').last().boundingBox()]);
  expect(submitBox && navigationBox && submitBox.y + submitBox.height <= navigationBox.y).toBe(true);
  await submit.click();

  await expect(page).toHaveURL('/pacientes');
  await expect(search).toHaveValue('Pessoa');
  await expect(page.locator('#patient-list-region')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Inativar Pessoa Exemplo QA' })).toHaveCount(0);
  expect(statusWrites).toEqual([{
    p_paciente_id: patientId,
    p_ativo: false,
    p_motivo: 'solicitacao_titular',
  }]);
});

test('falha por consulta futura fica na página e orienta a recuperação', async ({ page }, testInfo) => {
  await installPatientStatusFixtures(page, String(testInfo.project.use.baseURL));
  let attempts = 0;
  await page.route('**/rest/v1/rpc/alterar_status_paciente', async route => {
    attempts += 1;
    await route.fulfill({
      status: 400,
      json: {
        code: '23514',
        message: 'Cancele ou conclua os agendamentos atuais e futuros antes de inativar este paciente.',
      },
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/pacientes/${patientId}/status`);
  await expect(page.getByRole('heading', { name: 'Inativar paciente', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('patient-status-page-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('combobox', { name: 'Motivo administrativo *' }).click();
  await page.getByRole('option', { name: 'Cadastro incorreto' }).click();
  await page.getByRole('button', { name: 'Inativar paciente', exact: true }).click();

  await expect(page).toHaveURL(`/pacientes/${patientId}/status`);
  await expect(page.getByRole('alert')).toContainText('Antes de inativar, cancele ou conclua os agendamentos atuais e futuros.');
  await expect(page.getByRole('combobox', { name: 'Motivo administrativo *' })).toContainText('Cadastro incorreto');
  expect(attempts).toBe(1);
});

test('enfermagem não acessa alteração administrativa de status', async ({ page }, testInfo) => {
  await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false, role: 'enfermagem' });
  await page.goto(`/pacientes/${patientId}/status`);
  await expect(page.getByRole('heading', { name: 'Acesso Negado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inativar paciente', exact: true })).toHaveCount(0);
});
