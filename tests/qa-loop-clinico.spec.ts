import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
test.setTimeout(90_000);

const patient = '00000000-0000-4000-8000-000000000004';
const record = '00000000-0000-4000-9000-000000000101';

for (const width of [1280, 390]) {
  test(`clinical workspace exposes sections without browser errors or overflow at ${width}px`, async ({ page }, info) => {
    const errors: string[] = [];
    const failures: string[] = [];
    const blockedResources: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      // A fixture bloqueia fontes/recursos externos para manter o teste offline.
      if (message.text().includes('net::ERR_BLOCKED_BY_CLIENT')) blockedResources.push(message.location().url);
      else errors.push(message.text());
    });
    page.on('response', response => {
      if (response.status() >= 400) failures.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });
    const fixture = await installSyntheticClinic(page, {
      appOrigin: String(info.project.use.baseURL), role: 'admin', platformAdmin: false,
      prontuarioPopulated: true, labPopulated: true,
    });
    await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
    // Ausência de perfil de plataforma, sem o 406 deliberado da fixture comum.
    await page.route('**/rest/v1/platform_admins*', route => route.fulfill({ json: null }));
    await page.setViewportSize({ width, height: 900 });
    for (const [name, path, heading] of [
      ['prontuarios', `/prontuarios?paciente=${patient}`, 'Prontuários'],
      ['exames', '/exames', 'Solicitação de exames'],
      ['laudos', '/laudos-lab', 'Laudos Laboratoriais'],
      ['consulta', `/prontuarios/atendimento?paciente=${patient}&prontuario=${record}`, 'Evolução clínica'],
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath(`${name}-${width}.png`), fullPage: true });
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} overflow`).toBe(true);
    }
    const signature = await page.locator('#clinical-signature-status').boundingBox();
    const footer = await page.getByTestId('prontuario-workspace').locator('footer').boundingBox();
    expect(signature).not.toBeNull();
    expect(footer).not.toBeNull();
    expect.soft(signature!.x + signature!.width, 'assinatura deve caber no rodapé').toBeLessThanOrEqual(footer!.x + footer!.width);
    const tabs = page.getByRole('tab');
    const names = await tabs.allTextContents();
    for (let index = 0; index < names.length; index++) {
      await tabs.nth(index).click();
      await expect(tabs.nth(index)).toHaveAttribute('aria-selected', 'true');
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${names[index]} overflow`).toBe(true);
      await page.screenshot({ path: info.outputPath(`section-${index}-${width}.png`), fullPage: true });
    }
    expect(errors).toEqual([]);
    expect(failures).toEqual([]);
    await info.attach('blocked-external-resources', { body: JSON.stringify(blockedResources), contentType: 'application/json' });
    expect(fixture.assertAllWritesAreMocked()).toBe(true);
  });
}
