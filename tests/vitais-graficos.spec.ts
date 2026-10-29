import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const pacienteId = '00000000-0000-4000-8000-000000000004';
const agora = new Date();
const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
const antigo = new Date(agora.getTime() - 45 * 24 * 60 * 60 * 1000);
const triagens = [
  {
    id: 'vital-old', paciente_id: pacienteId, agendamento_id: null, pressao_arterial: '120/80',
    frequencia_cardiaca: 72, frequencia_respiratoria: 16, temperatura: 36.7, peso: 68.2,
    altura: 1.68, imc: 24.2, saturacao: 98, glicemia: 92, dor_escala: 0,
    data_hora: antigo.toISOString(), created_at: antigo.toISOString(),
  },
  {
    id: 'vital-recent', paciente_id: pacienteId, agendamento_id: null, pressao_arterial: '182/122',
    frequencia_cardiaca: 145, frequencia_respiratoria: 18, temperatura: 36.8, peso: 68.4,
    altura: 1.68, imc: 24.2, saturacao: 92, glicemia: 98, dor_escala: 1,
    data_hora: ontem.toISOString(), created_at: ontem.toISOString(),
  },
];

async function abrirHistorico(page: Page, registros: typeof triagens, options: {
  triagemError?: boolean;
  delayMs?: number;
  retryState?: { allowRecovery: boolean };
} = {}) {
  await installSyntheticClinic(page, { platformAdmin: false, role: 'medico', prontuarioPopulated: true });
  await page.route('**/rest/v1/triagens*', async route => {
    if (options.triagemError && !options.retryState?.allowRecovery) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Falha sintética de consulta' }) });
      return;
    }
    if (options.delayMs) await new Promise(resolve => setTimeout(resolve, options.delayMs));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': `0-${Math.max(registros.length - 1, 0)}/${registros.length}` },
      body: JSON.stringify(registros),
    });
  });
  await page.route('**/rest/v1/prontuarios*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/0' }, body: '[]' });
  });
  await page.route('**/rest/v1/rpc/registrar_visualizacao_historico_paciente*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '0' });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/vitais-graficos');
  const main = page.locator('#main-content');
  await main.getByRole('combobox').click();
  await page.getByPlaceholder('Buscar paciente...').fill('Pessoa Exemplo');
  await page.getByRole('option', { name: /Pessoa Exemplo QA/ }).click();
  return main;
}

test('sinais vitais comunicam alertas sem seleção visual arbitrária e preservam foco e filtros', async ({ page }, testInfo) => {
  const main = await abrirHistorico(page, triagens);
  await expect(main.getByRole('heading', { name: 'Últimos valores' })).toBeVisible();
  const frequencia = main.getByRole('button', { name: /Freq. cardíaca/ });
  await expect(frequencia).toContainText('Alterado');
  await expect(frequencia).toHaveAttribute('aria-pressed', 'false');
  await expect(frequencia).toHaveClass(/bg-destructive\/5/);
  const neutralTemperature = main.getByRole('button', { name: /Temperatura/ });
  await expect(neutralTemperature).toBeDisabled();
  await expect(neutralTemperature).not.toHaveClass(/bg-primary text-primary-foreground/);

  await frequencia.focus();
  await page.screenshot({ path: testInfo.outputPath('vitals-alert-and-keyboard-1280.png'), fullPage: true, animations: 'disabled' });
  await page.keyboard.press('Enter');
  await expect(frequencia).toHaveAttribute('aria-pressed', 'true');
  await expect(main.getByText(/de 2 medições/)).toBeVisible();

  await main.getByRole('button', { name: /^7 dias/ }).click();
  await expect(main.getByText(/1 de 2 medições/)).toBeVisible();
  await main.getByRole('button', { name: /Limpar filtros/ }).click();
  await expect(main.getByText(/2 de 2 medições/)).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(main.getByRole('heading', { name: 'Últimos valores' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('vitals-history-390.png'), fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('sinais vitais explicam histórico vazio e oferecem caminho para o prontuário', async ({ page }) => {
  const main = await abrirHistorico(page, []);
  await expect(main.getByText('Nenhuma medição encontrada')).toBeVisible();
  await expect(main.getByRole('link', { name: /Abrir prontuário/ })).toBeVisible();
});

test('sinais vitais mostram carregamento durante uma consulta lenta', async ({ page }) => {
  const main = await abrirHistorico(page, triagens, { delayMs: 900 });
  await expect(main.getByRole('status')).toContainText('Carregando o histórico clínico');
  await expect(main.getByRole('heading', { name: 'Últimos valores' })).toBeVisible();
});

test('sinais vitais apresentam erro de consulta e ação para tentar novamente', async ({ page }) => {
  const retryState = { allowRecovery: false };
  const main = await abrirHistorico(page, [], { triagemError: true, retryState });
  await expect(main.getByText('Não foi possível carregar os sinais vitais')).toBeVisible();
  retryState.allowRecovery = true;
  await main.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(main.getByText('Nenhuma medição encontrada')).toBeVisible();
});
