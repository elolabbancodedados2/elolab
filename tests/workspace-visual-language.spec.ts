import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
for (const width of [1440, 768, 390]) {
  for (const route of ['/dashboard', '/agenda', '/estoque/novo', '/todos-templates/atestados/novo']) {
    test(`workspace ${route} at ${width}px`, async ({ page }, info) => {
      const fixture = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, agendaPopulated: true });
      await page.setViewportSize({ width, height: 960 });
      await page.goto(route);
      await expect(page.locator('main h1').first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByText('Verificando sua sessão')).toHaveCount(0);
      await page.screenshot({ path: `.qa-artifacts/visual-language-${process.env.QA_VISUAL_PHASE || 'after'}/${route.replaceAll('/', '_')}-${width}.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width < 1024) {
        await page.getByRole('button', { name: 'Mais seções', exact: true }).click();
        const menu = page.getByRole('navigation', { name: 'Menu principal mobile', exact: true });
        await expect(menu.getByLabel('Buscar no menu')).toBeVisible();
        await expect(menu.getByRole('button', { name: 'Recolher menu lateral' })).toHaveCount(0);
        await page.screenshot({ path: `.qa-artifacts/visual-language-${process.env.QA_VISUAL_PHASE || 'after'}/${route.replaceAll('/', '_')}-menu-${width}.png` });
        await menu.getByRole('link', { name: 'Tarefas', exact: true }).click();
        await expect(page).toHaveURL('/tarefas');
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
      expect(fixture.assertAllWritesAreMocked()).toBe(true);
    });
  }
}

test('navigation search, collapse and keyboard remain functional', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/tarefas');
  const menu = page.getByRole('navigation', { name: 'Menu principal', exact: true });
  await menu.getByLabel('Buscar no menu').fill('Estoque');
  const stock = menu.getByRole('link', { name: 'Estoque', exact: true });
  await expect(stock).toBeVisible();
  await stock.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/estoque');
  await menu.getByLabel('Buscar no menu').fill('');
  await menu.getByRole('button', { name: 'Recolher menu lateral' }).click();
  await expect(menu.getByRole('button', { name: 'Expandir menu lateral', exact: true })).toBeVisible();
  await menu.getByRole('button', { name: 'Expandir menu lateral', exact: true }).click();
  await expect(menu.getByLabel('Buscar no menu')).toBeVisible();
  await page.getByRole('button', { name: 'Abrir busca global, atalho Control K' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
