import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const versionId = '00000000-0000-4000-9000-000000000901';

test('versão histórica do prompt tem página própria somente de leitura', async ({ page }, testInfo) => {
  await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL) });
  const prompt = 'PROMPT_SINTETICO_VERSAO_3\n' + Array.from({ length: 100 }, (_, index) => `Linha ${index + 1}: instrução operacional de teste.`).join('\n');
  await page.route('**/rest/v1/platform_ai_prompt_versions*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: versionId, versao: 3, prompt, modelo: 'claude-test', criado_por: null, created_at: '2026-10-30T12:00:00Z' }]),
    });
  });

  await page.goto('/admin/ia', { waitUntil: 'domcontentloaded' });
  const historyHeading = page.getByRole('heading', { name: 'Versões recentes do prompt' });
  await historyHeading.scrollIntoViewIfNeeded();
  await page.getByRole('link', { name: 'Ver prompt da versão 3' }).click();
  await expect(page).toHaveURL(`/admin/ia/versoes/${versionId}`);
  await expect(page.getByRole('heading', { name: 'Prompt da versão 3' })).toBeVisible();
  await expect(page.getByText('PROMPT_SINTETICO_VERSAO_3')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).not.toContainText(versionId);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('platform-ai-prompt-version-desktop.png'), fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('platform-ai-prompt-version-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Prompt da versão 3' })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar à IA' }).click();
  await expect(page).toHaveURL('/admin/ia');
});

test('detalhe histórico do prompt não é liberado a usuários sem acesso de plataforma', async ({ page }, testInfo) => {
  await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false });
  await page.goto(`/admin/ia/versoes/${versionId}`, { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(`/admin/ia/versoes/${versionId}`);
  await expect(page.getByRole('heading', { name: /Prompt da versão/ })).toHaveCount(0);
});
