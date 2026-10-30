import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('acesso assistido a clínica usa página própria, preserva a busca e registra motivo', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: true, platformOnly: true });
  const clinic = {
    clinica_id: '00000000-0000-4000-8000-000000000401',
    clinica_nome: 'Clínica QA Norte',
    owner_id: '00000000-0000-4000-8000-000000000402',
    owner_nome: 'Administração QA',
    owner_email: 'admin.qa@example.test',
    created_at: '2026-09-10T12:00:00.000Z',
    suspensa: false,
    plano_slug: 'elolab-max',
    plano_nome: 'EloLab Max',
    assinatura_status: 'ativa',
    em_trial: false,
    trial_fim: null,
    data_fim: null,
    total_medicos: 3,
    total_funcionarios: 5,
    total_pacientes: 84,
    total_agendamentos: 200,
    arquivada: false,
  };
  const rpcCalls: unknown[] = [];

  await page.route('http://127.0.0.1:54321/rest/v1/rpc/platform_get_clinicas_overview', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([clinic]) });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/platform_start_impersonation', async route => {
    rpcCalls.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/clinicas', { waitUntil: 'domcontentloaded' });
  const search = page.getByPlaceholder('Buscar por clínica, dono ou plano...');
  await expect(search).toBeVisible({ timeout: 15000 });
  await search.fill('Clínica QA Norte');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/admin/clinicas/acesso');
  await expect(page.getByRole('heading', { name: 'Acesso assistido' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(clinic.clinica_nome)).toBeVisible();
  await expect(page.getByText('Você acessará dados reais da clínica')).toBeVisible();
  await expect(page).not.toHaveURL(new RegExp(clinic.clinica_id));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('platform-clinic-assisted-access-desktop.png'), fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('platform-clinic-assisted-access-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.getByLabel('Motivo do acesso (5 a 500 caracteres)').fill('Chamado #QA-142: recepção não consegue abrir a agenda da clínica.');
  const enter = page.getByRole('button', { name: 'Entrar na clínica' });
  await enter.scrollIntoViewIfNeeded();
  const navigation = page.getByRole('navigation', { name: 'Navegação principal' });
  const [enterBox, navigationBox] = await Promise.all([enter.boundingBox(), navigation.boundingBox()]);
  expect(enterBox && navigationBox && enterBox.y + enterBox.height <= navigationBox.y, JSON.stringify({ enterBox, navigationBox })).toBe(true);

  await page.getByRole('button', { name: 'Voltar às clínicas' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Descartar e sair' }).click();
  await expect(page).toHaveURL('/admin/clinicas');
  await expect(page.getByPlaceholder('Buscar por clínica, dono ou plano...')).toHaveValue('Clínica QA Norte');

  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByLabel('Motivo do acesso (5 a 500 caracteres)').fill('Chamado #QA-142: recepção não consegue abrir a agenda da clínica.');
  await page.getByRole('button', { name: 'Entrar na clínica' }).click();
  await expect(page).toHaveURL('/dashboard');
  expect(rpcCalls).toEqual([{ _target_clinica_id: clinic.clinica_id, _motivo: 'Chamado #QA-142: recepção não consegue abrir a agenda da clínica.' }]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
