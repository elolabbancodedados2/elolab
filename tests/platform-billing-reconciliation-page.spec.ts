import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('reconciliação de cobrança usa página própria, mantém filtro e envia a mesma RPC local', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: true, platformOnly: true });
  const attempt = {
    id: 'pix-qa-1', origem: 'pix_periodo', referencia: 'order-qa-1', metodo: 'pix', valor: 499,
    status: 'em_processamento', detalhe: 'valor_divergente', criado_em: '2026-10-29T10:00:00.000Z', atualizado_em: null,
    clinica_nome: 'Clínica QA Norte', dono_email: 'financeiro.qa@example.test', divergente: true,
  };
  const rpcCalls: unknown[] = [];
  const overview = {
    generated_at: '2026-10-29T12:00:00.000Z',
    metrics: { mrr: 0, ativas: 0, trials: 0, vencidas: 0, sem_assinatura: 0, webhooks_pendentes: 0, webhooks_falha_24h: 0 },
    subscriptions: [], webhooks: [],
  };

  await page.route('http://127.0.0.1:54321/rest/v1/rpc/platform_billing_overview', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(overview) });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/platform_subscription_invoice_history', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/platform_checkout_attempts', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([attempt]) });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/platform_reconciliacoes_cobranca', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/platform_reconciliar_cobranca', async route => {
    rpcCalls.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status_novo: 'pago' }) });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/cobrancas', { waitUntil: 'domcontentloaded' });
  const search = page.getByRole('textbox', { name: 'Buscar clínicas por nome, responsável ou plano' });
  await expect(search).toBeVisible({ timeout: 15000 });
  await search.fill('Clínica QA Norte');
  await page.getByRole('button', { name: 'Reconciliar' }).click();
  await expect(page).toHaveURL('/admin/cobrancas/reconciliar/pix_periodo/pix-qa-1');
  await expect(page.getByRole('heading', { name: 'Reconciliar cobrança' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Correção financeira auditável')).toBeVisible();
  await expect(page).not.toHaveURL(/order-qa-1/);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).not.toContainText(attempt.id);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Reconciliar cobrança');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('platform-billing-reconciliation-desktop.png'), fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('platform-billing-reconciliation-mobile.png'), fullPage: true, animations: 'disabled' });
  const justification = 'Comprovante confirmado no extrato do banco e valor conferido.';
  await page.getByLabel('Justificativa (10 a 500 caracteres)').fill(justification);
  const submit = page.getByRole('button', { name: 'Confirmar pagamento' });
  await submit.scrollIntoViewIfNeeded();
  const navigation = page.getByRole('navigation', { name: 'Navegação principal' });
  const [submitBox, navigationBox] = await Promise.all([submit.boundingBox(), navigation.boundingBox()]);
  expect(submitBox && navigationBox && submitBox.y + submitBox.height <= navigationBox.y, JSON.stringify({ submitBox, navigationBox })).toBe(true);

  await page.getByRole('button', { name: 'Voltar às cobranças' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Descartar e sair' }).click();
  await expect(page).toHaveURL('/admin/cobrancas');
  await expect(page.getByRole('textbox', { name: 'Buscar clínicas por nome, responsável ou plano' })).toHaveValue('Clínica QA Norte');

  await page.getByRole('button', { name: 'Reconciliar' }).click();
  await page.getByLabel('Justificativa (10 a 500 caracteres)').fill(justification);
  await page.getByRole('button', { name: 'Confirmar pagamento' }).click();
  await expect(page).toHaveURL('/admin/cobrancas');
  await expect(page.getByRole('textbox', { name: 'Buscar clínicas por nome, responsável ou plano' })).toHaveValue('Clínica QA Norte');
  expect(rpcCalls).toEqual([{ p_origem: 'pix_periodo', p_id: attempt.id, p_resolucao: 'confirmar_pagamento', p_justificativa: justification }]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
