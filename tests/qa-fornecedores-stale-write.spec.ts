import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

for (const width of [1280, 390]) {
  test(`fornecedor removido não anuncia edição salva em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const synthetic = await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL) });
    await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
    const errors: string[] = [];
    const failures: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => failures.push(`${request.method()} ${request.url()}`));
    page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    let writes = 0;
    const fornecedor = {
      id: '00000000-0000-4000-8000-000000000052', nome: 'Fornecedor QA', cnpj: null,
      contato: 'Contato sintético', telefone: '(00) 00000-0000', email: 'fornecedor@example.test', ativo: true,
    };
    await page.route('**/rest/v1/fornecedores?**', route => {
      if (route.request().method() === 'PATCH') {
        writes++;
        const params = new URL(route.request().url()).searchParams;
        expect(params.get('id')).toBe(`eq.${fornecedor.id}`);
        expect(params.get('clinica_id')).toBe('eq.00000000-0000-4000-8000-000000000002');
        expect(route.request().postDataJSON()).toMatchObject({ contato: 'Contato atualizado QA' });
        return route.fulfill({ json: writes === 1 ? [] : [{ id: fornecedor.id }] });
      }
      return route.fulfill({ json: [fornecedor] });
    });

    await page.goto('/compras?aba=fornecedores');
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await page.getByLabel('Contato', { exact: true }).fill('Contato atualizado QA');
    await page.getByRole('button', { name: 'Salvar fornecedor', exact: true }).click();
    await expect(page.getByText('O fornecedor não está mais disponível para edição. Atualize a lista e confira seu acesso.', { exact: true })).toBeVisible();
    await expect(page.getByText('Fornecedor salvo.', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Contato', { exact: true })).toHaveValue('Contato atualizado QA');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await expect(page.locator('main').first().getByRole('button', { name: '', exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`fornecedor-edicao-preservada-${width}.png`), fullPage: true });

    await page.getByRole('button', { name: 'Salvar fornecedor', exact: true }).click();
    await expect(page.getByText('Fornecedor salvo.', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Editar fornecedor', exact: true })).toHaveCount(0);
    expect(writes).toBe(2);
    expect(errors).toEqual([]);
    expect(failures).toEqual([]);
    expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  });
}
