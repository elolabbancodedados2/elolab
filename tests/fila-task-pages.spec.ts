import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const clinicId = '00000000-0000-4000-8000-000000000002';
const queueId = '00000000-0000-4000-9000-000000000062';

test('queue removal is a responsive, clinic-scoped page with a recorded reason', async ({ page }, info) => {
  const synthetic = await installSyntheticClinic(page, {
    appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'admin', queuePopulated: true,
  });
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  let removalPayload: Record<string, unknown> | null = null;
  await page.route('http://127.0.0.1:54321/rest/v1/fila_atendimento**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET' && url.searchParams.get('id') === `eq.${queueId}`) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        id: queueId, agendamento_id: '00000000-0000-4000-9000-000000000012', clinica_id: clinicId,
        status: 'em_atendimento', prioridade: 'normal', horario_chegada: new Date().toISOString(),
        agendamentos: {
          data: today, hora_inicio: '09:00:00', status: 'em_atendimento',
          pacientes: { nome: 'Carla Oliveira', nome_social: null }, medicos: { nome: 'Dra. Marina Ribeiro', crm: '000000' },
        },
      }) });
      return;
    }
    await route.fallback();
  });
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/remover_item_fila_com_motivo', async route => {
    removalPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ removido: true, atendimento_reaberto: true }) });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/fila?tab=fila');
  await page.getByRole('button', { name: 'Remover Carla Oliveira da fila' }).click();
  await expect(page).toHaveURL(new RegExp(`/fila/${queueId}/saida$`));
  await expect(page.getByRole('heading', { name: 'Remover paciente da fila' })).toBeVisible();
  await expect(page.getByText(/voltará para “aguardando”/)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('combobox', { name: 'Motivo da saída' }).click();
  await page.getByRole('option', { name: 'Paciente desistiu' }).click();
  const mobileAction = page.getByRole('button', { name: 'Confirmar remoção' });
  await mobileAction.scrollIntoViewIfNeeded();
  const mobileActionBox = await mobileAction.boundingBox();
  expect(mobileActionBox).not.toBeNull();
  expect(mobileActionBox!.y + mobileActionBox!.height).toBeLessThan(844 - 56);
  await page.screenshot({ path: info.outputPath('fila-remocao-mobile.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: info.outputPath('fila-remocao-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Confirmar remoção' }).click();

  await expect(page).toHaveURL('/fila?tab=fila');
  expect(removalPayload).toEqual({ p_fila_id: queueId, p_status_esperado: 'em_atendimento', p_motivo: 'paciente_desistiu' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('shift handoff is a page with a manually selectable snapshot', async ({ page }, info) => {
  await installSyntheticClinic(page, {
    appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'admin', queuePopulated: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/fila');
  await page.getByRole('button', { name: 'Passagem de turno' }).click();
  await expect(page).toHaveURL('/fila/passagem');
  const summary = page.getByRole('textbox', { name: 'Resumo operacional da passagem de turno' });
  await expect(summary).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('fila-passagem-mobile.png'), fullPage: true, animations: 'disabled' });
  await summary.focus();
  await expect(summary).toHaveJSProperty('selectionStart', 0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: info.outputPath('fila-passagem-desktop.png'), fullPage: true, animations: 'disabled' });
});
