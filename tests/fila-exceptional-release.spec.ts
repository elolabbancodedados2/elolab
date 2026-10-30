import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const appointmentId = '00000000-0000-4000-9000-000000000010';
const clinicId = '00000000-0000-4000-8000-000000000002';

async function installReleaseData(page: import('@playwright/test').Page, type: 'pagamento' | 'triagem') {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  let written: Record<string, unknown> | null = null;
  await page.route('http://127.0.0.1:54321/rest/v1/agendamentos**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET' && url.searchParams.get('id') === `eq.${appointmentId}`) {
      return route.fulfill({ status: 200, json: [{
        id: appointmentId, clinica_id: clinicId, data: today, hora_inicio: '09:30:00', status: 'aguardando',
        exige_pagamento_previo: true, liberado_sem_pagamento: false,
        exige_triagem: true, liberado_sem_triagem: false,
        pacientes: { nome: 'Ana Souza', nome_social: null }, medicos: { nome: 'Dra. Marina Ribeiro' },
      }] });
    }
    if (route.request().method() === 'PATCH') {
      written = route.request().postDataJSON() as Record<string, unknown>;
      if (type === 'pagamento') written.liberado_sem_pagamento = true;
      else written.liberado_sem_triagem = true;
      return route.fulfill({ status: 200, headers: { 'content-range': '0-0/1' }, json: [{ id: appointmentId }] });
    }
    return route.fallback();
  });
  await page.route('http://127.0.0.1:54321/rest/v1/clinicas**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET' && url.searchParams.get('id') === `eq.${clinicId}`) {
      return route.fulfill({ status: 200, json: { id: clinicId, exigir_pagamento_previo: true, exigir_triagem: true } });
    }
    return route.fallback();
  });
  await page.route('http://127.0.0.1:54321/rest/v1/fila_atendimento**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET' && url.searchParams.get('agendamento_id') === `eq.${appointmentId}`) {
      return route.fulfill({ status: 200, json: [{
        id: '00000000-0000-4000-9000-000000000060', clinica_id: clinicId,
        agendamento_id: appointmentId, status: 'aguardando', cobranca_estado: 'confirmada', updated_at: new Date().toISOString(),
      }] });
    }
    return route.fallback();
  });
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/verificar_pagamento_fila', async route => {
    await route.fulfill({ status: 200, json: [{ agendamento_id: appointmentId, pode_atender: false }] });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/listar_agendamentos_com_triagem', async route => {
    await route.fulfill({ status: 200, json: [] });
  });
  return () => written;
}

test('payment exception has a responsive page, clear effects and a clinic-scoped write', async ({ page }, info) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'admin' });
  const getWritten = await installReleaseData(page, 'pagamento');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/fila/${appointmentId}/liberacao/pagamento`);
  const main = page.getByTestId('fila-exceptional-release-page');
  await expect(main.getByRole('heading', { name: 'Liberação excepcional' })).toBeVisible();
  await expect(main.getByText('Ana Souza')).toBeVisible();
  await expect(main.getByText(/não registra pagamento, quita a cobrança nem altera valores financeiros/)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('fila-liberacao-mobile.png'), fullPage: true, animations: 'disabled' });

  await page.getByLabel(/Motivo/).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('fila-liberacao-mobile-form.png'), animations: 'disabled' });
  await page.getByLabel(/Motivo/).fill('Urgência assistencial');
  await page.getByRole('button', { name: 'Registrar liberação' }).scrollIntoViewIfNeeded();
  const submitBox = await page.getByRole('button', { name: 'Registrar liberação' }).boundingBox();
  expect(submitBox).not.toBeNull();
  expect(submitBox!.y + submitBox!.height).toBeLessThan(844 - 56);
  await page.getByRole('button', { name: 'Registrar liberação' }).click();
  await expect(page).toHaveURL('/fila');
  expect(getWritten()).toMatchObject({
    liberado_sem_pagamento: true,
    liberado_sem_pagamento_por: '00000000-0000-4000-8000-000000000001',
    motivo_liberacao: 'Urgência assistencial',
  });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('triage exception states the clinical effect and remains usable on desktop', async ({ page }, info) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'medico' });
  const getWritten = await installReleaseData(page, 'triagem');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/fila/${appointmentId}/liberacao/triagem`);
  const main = page.getByTestId('fila-exceptional-release-page');
  await expect(main.getByText(/não cria sinais vitais nem substitui uma avaliação clínica/)).toBeVisible();
  await expect(main.getByRole('button', { name: 'Registrar liberação' })).toBeDisabled();
  await page.getByLabel(/Motivo/).fill('Triagem indisponível no plantão');
  await page.screenshot({ path: info.outputPath('fila-liberacao-desktop.png'), fullPage: true, animations: 'disabled' });
  await main.getByRole('button', { name: 'Registrar liberação' }).click();
  await expect(page).toHaveURL('/fila');
  expect(getWritten()).toMatchObject({
    liberado_sem_triagem: true,
    liberado_sem_triagem_por: '00000000-0000-4000-8000-000000000001',
    liberado_sem_triagem_motivo: 'Triagem indisponível no plantão',
  });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
