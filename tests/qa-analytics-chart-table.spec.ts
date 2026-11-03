import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
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

test('gráficos e CSV incluem o primeiro dia dos 30 dias selecionados', async ({ page }) => {
  await installSyntheticClinic(page, { today: '2026-11-03' });
  await page.clock.install({ time: new Date('2026-11-03T15:00:00-03:00') });
  await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
  await page.route('**/rest/v1/agendamentos?*', route => {
    if (!new URL(route.request().url()).searchParams.get('select')?.includes('medicos(nome,especialidade)')) return route.fallback();
    return route.fulfill({ json: [
      { id: 'a1', data: '2026-10-05', status: 'finalizado', medico_id: 'medico', medicos: { nome: 'Médico QA', especialidade: 'Clínica geral' } },
    ] });
  });
  await page.route('**/rest/v1/lancamentos?*', route => route.fulfill({ json: [
    { id: 'l1', tipo: 'receita', status: 'pago', data: '2026-10-05', data_pagamento: '2026-10-05', valor: 1234.56, valor_pago: 1234.56, agendamento_id: 'a1', forma_pagamento: 'pix' },
  ] }));
  await page.goto('/analytics');
  const appointments = page.locator('details').filter({ has: page.locator('button[aria-label="Exportar tabela Agendamentos por dia"]') });
  await appointments.locator('summary').click();
  await expect(appointments.locator('tbody tr')).toHaveCount(30);
  await expect(appointments.locator('tbody tr').first()).toContainText('05');
  await expect(appointments.locator('tbody tr').first().getByRole('cell').last()).toHaveText('1');
  await page.getByRole('tab', { name: 'Financeiro', exact: true }).click();
  const cashflow = page.locator('details').filter({ has: page.locator('button[aria-label="Exportar tabela Fluxo de caixa"]') });
  await cashflow.locator('summary').click();
  await expect(cashflow.locator('tbody tr')).toHaveCount(30);
  await expect(cashflow.locator('tbody tr').first()).toContainText('1.234,56');
  const downloadPromise = page.waitForEvent('download');
  await cashflow.getByRole('button', { name: 'Exportar tabela Fluxo de caixa' }).click();
  const download = await downloadPromise;
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain('05/10/2026 a 03/11/2026');
  expect(csv).toContain('"05/10";"1234.56";"0";"1234.56"');
});
