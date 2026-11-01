import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const clinicId = '00000000-0000-4000-8000-000000000002';

test('PDV sale reversal requires a reason and calls the atomic RPC once', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false } as any);
  const saleId = '00000000-0000-4000-9000-000000000601';
  const calls: Array<Record<string, unknown>> = [];
  await page.route('**/rest/v1/lancamentos*', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET' && url.searchParams.get('id') === `eq.${saleId}`) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        id: saleId, descricao: 'Venda: luva e hemograma', valor_pago: 80, forma_pagamento: 'pix', data: '2026-10-30', status: 'pago', categoria: 'receita_caixa',
      }) });
    }
    return route.fallback();
  });
  await page.route('**/rest/v1/rpc/vendas_pdv_do_caixa*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ lancamento_id: saleId, estornado_em: null }]) }));
  await page.route('**/rest/v1/rpc/estornar_venda_pdv*', async route => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, itens_devolvidos: 1, exames_cancelados: 1 }) });
  });

  await page.goto(`/recepcao/caixa/vendas/${saleId}/estornar`);
  await expect(page.getByRole('heading', { name: 'Estornar venda do caixa' })).toBeVisible();
  await expect(page.getByText('Venda: luva e hemograma')).toBeVisible();
  const submit = page.locator('#main-content').getByRole('button', { name: 'Estornar venda', exact: true });
  await expect(submit).toBeDisabled();
  await page.getByLabel('Motivo do estorno *').fill('Venda no paciente errado');
  await submit.click();
  await expect(page.getByText('Venda estornada')).toBeVisible();
  await expect(page).toHaveURL(/\/caixa-diario/);
  expect(calls).toEqual([{ p_lancamento_id: saleId, p_motivo: 'Venda no paciente errado' }]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('status correction undoes a no-show with a recorded reason', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false } as any);
  const appointmentId = '00000000-0000-4000-9000-000000000602';
  const calls: Array<Record<string, unknown>> = [];
  await page.route('**/rest/v1/agendamentos*', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET' && url.searchParams.get('id') === `eq.${appointmentId}`) {
      expect(url.searchParams.get('clinica_id')).toBe(`eq.${clinicId}`);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        id: appointmentId, status: 'faltou', data: '2026-10-30', hora_inicio: '09:00:00', updated_at: '2026-10-30T12:00:00Z',
        pacientes: { nome: 'Pessoa Exemplo QA', nome_social: null },
      }) });
    }
    return route.fallback();
  });
  await page.route('**/rest/v1/rpc/corrigir_status_agendamento*', async route => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ corrigido: true, status: 'agendado' }) });
  });

  await page.goto(`/agenda/${appointmentId}/corrigir-status`);
  await expect(page.getByRole('heading', { name: 'Corrigir status da consulta' })).toBeVisible();
  await expect(page.locator('#main-content').getByText('Faltou', { exact: true })).toBeVisible();
  await page.getByLabel('Motivo da correção *').fill('Falta marcada antes da chegada do paciente');
  await page.locator('#main-content').getByRole('button', { name: 'Corrigir status', exact: true }).click();
  await expect(page.getByText('Status corrigido')).toBeVisible();
  expect(calls).toEqual([{ p_agendamento_id: appointmentId, p_motivo: 'Falta marcada antes da chegada do paciente', p_updated_at: '2026-10-30T12:00:00Z' }]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
