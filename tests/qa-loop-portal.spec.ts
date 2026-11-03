import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

for (const width of [1280, 390]) {
  test(`public booking and patient portal remain usable at ${width}px`, async ({ page }, info) => {
    const errors: string[] = [];
    const failedResponses: string[] = [];
    const blockedResources: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      if (message.text().includes('net::ERR_BLOCKED_BY_CLIENT')) blockedResources.push(message.location().url);
      else errors.push(message.text());
    });
    page.on('response', response => {
      if (response.status() >= 400) failedResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), authenticated: false });
    await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
    await page.route('**/functions/v1/public-booking', async route => {
      const body = route.request().postDataJSON();
      const responses: Record<string, unknown> = {
        info: { clinica: { nome: 'Clínica sintética QA' }, dias_antecedencia: 30, medicos: [{ id: 'medico-qa', nome: 'Dra. Ana', especialidade: 'Clínica geral' }] },
        slots: { slots: ['10:30', '11:00'] },
        hold: { success: true, hold_token: body.hold_token, expires_at: new Date(Date.now() + 300000).toISOString() },
        release: { success: true },
      };
      await route.fulfill({ json: responses[body.action] ?? { success: true } });
    });
    await page.route('**/functions/v1/patient-portal', async route => {
      const body = route.request().postDataJSON();
      await route.fulfill({ json: body.action === 'get_profile'
        ? { id: 'paciente-qa', nome: 'Ana Paciente', telefone: '', email: '', alergias: [] }
        : [] });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/agendar/00000000-0000-4000-8000-000000000002');
    await page.getByRole('button', { name: /Dra\. Ana/ }).click();
    await page.getByTestId('online-booking-day').first().click();
    await page.getByRole('button', { name: /10:30/ }).click();
    await expect(page.getByLabel('Nome completo *')).toBeVisible();
    for (const label of ['Nome completo *', 'CPF *', 'Celular / WhatsApp *']) {
      await expect(page.getByLabel(label)).toHaveAccessibleName(label);
    }
    await page.screenshot({ path: info.outputPath(`booking-${width}.png`), fullPage: true, animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.goto('/portal-paciente');
    await page.getByRole('textbox', { name: 'Código de acesso do paciente' }).fill('codigo-sintetico-qa');
    await page.getByRole('button', { name: 'Acessar Portal' }).click();
    await expect(page.getByRole('heading', { name: /Olá, Ana/ })).toBeVisible();
    for (const name of ['Consultas', 'Exames']) {
      const section = width < 768
        ? page.getByRole('navigation', { name: 'Seções do portal no celular' }).getByRole('button', { name, exact: true })
        : page.getByRole('tab', { name, exact: true });
      await section.click();
      await expect(page.getByRole('tabpanel', { name, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`portal-${name}-${width}.png`), fullPage: true, animations: 'disabled' });
    }
    await page.getByRole('button', { name: 'Sair do portal do paciente' }).click();
    await expect(page.getByRole('textbox', { name: 'Código de acesso do paciente' })).toBeVisible();
    expect(errors).toEqual([]);
    expect(failedResponses).toEqual([]);
    await info.attach('blocked-external-resources', { body: JSON.stringify(blockedResources), contentType: 'application/json' });
  });
}
