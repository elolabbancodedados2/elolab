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
  for (const viewport of [
    { width: 1280, height: 800, name: 'desktop' },
    { width: 390, height: 844, name: 'mobile' },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/minha-fila');
    const main = page.locator('#main-content');
    const nextTask = main.getByRole('region', { name: 'Próxima tarefa' });
    await expect(nextTask).toBeVisible();
    const nextTaskSurface = await nextTask.evaluate(element => {
      const style = getComputedStyle(element);
      const channels = style.backgroundColor.match(/\d+/g)?.map(Number) ?? [];
      const luminance = channels.slice(0, 3).reduce((sum, channel, index) => {
        const value = channel / 255;
        const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        return sum + linear * [0.2126, 0.7152, 0.0722][index];
      }, 0);
      return { backgroundImage: style.backgroundImage, luminance };
    });
    expect(nextTaskSurface.backgroundImage).toBe('none');
    expect(nextTaskSurface.luminance).toBeLessThan(0.1);
    await expect(main.getByRole('navigation', { name: 'Ir para seção da fila' }).getByRole('button')).toHaveCount(5);
    await expect.poll(() => main.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/personal-tasks-${viewport.name}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/minha-fila');
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
