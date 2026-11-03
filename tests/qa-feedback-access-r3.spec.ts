import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block', colorScheme: 'dark' });

async function installLocalClinic(page: Parameters<typeof installSyntheticClinic>[0]) {
  const fixture = await installSyntheticClinic(page, { platformAdmin: false });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('**/rest/v1/platform_admins*', route => route.fulfill({ json: null }));
  await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
  return fixture;
}

for (const width of [390, 768, 1280]) {
  test(`feedback estável permanece legível e acima da navegação em ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const fixture = await installLocalClinic(page);
    const failures: string[] = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
    page.on('requestfailed', request => { if (request.failure()?.errorText !== 'net::ERR_ABORTED') failures.push(request.url()); });
    page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    await page.goto('/configuracoes?tab=clinica');
    await page.getByLabel('Nome da Clínica *', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Salvar na nuvem', exact: true }).click();
    const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Informe o nome da clínica antes de salvar.' });
    await expect(toast).toHaveAttribute('data-mounted', 'true');
    await toast.evaluate(async element => {
      await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished));
    });
    const toastBox = await toast.boundingBox();
    const nav = page.getByRole('navigation', { name: 'Navegação principal' });
    const navBox = await nav.isVisible() ? await nav.boundingBox() : null;
    const colors = await toast.evaluate(element => {
      const style = getComputedStyle(element);
      const luminance = (color: string) => {
        const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => {
          const s = value / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const foreground = luminance(style.color);
      const background = luminance(style.backgroundColor);
      return { foreground: style.color, background: style.backgroundColor, opacity: style.opacity,
        contrast: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05) };
    });
    await info.attach('feedback-geometria-contraste', { body: JSON.stringify({ toastBox, navBox, colors }), contentType: 'application/json' });
    await page.screenshot({ path: info.outputPath(`feedback-estavel-${width}.png`), animations: 'disabled' });
    expect(toastBox).not.toBeNull();
    expect(toastBox!.y + toastBox!.height).toBeLessThanOrEqual(navBox ? navBox.y - 8 : 844);
    expect(colors.opacity).toBe('1');
    expect(colors.contrast).toBeGreaterThanOrEqual(4.5);
    await expect(page.locator('html')).toHaveClass(/light/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(failures).toEqual([]);
    expect(fixture.assertAllWritesAreMocked()).toBe(true);
  });
}

for (const width of [390, 1280]) {
  test(`portal orienta recuperação do código expirado em ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await installLocalClinic(page);
    await page.route('**/functions/v1/patient-portal', route => route.fulfill({ json: { error: 'Token inválido ou expirado' } }));
    await page.goto('/portal-paciente');
    await page.getByRole('textbox', { name: 'Código de acesso do paciente' }).fill('codigo-expirado-qa');
    await page.getByRole('button', { name: 'Acessar Portal' }).click();
    await expect(page.getByRole('alert')).toContainText('inválido ou expirado');
    await expect(page.getByText('Perdeu o código ou ele expirou? Entre em contato com sua clínica e peça um novo código de acesso.', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`portal-recuperacao-${width}.png`), animations: 'disabled' });
  });
}
