import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

async function setup(page: Parameters<typeof installSyntheticClinic>[0], appOrigin: string) {
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: true, platformOnly: true });
  const updateCalls: unknown[] = [];
  const clinic = {
    clinica_id: synthetic.clinicId,
    clinica_nome: 'Clínica Horizonte',
    created_at: '2026-10-20T12:00:00.000Z',
    stage: 'configuration',
    owner_id: synthetic.userId,
    next_action: 'Revisar cadastro inicial',
    due_at: '2026-11-10T23:59:59.999Z',
    team_size: 2,
    has_config: true,
    has_services: false,
    has_activity: false,
    readiness: 48,
  };

  await page.route('http://127.0.0.1:54321/rest/v1/rpc/platform_onboarding_overview', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clinics: [clinic] }) });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/platform_update_onboarding', async route => {
    updateCalls.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/platform_admins*', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('select') === 'user_id,nivel') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ user_id: synthetic.userId, nivel: 'owner' }]) });
      return;
    }
    await route.fallback();
  });
  await page.route('http://127.0.0.1:54321/rest/v1/profiles*', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('select') === 'id,nome,email') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: synthetic.userId, nome: 'Admin EloLab', email: 'admin@elolab.test' }]) });
      return;
    }
    await route.fallback();
  });

  return { synthetic, clinic, updateCalls };
}

test('onboarding edita o plano em página própria, preserva filtros e salva no RPC existente', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const { synthetic, clinic, updateCalls } = await setup(page, appOrigin);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/onboarding');
  await expect(page.getByText('Clínica Horizonte')).toBeVisible();

  const search = page.getByRole('textbox', { name: 'Buscar onboarding' });
  await search.fill('Horizonte');
  await page.getByRole('button', { name: 'Atualizar plano' }).click();
  await expect(page).toHaveURL(`/admin/onboarding/${clinic.clinica_id}`);
  await expect(page.getByRole('heading', { name: 'Plano de ativação' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('platform-onboarding-workspace-desktop.png'), fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const saveButton = page.getByRole('button', { name: 'Salvar acompanhamento' });
  await saveButton.scrollIntoViewIfNeeded();
  const navigation = page.getByRole('navigation', { name: 'Navegação principal' });
  const [saveBox, navigationBox] = await Promise.all([saveButton.boundingBox(), navigation.boundingBox()]);
  expect(saveBox && navigationBox && saveBox.y + saveBox.height <= navigationBox.y, JSON.stringify({ saveBox, navigationBox })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('platform-onboarding-workspace-mobile.png'), fullPage: true, animations: 'disabled' });

  await page.getByLabel('Etapa').click();
  await page.getByRole('option', { name: 'Em operação' }).click();
  await page.getByLabel('Próxima ação').fill('Concluir configuração dos serviços');
  await page.getByLabel('Prazo para acompanhamento').fill('2026-12-30');
  await page.getByRole('button', { name: 'Salvar acompanhamento' }).click();

  await expect(page).toHaveURL('/admin/onboarding');
  await expect(page.getByRole('textbox', { name: 'Buscar onboarding' })).toHaveValue('Horizonte');
  expect(updateCalls).toEqual([{
    p_clinica_id: clinic.clinica_id,
    p_stage: 'operational',
    p_next_action: 'Concluir configuração dos serviços',
    p_due_at: expect.any(String),
    p_owner_id: synthetic.userId,
  }]);

  await page.getByRole('button', { name: 'Atualizar plano' }).click();
  await page.getByLabel('Próxima ação').fill('Nova alteração depois do primeiro salvamento');
  await page.getByRole('button', { name: 'Voltar à lista' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Descartar e sair' }).click();
  await expect(page).toHaveURL('/admin/onboarding');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('onboarding protege alterações não salvas ao sair da página própria', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const { synthetic, clinic } = await setup(page, appOrigin);
  await page.goto(`/admin/onboarding/${clinic.clinica_id}`);
  await page.getByLabel('Próxima ação').fill('Ação alterada ainda não salva');
  await page.getByRole('button', { name: 'Voltar à lista' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('platform-onboarding-unsaved-guard.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Continuar nesta página' }).click();
  await expect(page).toHaveURL(`/admin/onboarding/${clinic.clinica_id}`);

  await page.getByRole('button', { name: 'Voltar à lista' }).click();
  await page.getByRole('button', { name: 'Descartar e sair' }).click();
  await expect(page).toHaveURL('/admin/onboarding');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
