import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('fila pessoal respeita o escopo da clínica, responsável e permite concluir com segurança', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, {
    role: 'recepcao',
    platformAdmin: false,
    personalTaskQueuePopulated: true,
  });

  await page.goto('/minha-fila');
  await expect(page.getByRole('heading', { name: 'Minha fila de trabalho' })).toBeVisible();
  await page.getByRole('button', { name: /Conta Online/ }).click();
  await expect(page.getByText('Clinic QA synthetic · Recepção')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(synthetic.requests.some((entry) => entry.startsWith('GET /rest/v1/clinicas?')
    && entry.includes(`id=eq.${synthetic.clinicId}`))).toBe(true);
  const overdueTasks = page.getByRole('region', { name: /^Atrasadas/ });
  await expect(overdueTasks.getByText('Confirmar retorno da pessoa QA')).toBeVisible();
  await expect(page.getByRole('region', { name: /^Para hoje/ }).getByText('Revisar pendência de hoje QA')).toBeVisible();
  await expect(page.getByText('Tarefa QA de outra pessoa')).toHaveCount(0);
  await expect(page.getByText('Tarefa QA de outra clínica')).toHaveCount(0);
  await expect(overdueTasks.getByRole('link', { name: 'Abrir paciente' })).toHaveAttribute('href', /\/pacientes\?paciente=/);

  await overdueTasks.getByRole('button', { name: 'Concluir tarefa Confirmar retorno da pessoa QA' }).click();
  await expect(page.getByRole('region', { name: /^Concluídas e canceladas/ }).getByText('Confirmar retorno da pessoa QA')).toBeVisible();

  const taskReads = synthetic.requests.filter((entry) => entry.startsWith('GET /rest/v1/tarefas?'));
  expect(taskReads.some((entry) => entry.includes(`clinica_id=eq.${synthetic.clinicId}`)
    && entry.includes(`responsavel_id=eq.${synthetic.userId}`))).toBe(true);
  const taskUpdates = synthetic.requests.filter((entry) => entry.startsWith('PATCH /rest/v1/tarefas?'));
  expect(taskUpdates.some((entry) => entry.includes(`clinica_id=eq.${synthetic.clinicId}`)
    && entry.includes(`responsavel_id=eq.${synthetic.userId}`)
    && entry.includes('updated_at=eq.'))).toBe(true);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
