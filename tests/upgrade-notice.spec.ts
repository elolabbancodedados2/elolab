import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
for (const width of [1440, 768, 390]) {
  test(`upgrade notice stays above navigation and keeps workspace usable at ${width}px`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
    await page.setViewportSize({ width, height: 960 });
    for (const path of ['/dashboard', '/guias-externas/nova']) {
      await page.goto(path);
      const notice = page.getByRole('complementary', { name: 'Atualização do EloLab' });
      await expect(notice).toBeVisible();
      await expect(notice).toContainText('Nova versão no ar em 10/11');
      await expect(notice).toContainText('objetivo de superar Feegow, Doctoralia');
      await expect(notice.locator('time')).toHaveAttribute('datetime', '2026-11-10');
      const bounds = (await notice.boundingBox())!;
      expect(bounds.y).toBe(0);
      expect(bounds.height).toBeLessThan(width < 640 ? 145 : 90);
      expect((await page.getByRole('main').boundingBox())!.y).toBeGreaterThanOrEqual(bounds.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (path.endsWith('nova')) {
        const action = page.getByRole('button', { name: 'Registrar guia', exact: true });
        await action.evaluate(el => el.scrollIntoView({ block: 'center' }));
        expect((await action.boundingBox())!.y + (await action.boundingBox())!.height).toBeLessThanOrEqual(width < 1024 ? 900 : 960);
        await page.getByRole('main').evaluate(el => el.scrollTo({ top: 0 }));
      }
      await page.screenshot({ path: `.qa-artifacts/upgrade-notice-20261029/${path.endsWith('nova') ? 'guide' : 'dashboard'}-${width}.png` });
    }
  });
}
