import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const dateAfter = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

async function enterPortal(page: import('@playwright/test').Page, query = '', expectedHeading: RegExp = /Olá, Ana/) {
  await page.goto(`/portal-paciente${query}`);
  const essentialCookies = page.getByRole('button', { name: 'Apenas Essenciais' });
  if (await essentialCookies.isVisible()) await essentialCookies.click();
  await page.getByRole('textbox', { name: 'Código de acesso do paciente' }).fill('codigo-sintetico-valido');
  await page.getByRole('button', { name: 'Acessar Portal' }).click();
  await expect(page.getByRole('heading', { name: expectedHeading })).toBeVisible();
}

test('remarcar consulta usa uma página própria, mantém o contrato e não expõe a seleção na URL', async ({ page }, testInfo) => {
  const requests: Array<Record<string, unknown>> = [];
  const appointment = {
    id: 'consulta-qa-privada',
    medico_id: 'medico-qa-privado',
    data: dateAfter(7),
    hora_inicio: '10:30:00',
    hora_fim: '11:00:00',
    tipo: 'Consulta sintética',
    status: 'agendado',
    medicos: { nome: 'Dra. Marina Teste', especialidade: 'Clínica geral' },
  };

  await page.route('http://127.0.0.1:54321/functions/v1/patient-portal', async route => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(request);
    let response: unknown = [];
    switch (request.action) {
      case 'get_profile':
        response = { id: 'paciente-qa-privado', nome: 'Ana Paciente', telefone: '', email: '', alergias: [] };
        break;
      case 'get_agendamentos': response = [appointment]; break;
      case 'get_medicos': response = [{ id: appointment.medico_id, nome: 'Dra. Marina Teste', especialidade: 'Clínica geral' }]; break;
      case 'get_available_slots': response = ['09:30', '10:00']; break;
      case 'get_remarcacao_limite': response = { limite: dateAfter(60) }; break;
      case 'reschedule_agendamento':
        appointment.data = String(request.nova_data);
        appointment.hora_inicio = `${String(request.novo_horario)}:00`;
        response = { success: true };
        break;
      default: response = [];
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await enterPortal(page, '?origem=teste');
  await page.getByRole('button', { name: 'Remarcar' }).click();

  await expect(page).toHaveURL(/origem=teste.*tela=reagendar/);
  await expect(page.getByRole('heading', { name: 'Remarcar consulta' })).toBeVisible();
  await expect(page.getByText(/Dra\. Marina Teste/)).toBeVisible();
  await expect(page).not.toHaveURL(/consulta-qa-privado|paciente-qa-privado|codigo-sintetico/);
  await page.screenshot({ path: testInfo.outputPath('patient-portal-reschedule-mobile.png'), fullPage: true, animations: 'disabled' });

  const newDate = dateAfter(14);
  await page.getByLabel('Nova data *').fill(newDate);
  await expect.poll(() => requests.some(request => request.action === 'get_available_slots')).toBe(true);
  const slotsRequest = requests.find(request => request.action === 'get_available_slots');
  expect(slotsRequest).toMatchObject({
    action: 'get_available_slots',
    medico_id: appointment.medico_id,
    data_inicio: newDate,
    data_fim: newDate,
    agendamento_id: 'consulta-qa-privada',
  });
  await page.getByLabel('Horário disponível *').selectOption('09:30');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 1280);
  const cookieNotice = page.getByRole('button', { name: 'Apenas Essenciais' });
  if (await cookieNotice.isVisible()) await cookieNotice.click();
  await page.screenshot({ path: testInfo.outputPath('patient-portal-reschedule-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Confirmar novo horário' }).click();

  await expect(page.getByRole('status')).toContainText(/Consulta remarcada para/);
  await expect(page).toHaveURL(/\/portal-paciente\?origem=teste$/);
  expect(requests.find(request => request.action === 'reschedule_agendamento')).toMatchObject({
    agendamento_id: 'consulta-qa-privada',
    nova_data: newDate,
    novo_horario: '09:30',
  });
  await expect(page.getByText('09:30').first()).toBeVisible();
});

test('remarcar retorno mantém a confirmação do horário com a clínica e recupera falha ao atualizar', async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];
  const retorno = {
    id: 'retorno-qa-privado',
    data_retorno_prevista: dateAfter(10),
    motivo: 'Acompanhamento sintético',
    status: 'pendente',
  };
  let failReturnRefresh = false;

  await page.route('http://127.0.0.1:54321/functions/v1/patient-portal', async route => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(request);
    if (request.action === 'get_retornos' && failReturnRefresh) {
      failReturnRefresh = false;
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'falha de rede sintética' }) });
      return;
    }
    let response: unknown = [];
    switch (request.action) {
      case 'get_profile': response = { id: 'paciente-qa', nome: 'Ana Paciente', telefone: '', email: '', alergias: [] }; break;
      case 'get_retornos': response = [retorno]; break;
      case 'reschedule_retorno':
        retorno.data_retorno_prevista = String(request.nova_data);
        failReturnRefresh = true;
        response = { success: true };
        break;
      default: response = [];
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await enterPortal(page, '?origem=teste');
  await page.getByRole('button', { name: 'Remarcar' }).click();
  await expect(page.getByRole('heading', { name: 'Remarcar retorno' })).toBeVisible();
  await expect(page.getByText('A clínica poderá confirmar o horário.')).toBeVisible();
  await expect(page).not.toHaveURL(/retorno-qa-privado|paciente-qa/);

  const newDate = dateAfter(18);
  await page.getByLabel('Nova data *').fill(newDate);
  await page.getByRole('button', { name: 'Confirmar nova data' }).click();

  await expect(page.getByRole('status')).toContainText(/Retorno remarcado para/);
  await expect(page.getByRole('alert')).toContainText(/Retorno remarcado, mas não foi possível atualizar a lista/);
  await expect(page).toHaveURL(/\/portal-paciente\?origem=teste$/);
  await expect(page.getByText(`${newDate.slice(8, 10)}/${newDate.slice(5, 7)}/${newDate.slice(0, 4)}`, { exact: true })).toBeVisible();
  expect(requests.find(request => request.action === 'reschedule_retorno')).toMatchObject({
    retorno_id: 'retorno-qa-privado',
    nova_data: newDate,
  });
});

test('abrir a etapa de reagendamento sem seleção mostra recuperação segura', async ({ page }) => {
  await page.route('http://127.0.0.1:54321/functions/v1/patient-portal', async route => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    const response = request.action === 'get_profile'
      ? { id: 'paciente-qa', nome: 'Ana Paciente', telefone: '', email: '', alergias: [] }
      : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });

  await page.setViewportSize({ width: 320, height: 720 });
  await enterPortal(page, '?tela=reagendar', /Remarcar consulta/);
  const essentialCookies = page.getByRole('button', { name: 'Apenas Essenciais' });
  if (await essentialCookies.isVisible()) await essentialCookies.click();
  await expect(page.getByRole('heading', { name: 'Remarcar consulta' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Por segurança, a seleção não fica salva no endereço');
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320);
  await expect(page).not.toHaveURL(/patient|appointment|codigo-sintetico/);
});
