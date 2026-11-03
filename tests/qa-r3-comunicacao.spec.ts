import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const diagnostics = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const events: string[] = [];
  diagnostics.set(page, events);
  page.on('pageerror', error => events.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') events.push(`console: ${message.text()}`); });
  page.on('requestfailed', request => events.push(`requestfailed: ${request.failure()?.errorText} ${request.url()}`));
  page.on('response', response => { if (response.status() >= 400) events.push(`HTTP ${response.status()}: ${response.url()}`); });
});
test.afterEach(async ({ page }, info) => {
  await mkdir(info.outputDir, { recursive: true });
  const path = info.outputPath('diagnosticos-console-rede.json');
  await writeFile(path, JSON.stringify(diagnostics.get(page), null, 2), 'utf8');
  await info.attach('diagnosticos-console-rede', { path, contentType: 'application/json' });
  expect(diagnostics.get(page)?.filter(event => event.startsWith('pageerror:'))).toEqual([]);
});

for (const width of [1280, 390]) {
  test(`central não informa ausência de notificações quando a primeira leitura pausa offline em ${width}px`, async ({ page }, info) => {
    const synthetic = await installSyntheticClinic(page);
    await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
    let unavailable = true;
    await page.route('**/rest/v1/rpc/central_notificacoes_usuario*', async route => {
      if (unavailable) {
        await page.evaluate(() => {
          Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
          window.dispatchEvent(new Event('offline'));
        });
        await route.abort('failed');
        return;
      }
      await route.fulfill({ json: [{ source_type: 'alert', source_id: 'qa-offline', category: 'alertas', severity: 'warning', title: 'Pendência recuperada QA', message: 'A leitura foi retomada.', occurred_at: new Date().toISOString(), href: '/notificacoes', is_read: false }] });
    });
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/notificacoes');
    await expect(page.getByRole('alert').filter({ hasText: 'Notificações aguardando conexão' })).toBeVisible();
    await expect(page.getByText('Nenhuma notificação por enquanto')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`notificacoes-offline-${width}.png`), fullPage: true, animations: 'disabled' });
    unavailable = false;
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
      window.dispatchEvent(new Event('online'));
    });
    await expect(page.getByRole('button', { name: /Pendência recuperada QA/ })).toBeVisible();
    await expect(page.getByText('Notificações aguardando conexão')).toHaveCount(0);
    expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  });

  test(`paciente preserva comentário quando a avaliação falha e pode reenviar em ${width}px`, async ({ page }, info) => {
    const synthetic = await installSyntheticClinic(page, { authenticated: false });
    let failFeedback = true;
    const submissions: Array<Record<string, unknown>> = [];
    await page.route('**/functions/v1/patient-portal', async route => {
      const body = route.request().postDataJSON();
      if (body.action === 'submit_feedback') {
        submissions.push(body);
        await route.fulfill({ status: failFeedback ? 500 : 200, json: failFeedback ? { error: 'Falha sintética no envio da avaliação' } : { success: true } });
        return;
      }
      const responses: Record<string, unknown> = {
        get_profile: { id: 'paciente-qa', nome: 'Ana Paciente', telefone: '', email: '', alergias: [] },
        get_agendamentos: [{ id: 'consulta-finalizada-qa', data: '2026-01-02', hora_inicio: '09:00:00', hora_fim: '09:30:00', status: 'finalizado', tipo: 'Consulta', medicos: { nome: 'Dra. Ana' } }],
      };
      await route.fulfill({ json: responses[body.action] ?? [] });
    });
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/portal-paciente');
    await page.getByRole('textbox', { name: 'Código de acesso do paciente' }).fill('codigo-sintetico-qa');
    await page.getByRole('button', { name: 'Acessar Portal' }).click();
    await page.getByRole('button', { name: 'Avaliação 4 de 5', exact: true }).click();
    const comment = page.getByRole('textbox', { name: 'Comentário opcional sobre a experiência' });
    await comment.fill('A equipe explicou o atendimento com clareza.');
    await page.getByRole('button', { name: 'Enviar Avaliação' }).click();
    await expect(page.getByRole('alert')).toHaveText('Não foi possível enviar sua avaliação. Tente novamente.');
    await expect(comment).toHaveValue('A equipe explicou o atendimento com clareza.');
    await expect(page.getByRole('button', { name: 'Avaliação 4 de 5', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Obrigado pelo feedback!')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`portal-avaliacao-falha-${width}.png`), fullPage: true, animations: 'disabled' });
    failFeedback = false;
    await page.getByRole('button', { name: 'Enviar Avaliação' }).click();
    await expect(page.getByText('Obrigado pelo feedback!')).toBeVisible();
    expect(submissions).toHaveLength(2);
    expect(submissions[1]).toMatchObject({ nota: 4, comentario: 'A equipe explicou o atendimento com clareza.' });
    await page.screenshot({ path: info.outputPath(`portal-avaliacao-sucesso-${width}.png`), fullPage: true, animations: 'disabled' });
    expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  });
}
