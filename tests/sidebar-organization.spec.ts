import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('grupos do menu organizam as rotinas administrativas no desktop', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false });
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  const navigation = page.getByRole('navigation', { name: 'Menu principal', exact: true });
  const clinicManagement = navigation.getByRole('button', { name: 'Gestão da clínica' });
  await expect(clinicManagement).toBeVisible({ timeout: 20_000 });
  await clinicManagement.focus();
  await page.keyboard.press('Enter');
  await expect(navigation.getByRole('link', { name: 'Médicos e funcionários' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Estoque', exact: true })).toBeVisible();

  await navigation.getByRole('button', { name: 'Comunicação e automação' }).click();
  await expect(navigation.getByRole('link', { name: 'Chat interno' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Automações da clínica' })).toBeVisible();

  await navigation.getByRole('button', { name: 'Relatórios e indicadores' }).click();
  await expect(navigation.getByRole('link', { name: 'Risco de faltas' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('sidebar-organization-desktop.png'), fullPage: true });
});

test('menu reorganizado continua acessível no celular', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false });
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Abrir menu de navegação' }).click();

  const navigation = page.getByRole('navigation', { name: 'Menu principal mobile' });
  await expect(navigation).toBeVisible({ timeout: 20_000 });
  await navigation.getByRole('button', { name: 'Gestão da clínica' }).click();
  await expect(navigation.getByRole('link', { name: 'Higienização de salas' })).toBeVisible();
  await navigation.getByRole('button', { name: 'Comunicação e automação' }).click();
  await expect(navigation.getByRole('link', { name: 'Chat interno' })).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath('sidebar-organization-mobile.png'), fullPage: true });
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasHorizontalOverflow).toBe(false);
});
