import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('cadastro oferece canais, horário e fuso para os lembretes do paciente', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin });
  let savedPatient: Record<string, unknown> | null = null;
  await page.route('http://127.0.0.1:54321/rest/v1/pacientes*', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    savedPatient = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: '00000000-0000-4000-8000-000000000004' }]) });
  });

  await page.goto('/pacientes');
  await page.getByRole('button', { name: 'Novo Paciente' }).click();
  const dialog = page.locator('#main-content');
  await expect(dialog.getByRole('heading', { name: 'Novo Paciente' })).toBeVisible();

  const channel = dialog.locator('#paciente-canal-lembrete');
  await expect(channel).toContainText('E-mail e WhatsApp (quando cadastrados)');
  await channel.click();
  await page.getByRole('option', { name: 'Somente e-mail' }).click();
  await expect(channel).toContainText('Somente e-mail');

  await expect(dialog.locator('#paciente-inicio-contato')).toHaveValue('08:00');
  await expect(dialog.locator('#paciente-fim-contato')).toHaveValue('20:00');
  await dialog.locator('#paciente-nome').fill('Paciente QA sintético');
  await dialog.locator('#paciente-inicio-contato').fill('09:30');
  await expect(dialog.locator('#paciente-inicio-contato')).toHaveValue('09:30');
  await expect(dialog.locator('#paciente-fuso-contato')).toContainText('Brasília, São Paulo (UTC−03)');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => savedPatient).not.toBeNull();
  expect(savedPatient).toMatchObject({
    preferencia_canal_lembrete: 'email',
    horario_contato_inicio: '09:30',
    horario_contato_fim: '20:00',
    fuso_horario_contato: 'America/Sao_Paulo',
    clinica_id: synthetic.clinicId,
  });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
