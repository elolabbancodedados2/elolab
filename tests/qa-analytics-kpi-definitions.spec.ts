import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('exibe fórmula, fonte e janela temporal nos KPIs do painel', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, analyticsPopulated: true });

  await page.goto('/analytics');
  await expect(page.getByRole('heading', { name: 'Indicadores da clínica' })).toBeVisible();
  const definitions = page.getByTestId('analytics-kpi-definition');
  await expect(definitions).toHaveCount(8);
  await definitions.first().locator('summary').click();
  await expect(definitions.first()).toContainText('Consultas finalizadas divididas pelo total');
  await expect(definitions.first()).toContainText('Agendamentos');
  await expect(definitions.first()).toContainText('horário de São Paulo');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
