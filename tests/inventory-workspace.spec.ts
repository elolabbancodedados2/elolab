import { expect, test, type Page, type Route } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const CLINIC_ID = '00000000-0000-4000-8000-000000000002';

const dateOffset = (days: number) => {
  const date = new Date(`${new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())}T12:00:00-03:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

async function routeStock(page: Page, rows: unknown[]) {
  await page.route('http://127.0.0.1:54321/rest/v1/estoque?**', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` },
      body: JSON.stringify(rows),
    });
  });
}

test('inventory separates expired products from upcoming expiry and keeps dates visible on mobile', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'admin' });
  await routeStock(page, [
    {
      id: '00000000-0000-4000-9000-000000000501', clinica_id: CLINIC_ID,
      nome: 'Dipirona QA', categoria: 'medicamentos', unidade: 'caixa', quantidade: 12, quantidade_minima: 5,
      valor_unitario: 8.5, lote: 'DIP-2026-01', validade: dateOffset(-3), localizacao: 'Armário A',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
    {
      id: '00000000-0000-4000-9000-000000000502', clinica_id: CLINIC_ID,
      nome: 'Soro fisiológico QA', categoria: 'medicamentos', unidade: 'frasco', quantidade: 18, quantidade_minima: 5,
      valor_unitario: 4, lote: 'SOR-2026-02', validade: dateOffset(28), localizacao: 'Armário B',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
    {
      id: '00000000-0000-4000-9000-000000000503', clinica_id: CLINIC_ID,
      nome: 'Luva nitrílica QA', categoria: 'epis', unidade: 'caixa', quantidade: 3, quantidade_minima: 5,
      ponto_pedido: 8, valor_unitario: 22, lote: null, validade: null, localizacao: 'Sala 2',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
  ]);

  for (const viewport of [{ width: 1280, height: 800 }, { width: 768, height: 960 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/estoque');
    const main = page.locator('#main-content');
    const expiredIndicator = main.getByRole('button', { name: /Itens vencidos/ });
    const upcomingIndicator = main.getByRole('button', { name: /Validade próxima/ });
    await expect(expiredIndicator).toContainText('1');
    await expect(upcomingIndicator).toContainText('1');

    const expiredRow = main.getByRole('row').filter({ hasText: 'Dipirona QA' });
    const upcomingRow = main.getByRole('row').filter({ hasText: 'Soro fisiológico QA' });
    if (viewport.width >= 640) {
      await expect(expiredRow.getByText('Vencido', { exact: true }).last()).toBeVisible();
      await expect(upcomingRow.getByText('28d', { exact: true })).toBeVisible();
    }
    if (viewport.width < 640) {
      await expect(expiredRow.getByText(/Validade.*Vencido/)).toBeVisible();
      await expect(upcomingRow.getByText(/Validade.*28d/)).toBeVisible();
    }
    if (viewport.width >= 640 && viewport.width < 1024) {
      const productsTable = main.getByRole('region', { name: /Tabela de produtos/ });
      await expect(productsTable).toBeVisible();
      expect(await productsTable.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
      await productsTable.focus();
      await expect(productsTable).toBeFocused();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`inventory-urgency-${viewport.width}.png`), fullPage: true, animations: 'disabled' });

    await expiredIndicator.focus();
    await page.keyboard.press('Space');
    await expect(expiredIndicator).toHaveAttribute('aria-pressed', 'true');
    await expect(expiredRow).toBeVisible();
    await expect(upcomingRow).toHaveCount(0);
    await expiredIndicator.click();
    await upcomingIndicator.click();
    await expect(upcomingRow).toBeVisible();
    await expect(expiredRow).toHaveCount(0);
    await upcomingIndicator.click();
  }

  await page.goto('/estoque?alerta=vencidos');
  const deepLinkedMain = page.locator('#main-content');
  await expect(deepLinkedMain.getByRole('button', { name: /Itens vencidos/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(deepLinkedMain.getByRole('row').filter({ hasText: 'Dipirona QA' })).toBeVisible();
  await expect(deepLinkedMain.getByRole('row').filter({ hasText: 'Soro fisiológico QA' })).toHaveCount(0);

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
});

test('inventory explains an empty stock and offers the existing add-item action', async ({ page }) => {
  await installSyntheticClinic(page, { platformAdmin: false, role: 'admin' });
  await routeStock(page, []);
  await page.goto('/estoque');

  const main = page.locator('#main-content');
  await expect(main.getByRole('heading', { name: 'Estoque vazio' })).toBeVisible();
  await expect(main.getByText('Nenhum item cadastrado no estoque. Adicione materiais e medicamentos.')).toBeVisible();
  await expect(main.getByRole('button', { name: /Novo item/i })).toBeVisible();
});
