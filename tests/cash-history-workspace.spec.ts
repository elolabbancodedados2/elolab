import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('cash history details are a clinic-scoped, read-only workspace on desktop and mobile', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'recepcao' });
  const cashId = '00000000-0000-4000-9000-000000000081';
  const date = '2026-10-29';

  await page.route('http://127.0.0.1:54321/rest/v1/caixa_diario**', async route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('id')).toBe(`eq.${cashId}`);
    expect(url.searchParams.get('clinica_id')).toBe(`eq.${synthetic.clinicId}`);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/1' }, body: JSON.stringify([{
      id: cashId, clinica_id: synthetic.clinicId, data: date, aberto: false, valor_abertura: 100,
      valor_fechamento: 133, operador_abertura: 'Operador QA', operador_fechamento: 'Financeiro QA', observacoes: 'Conferência sintética',
    }]) });
  });
  await page.route('**/rest/v1/rpc/movimentos_caixa_diario**', route => route.fulfill({ status: 200, json: [
    { id: 'movement-a', data: date, created_at: `${date}T12:00:00Z`, tipo: 'receita', descricao: 'Consulta QA', valor: 40, forma_pagamento: 'dinheiro', categoria: 'consulta' },
    { id: 'movement-b', data: date, created_at: `${date}T13:00:00Z`, tipo: 'sangria', descricao: 'Retirada QA', valor: 7, forma_pagamento: 'dinheiro', categoria: 'sangria' },
  ] }));
  await page.route('http://127.0.0.1:54321/rest/v1/caixa_diario_eventos**', route => route.fulfill({ status: 200, json: [
    { id: 'event-a', tipo: 'abertura', valor_informado: 100, valor_apurado: null, motivo: null, user_nome: 'Operador QA', fechamento_anterior_valor: null, fechamento_anterior_operador: null, created_at: `${date}T10:00:00Z` },
    { id: 'event-b', tipo: 'fechamento', valor_informado: 133, valor_apurado: 133, motivo: 'Conferência QA', user_nome: 'Financeiro QA', fechamento_anterior_valor: null, fechamento_anterior_operador: null, created_at: `${date}T20:00:00Z` },
  ] }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/recepcao/caixa/historico/${cashId}`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: /Caixa de quinta-feira, 29 de outubro de 2026/i })).toBeVisible();
  await expect(page.getByText('Consulta QA')).toBeVisible();
  await expect(page.getByText('Retirada QA')).toBeVisible();
  await expect(page.getByText('Conferência sintética')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reabrir caixa' })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('cash-history-detail-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.getByText('Movimentações · 2').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('cash-history-detail-mobile-movements.png'), animations: 'disabled' });

  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('cash-history-detail-desktop.png'), fullPage: true, animations: 'disabled' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
