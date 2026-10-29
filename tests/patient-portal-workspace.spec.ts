import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('portal autenticado leva aos registros certos e marca contagens parciais sem esconder contexto', async ({ page }, testInfo) => {
  const actions: Array<Record<string, unknown>> = [];
  let holdInitialExams = true;
  let failExams = true;
  let releaseInitialExams: (() => void) | null = null;
  let notifyInitialExams: (() => void) | null = null;
  const initialExamsGate = new Promise<void>(resolve => { releaseInitialExams = resolve; });
  const initialExamsReadStarted = new Promise<void>(resolve => { notifyInitialExams = resolve; });
  const dateOnly = (offsetDays: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return date.toISOString().slice(0, 10);
  };
  const exames = Array.from({ length: 30 }, (_, index) => ({
    id: `exame-${index + 1}`,
    tipo_exame: index === 0 ? 'Hemograma sintético' : `Exame sintético ${index + 1}`,
    status: index === 0 ? 'solicitado' : index === 1 ? 'laudo_disponivel' : 'concluido',
    data_solicitacao: dateOnly(-2),
    data_realizacao: index === 1 ? dateOnly(-1) : null,
    resultado: index === 1 ? 'Resultado sintético liberado' : null,
    arquivo_resultado: null,
  }));
  const agendamento = {
    id: 'consulta-futura-qa',
    medico_id: 'medico-qa',
    data: dateOnly(7),
    hora_inicio: '10:30:00',
    hora_fim: '11:00:00',
    tipo: 'Consulta de rotina',
    status: 'agendado',
    medicos: { nome: 'Dra. Marina Ribeiro', especialidade: 'Clínica geral' },
  };

  await page.route('http://127.0.0.1:54321/functions/v1/patient-portal', async route => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    actions.push(request);
    if (request.action === 'get_exames' && holdInitialExams) {
      holdInitialExams = false;
      notifyInitialExams?.();
      await initialExamsGate;
    }
    if (request.action === 'get_exames' && failExams) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Falha sintética ao consultar exames' }) });
      return;
    }
    const responses: Record<string, unknown> = {
      get_profile: { id: 'paciente-qa', nome: 'Ana Paciente', telefone: '11999990000', email: 'ana@example.test', alergias: [] },
      get_agendamentos: [agendamento],
      get_exames: exames,
      get_pagamentos: [],
      get_prescricoes: [],
      get_medicos: [{ id: 'medico-qa', nome: 'Dra. Marina Ribeiro', especialidade: 'Clínica geral' }],
      get_retornos: [],
      get_waitlist_offers: [],
      get_documentos: [],
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responses[String(request.action)] ?? []),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/portal-paciente');
  const essentialCookies = page.getByRole('button', { name: 'Apenas Essenciais' });
  await expect(essentialCookies).toBeVisible();
  await essentialCookies.click();
  await page.getByRole('textbox', { name: 'Código de acesso do paciente' }).fill('codigo-sintetico-valido');
  await page.getByRole('button', { name: 'Acessar Portal' }).click();
  await initialExamsReadStarted;
  await expect(page.getByText('Carregando suas consultas, exames e documentos…')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('patient-portal-workspace-loading-mobile.png'), animations: 'disabled' });
  releaseInitialExams?.();

  await expect(page.getByRole('heading', { name: /Olá, Ana/ })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Algumas informações não puderam ser carregadas');
  const unavailableExamsShortcut = page.getByRole('button', { name: /Abrir exames pendentes; dados indisponíveis/ });
  await expect(unavailableExamsShortcut).toBeVisible();
  await unavailableExamsShortcut.click();
  await expect(page.getByRole('tab', { name: 'Exames' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Exames' }).getByRole('status')).toContainText('Não foi possível carregar seus exames e laudos');
  await expect(page.getByText('Nenhum exame encontrado')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('patient-portal-workspace-exam-error-mobile.png'), animations: 'disabled' });
  failExams = false;
  await page.getByRole('alert').getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('Hemograma sintético')).toBeVisible();
  await expect(page.getByText('Consulta de rotina').first()).toBeVisible();
  const consultasShortcut = page.getByRole('button', { name: /Abrir consultas futuras/ });
  await expect(consultasShortcut).toContainText('1');
  await consultasShortcut.click();
  await expect(page.getByRole('tab', { name: 'Consultas' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Consultas' }).getByText('Consulta de rotina')).toBeVisible();

  const examesShortcut = page.getByRole('button', { name: /Abrir exames pendentes/ });
  await expect(examesShortcut).toContainText('1+');
  await expect(examesShortcut).toContainText('Há mais exames no histórico');
  await examesShortcut.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: 'Exames' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Hemograma sintético')).toBeVisible();
  await expect(page.getByText('Resultado sintético liberado')).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('patient-portal-workspace-mobile.png'), fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole('tab', { name: 'Exames' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('patient-portal-workspace-desktop.png'), fullPage: true, animations: 'disabled' });
  expect(actions.map(action => action.action)).toEqual(expect.arrayContaining([
    'get_profile', 'get_agendamentos', 'get_exames', 'get_documentos',
  ]));
});
