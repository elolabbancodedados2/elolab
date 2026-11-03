import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
test.setTimeout(60_000);

for (const width of [1280, 390]) {
  test(`estoque e compras: navegação e custo com milhar em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
    const synthetic = await installSyntheticClinic(page, { appOrigin });
    await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
    // A clínica sintética bloqueia recursos externos; fontes não são parte deste fluxo.
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
    await page.route('**/rest/v1/estoque?**', route => route.fulfill({
      contentType: 'application/json', headers: { 'content-range': '0-0/1' }, body: JSON.stringify([{
        id: '00000000-0000-4000-8000-000000000051', nome: 'Luva de procedimento QA',
        clinica_id: '00000000-0000-4000-8000-000000000002', categoria: 'epis', unidade: 'caixa',
        quantidade: 10, quantidade_minima: 5, valor_unitario: 25, localizacao: 'Prateleira A1',
        lote: 'QA-001', validade: '2030-12-31', updated_at: '2026-11-01T12:00:00Z',
      }]),
    }));
    await page.route('**/rest/v1/fornecedores?**', route => route.fulfill({
      contentType: 'application/json', body: JSON.stringify([{
        id: '00000000-0000-4000-8000-000000000052', nome: 'Fornecedor QA', cnpj: null,
        contato: 'Contato sintético', telefone: '(00) 00000-0000', email: 'fornecedor@example.test', ativo: true,
      }]),
    }));
    const errors: string[] = [];
    const failures: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => failures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
    page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });

    for (const [path, title] of [
      ['/estoque', 'Estoque'],
      ['/estoque/inventario', 'Inventário do estoque'],
      ['/compras', 'Compras'],
      ['/compras?aba=pedidos', 'Compras'],
      ['/compras?aba=fornecedores', 'Compras'],
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
      if (path === '/estoque') {
        await expect(page.getByText('Luva de procedimento QA', { exact: true }).filter({ visible: true })).toBeVisible();
      }
      if (path === '/estoque/inventario') {
        await expect(page.getByLabel('Contagem de Luva de procedimento QA')).toBeVisible();
      }
      if (path.endsWith('fornecedores')) {
        await expect(page.getByText('Fornecedor QA', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Novo fornecedor', exact: true }).click();
        await expect(page.getByLabel('CNPJ (opcional)', { exact: true })).toBeVisible();
        await page.getByLabel('CNPJ (opcional)', { exact: true }).fill('123');
        await expect(page.getByRole('button', { name: 'Salvar fornecedor' })).toBeDisabled();
        await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
        await page.getByRole('button', { name: 'Excluir Fornecedor QA' }).click();
        await expect(page.getByRole('alertdialog')).toBeVisible();
        await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
        await expect(page.getByRole('alertdialog')).toHaveCount(0);
      }
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await expect(page.locator('main').first().getByRole('button', { name: '', exact: true })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`${path.replace(/\W/g, '-')}-${width}.png`), fullPage: true });
    }

    await page.goto('/estoque/novo');
    await page.getByLabel('Nome *', { exact: true }).fill('Material QA sintético');
    await page.getByLabel('Valor Custo (R$)', { exact: true }).fill('1.234');
    await page.getByLabel('Valor Venda (R$)', { exact: true }).fill('2.345.678');
    await expect(page.getByText('Informe um preço entre', { exact: false })).toHaveCount(0);
    await page.route('http://127.0.0.1:54321/rest/v1/rpc/cadastrar_item_estoque', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify('00000000-0000-4000-8000-000000000050'),
    }));
    const requestPromise = page.waitForRequest('**/rest/v1/rpc/cadastrar_item_estoque');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    const request = await requestPromise;
    expect(request.postDataJSON()).toMatchObject({ p_valor_unitario: 1234, p_valor_venda: 2345678 });
    await expect(page.getByText('Produto cadastrado!', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    expect(failures).toEqual([]);
    expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  });
}
