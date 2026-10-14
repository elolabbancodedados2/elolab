import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('admin solo vincula o perfil médico à mesma conta e grava disponibilidade', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, manageDoctors: true });
  const duplicateKeyWarnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('children with the same key')) {
      duplicateKeyWarnings.push(message.text());
    }
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/onboarding');

  await expect(page.getByRole('heading', { name: 'Prepare sua clínica para atender' })).toBeVisible();
  await expect(page.getByText('1 de 4 etapas essenciais concluídas')).toBeVisible();
  await expect(page.getByText('1 usuário ativo com função de acesso')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Equipe e acessos/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Gerenciar equipe' })).toHaveAttribute('href', '/equipe?aba=funcionarios');
  await page.screenshot({ path: testInfo.outputPath('onboarding-team-access-1280x800.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: testInfo.outputPath('onboarding-team-access-1440x900.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByText('Opcional', { exact: true })).toBeVisible();
  await expect(page.getByText(/aceite o convite com esta mesma conta/)).toBeVisible();
  await page.getByRole('link', { name: 'Configurar disponibilidade' }).click();
  await expect(page).toHaveURL(/\/equipe\?aba=medicos$/);

  await page.getByRole('button', { name: 'Novo Médico' }).click();
  await page.getByLabel('Nome Completo').fill('Ana Médica QA');
  await page.getByRole('textbox', { name: 'E-mail', exact: true }).fill('qa-admin@elolab.test');
  await page.getByLabel(/Número/).fill('12345');
  await page.getByRole('button', { name: 'Cadastrar Médico' }).click();

  await expect.poll(() => synthetic.invites.length).toBe(1);
  expect(synthetic.invites[0]).toEqual({ email: 'qa-admin@elolab.test', roles: ['medico'] });
  await expect(page.getByText('Ana Médica QA')).toBeVisible();

  await page.goto('/aceitar-convite?token=synthetic-solo-doctor-invite');
  await expect(page.getByRole('heading', { name: 'Bem-vindo(a) à Equipe!' })).toBeVisible();
  await expect(page.getByText(/Esta conta já está conectada/)).toBeVisible();
  await expect(page.getByLabel('Senha')).toHaveCount(0);
  await page.getByRole('button', { name: 'Aceitar convite com esta conta' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/equipe?aba=medicos');
  await expect(page.getByText('Ana Médica QA')).toBeVisible();
  await page.getByRole('button', { name: 'Editar médico Ana Médica QA' }).click();
  await expect(page.getByRole('heading', { name: 'Horários de Disponibilidade — Ana Médica QA' })).toBeVisible();

  await page.getByRole('button', { name: 'Adicionar novo horário' }).click();
  await page.getByLabel('Dia da semana').selectOption('1');
  await page.getByLabel('Horário de início').fill('08:00');
  await page.getByLabel('Horário de término').fill('12:00');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();

  await expect(page.getByText('Disponibilidade adicionada')).toBeVisible();
  await expect(page.getByText('Segunda-feira')).toBeVisible();
  await expect(page.getByText('08:00 — 12:00 (30 min por consulta + 5 min de intervalo)')).toBeVisible();
  expect(synthetic.writes.some((write) => write.includes('/rest/v1/medicos'))).toBe(true);
  expect(synthetic.writes.some((write) => write.includes('/rest/v1/medico_disponibilidade'))).toBe(true);
  expect(synthetic.writes.some((write) => write.includes('/rest/v1/funcionarios'))).toBe(true);
  expect(synthetic.writes.some((write) => write.includes('/functions/v1/invite-employee'))).toBe(true);
  expect(synthetic.writes.some((write) => write.includes('/functions/v1/accept-invite'))).toBe(true);
  expect(synthetic.requests.some((request) => request.includes('POST /auth/v1/signup'))).toBe(false);
  expect(synthetic.requests.some((request) => request.includes('POST /auth/v1/token'))).toBe(false);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(duplicateKeyWarnings).toEqual([]);
});
