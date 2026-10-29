import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('impede ativar modelo com variável incompatível e mostra prévia sintética', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin });
  const template = {
    id: '00000000-0000-4000-8000-000000000891',
    clinica_id: synthetic.clinicId,
    nome: 'Aniversário QA',
    categoria: 'aniversario',
    assunto: 'Parabéns, {{paciente_nome}}',
    conteudo: '<p>Feliz aniversário, {{paciente_nome}}. Consulta: {{data}}</p>',
    ativo: false,
    tipo: 'email',
    variaveis: ['paciente_nome', 'data'],
  };
  await page.route('http://127.0.0.1:54321/rest/v1/notification_templates*', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([template]) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: template.id }]) });
  });

  await page.goto('/todos-templates?tab=email');
  await page.getByRole('button', { name: 'Ativar modelo Aniversário QA' }).click();
  await expect(page.getByRole('heading', { name: 'Prévia antes de ativar' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('{{data}}');
  await expect(page.getByRole('button', { name: 'Ativar modelo', exact: true })).toBeDisabled();
  await expect(page.getByText('Parabéns, João Silva')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 960 });
  await page.screenshot({ path: '.qa-artifacts/email-templates-20261029/activation-390.png' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('ativa modelo válido somente depois de abrir e confirmar a prévia', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin });
  const template = {
    id: '00000000-0000-4000-8000-000000000892',
    clinica_id: synthetic.clinicId,
    nome: 'Lembrete 24h QA',
    categoria: 'lembrete_consulta',
    assunto: 'Consulta de {{paciente_nome}}',
    conteudo: '<p>Dia {{data}} às {{horario}}.</p>',
    ativo: false,
    tipo: 'email',
    variaveis: ['paciente_nome', 'data', 'horario'],
  };
  const writes: unknown[] = [];
  await page.route('http://127.0.0.1:54321/rest/v1/notification_templates*', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([template]) });
      return;
    }
    writes.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: template.id }]) });
  });

  await page.goto('/todos-templates?tab=email');
  await page.getByRole('button', { name: 'Ativar modelo Lembrete 24h QA' }).click();
  await expect(page.getByRole('button', { name: 'Ativar modelo', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Ativar modelo', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ ativo: true });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
