import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const todaySaoPaulo = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

async function installCashAndCatalog(page: Page, open = true) {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'recepcao' });
  const today = todaySaoPaulo();
  await page.route('http://127.0.0.1:54321/rest/v1/caixa_diario**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', 'content-range': `*/${open ? 1 : 0}` },
    body: JSON.stringify(open ? [{
      id: '00000000-0000-4000-9000-000000000081', data: today, aberto: true,
      valor_abertura: 125, valor_fechamento: null, operador_abertura: 'Conta QA sintética',
      operador_fechamento: null, clinica_id: synthetic.clinicId,
    }] : []),
  }));
  await page.route('http://127.0.0.1:54321/rest/v1/tipos_consulta**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '*/1' },
    body: JSON.stringify([{ id: 'consulta-qa', nome: 'Consulta geral QA', valor_particular: 85, ativo: true }]),
  }));
  await page.route('http://127.0.0.1:54321/rest/v1/estoque**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '*/1' },
    body: JSON.stringify([{ id: 'produto-qa', nome: 'Máscara QA', categoria: 'Descartáveis', valor_venda: 12, quantidade: 1, validade: null }]),
  }));
  await page.route('http://127.0.0.1:54321/rest/v1/configuracoes_clinica**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '*/0' }, body: '[]',
  }));
  await page.route('http://127.0.0.1:54321/rest/v1/tipo_exames_catalog**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '*/1' },
    body: JSON.stringify([{ id: 'exame-qa', nome: 'Hemograma QA', preco_venda: 42, ativo: true }]),
  }));
  return synthetic;
}

test('sale lives on its own page and retries a committed sale with the same idempotency key', async ({ page }, testInfo) => {
  const synthetic = await installCashAndCatalog(page);
  const payloads: Record<string, unknown>[] = [];
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/registrar_venda_pdv', async route => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    payloads.push(payload);
    if (payloads.length === 1) {
      await route.fulfill({ status: 503, json: { code: 'SYNTHETIC_FAILURE', message: 'Falha sintética após confirmação da venda' } });
      return;
    }
    await route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify([{ lancamento_id: '00000000-0000-4000-9000-000000000085', ja_registrada: true }]),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/caixa-diario');
  await page.getByRole('button', { name: 'Nova Venda' }).first().click();
  await expect(page).toHaveURL('/recepcao/caixa/venda');
  await expect(page.getByRole('heading', { name: 'Ponto de venda' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Consultas' }).click();
  await page.getByRole('button', { name: /Consulta geral QA/ }).click();
  await page.getByLabel('Desconto (R$)').fill('5,00');
  await page.getByRole('button', { name: 'PIX', exact: true }).click();
  await page.getByRole('button', { name: 'Voltar ao caixa' }).click();
  const discard = page.getByRole('alertdialog');
  await expect(discard).toContainText('Alterações não salvas');
  await discard.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(discard).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Itens da venda' }).getByText('Consulta geral QA')).toBeVisible();
  const finalize = page.getByRole('button', { name: 'Finalizar venda' });
  await expect(finalize).toBeEnabled();
  await page.locator('#main-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(finalize).toBeInViewport();
  const actionBox = await finalize.boundingBox();
  const navigationBox = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
  expect(actionBox).not.toBeNull();
  expect(navigationBox).not.toBeNull();
  expect(actionBox!.y + actionBox!.height).toBeLessThan(navigationBox!.y);
  await page.screenshot({ path: testInfo.outputPath('cash-sale-mobile.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#main-content').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath('cash-sale-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#main-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await finalize.click();
  await expect(page.getByRole('alert')).toContainText('Falha sintética após confirmação da venda');
  await expect(page.getByRole('list', { name: 'Itens da venda' }).getByText('Consulta geral QA')).toBeVisible();
  await finalize.click();
  await expect(page).toHaveURL('/caixa-diario');
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toMatchObject({
    p_descricao: 'Consulta geral QA', p_valor_cobrado: 85, p_valor_pago: 80,
    p_forma_pagamento: 'pix', p_produtos: [], p_exames: [],
  });
  expect(payloads[1]).toMatchObject(payloads[0]);
  expect(payloads[1].p_chave).toBe(payloads[0].p_chave);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('exam sales require a patient and product quantities respect stock', async ({ page }) => {
  const synthetic = await installCashAndCatalog(page);
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/registrar_venda_pdv', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify([{ lancamento_id: '00000000-0000-4000-9000-000000000085', ja_registrada: false }]),
  }));

  await page.goto('/recepcao/caixa/venda');
  await expect(page.getByRole('heading', { name: 'Ponto de venda' })).toBeVisible();
  await page.getByRole('tab', { name: 'Exames' }).click();
  await page.getByRole('button', { name: /Hemograma QA/ }).click();
  await expect(page.getByRole('button', { name: 'Finalizar venda' })).toBeDisabled();
  await expect(page.getByText('Selecione um paciente para registrar exames vendidos.')).toBeVisible();

  await page.getByRole('button', { name: 'Remover item da venda' }).click();
  await page.getByRole('tab', { name: 'Produtos' }).click();
  await page.getByRole('button', { name: /Máscara QA/ }).click();
  await expect(page.getByRole('button', { name: 'Aumentar quantidade' })).toBeDisabled();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('sale page blocks checkout when today has no open cash register', async ({ page }) => {
  const synthetic = await installCashAndCatalog(page, false);
  await page.goto('/recepcao/caixa/venda');
  await expect(page.getByRole('heading', { name: 'Caixa não disponível para vendas' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finalizar venda' })).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
