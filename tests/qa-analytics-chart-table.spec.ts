import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('abre tabela acessível do gráfico e exporta com período e filtros', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, analyticsPopulated: true });

  await page.goto('/analytics');
  const tableDetails = page.locator('details').filter({ hasText: 'Ver dados em tabela' }).first();
  await tableDetails.locator('summary').click();
  await expect(tableDetails).toContainText('Período:');
  await expect(tableDetails).toContainText('Filtros:');
  await expect(tableDetails).toContainText('horário de São Paulo');
  await expect(tableDetails.getByRole('table', { name: /Agendamentos por dia/ })).toBeVisible();
  await expect(tableDetails.getByRole('columnheader', { name: 'Agendamentos' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await tableDetails.getByRole('button', { name: 'Exportar tabela Agendamentos por dia' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('agendamentos-por-dia.csv');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
