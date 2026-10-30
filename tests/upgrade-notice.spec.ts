import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('aviso da atualização fica no topo sem interromper o trabalho com modal', async ({ page }, testInfo) => {
  await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL) });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  const notice = page.getByRole('complementary', { name: 'Atualização do EloLab' });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Nova versão no ar em');
  await expect(notice.locator('time')).toHaveAttribute('datetime', '2026-11-10');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('elolab-announcement-seen:')))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('upgrade-notice-mobile.png'), fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(notice).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('upgrade-notice-desktop.png'), fullPage: true, animations: 'disabled' });
});
