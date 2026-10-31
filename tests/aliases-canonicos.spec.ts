import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const ALIASES = [
  ['/medicos', '/equipe', ''],
  ['/funcionarios', '/equipe', ''],
  ['/salas', '/gestao-fluxo', ''],
  ['/templates', '/todos-templates', ''],
  ['/lista-espera', '/gestao-fluxo', 'tab=espera'],
  ['/caixa', '/caixa-diario', ''],
  ['/recepcao?tab=caixa', '/caixa-diario', ''],
  ['/contas-receber', '/contas', 'tab=receber'],
  ['/contas-pagar', '/contas', 'tab=pagar'],
  ['/pagamentos', '/contas', 'tab=receber'],
  ['/precos-exames', '/precos-servicos', ''],
  ['/tipos-consulta', '/precos-servicos', 'tab=tipos'],
  ['/templates-email', '/todos-templates', 'tab=email'],
  ['/atestados', '/documentos-clinicos', 'tab=atestados'],
  ['/encaminhamentos', '/documentos-clinicos', 'tab=encaminhamentos'],
] as const;

test('legacy paths use canonical routes and preserve the intended tab', async ({ page }) => {
  test.setTimeout(60_000);
  await installSyntheticClinic(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dashboard');

  for (const [legacy, canonical, expectedQuery] of ALIASES) {
    await page.goto(legacy);
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 3_000 }).toBe(canonical);
    const url = new URL(page.url());
    expect(url.search.slice(1), `${legacy} query`).toBe(expectedQuery);
    await expect(page.locator('#main-content h1').first(), `${legacy} resolves to ${canonical}`).toBeVisible({ timeout: 8_000 });
    if (canonical === '/caixa-diario') {
      await expect(page.getByRole('heading', { level: 1, name: 'Caixa Diário' })).toBeVisible();
    }
  }
});
