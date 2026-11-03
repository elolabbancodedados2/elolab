import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

for (const width of [1280, 390]) {
  test(`comunicação e equipe mantêm filtros e layout em ${width}px`, async ({ page }, testInfo) => {
    const synthetic = await installSyntheticClinic(page, { employeesPopulated: true, platformAdmin: true });
    await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
    const errors: string[] = [];
    const failures: string[] = [];
    const blockedResources: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && !message.text().includes('net::ERR_BLOCKED_BY_CLIENT')) errors.push(message.text());
    });
    page.on('requestfailed', request => {
      const error = request.failure()?.errorText;
      if (error?.includes('ERR_BLOCKED_BY_CLIENT')) blockedResources.push(request.url());
      else if (error !== 'net::ERR_ABORTED') failures.push(`${request.method()} ${request.url()}`);
    });
    page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    await page.route('**/rest/v1/rpc/central_notificacoes_usuario*', route => route.fulfill({ json: [
      { source_type: 'alert', source_id: 'critical-unread', category: 'alertas', severity: 'error', title: 'Alerta pendente QA', message: 'Revisar envio da clínica.', occurred_at: new Date().toISOString(), href: '/notificacoes', is_read: false },
      { source_type: 'alert', source_id: 'critical-read', category: 'alertas', severity: 'error', title: 'Alerta já lido QA', message: 'Revisar envio da clínica.', occurred_at: new Date().toISOString(), href: '/notificacoes', is_read: true },
    ] }));
    await page.route('**/functions/v1/teleconsulta', route => route.fulfill({ json: {
      status: 'waiting', expires_at: new Date(Date.now() + 60_000).toISOString(), provider_present: false, guest_present: false,
    } }));
    await page.setViewportSize({ width, height: 844 });
    for (const path of ['/notificacoes', '/relacionamento?tab=campanhas', '/equipe?aba=funcionarios', '/equipe?aba=convites', '/usuarios']) {
      await page.goto(path);
      await expect(page.locator('#main-content').getByRole('heading', { level: 1 })).toBeVisible();
      if (path.startsWith('/relacionamento')) await expect(page.getByRole('tab', { name: 'Campanhas', exact: true })).toHaveAttribute('aria-selected', 'true');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${path.replaceAll(/[/?=]/g, '-')}-${width}.png`), fullPage: true });
    }
    await page.goto('/notificacoes');
    const indicators = page.getByRole('group', { name: 'Indicadores e filtros rápidos de notificações' });
    await indicators.getByRole('button', { name: /Críticas/ }).click();
    await expect(page.getByRole('button', { name: /Alerta pendente QA/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Alerta já lido QA/ })).toHaveCount(0);
    await expect(page.getByText('1 de 2 notificações')).toBeVisible();
    await page.goto('/teleconsulta/00000000-0000-4000-8000-000000000091');
    await expect(page.getByRole('heading', { name: 'Preparar sala de atendimento' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aceitar e entrar' })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`teleconsulta-${width}.png`), fullPage: true });
    await testInfo.attach('recursos-externos-bloqueados', { body: JSON.stringify(blockedResources), contentType: 'application/json' });
    expect(errors).toEqual([]);
    expect(failures).toEqual([]);
    expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  });
}

test('recepção não recebe dados administrativos da equipe nem dos usuários da plataforma', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { role: 'recepcao', platformAdmin: false });
  await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
  const adminRequests: string[] = [];
  page.on('request', request => {
    if (/listar_funcionarios_equipe_admin|listar_usuarios_plataforma/.test(request.url())) adminRequests.push(request.url());
  });
  for (const path of ['/equipe', '/usuarios']) {
    await page.goto(path);
    if (path === '/usuarios') await expect(page).toHaveURL(/\/dashboard$/);
    else await expect(page.getByRole('heading', { name: /Acesso (restrito|negado)|Sem permissão/i })).toBeVisible();
  }
  expect(adminRequests).toEqual([]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
