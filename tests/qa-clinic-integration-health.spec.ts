import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('exibe status e última comunicação sem exibir credencial ou URL externa', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  await installSyntheticClinic(page, { appOrigin });
  await page.route('http://127.0.0.1:54321/functions/v1/clinic-integrations', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        catalogo: [{ id: 'mercado_pago', nome: 'Mercado Pago', descricao: 'Conexão de pagamentos', escopo: 'clinica', campos: [] }],
        conexoes: [{
          provedor: 'mercado_pago', referencia_id: null, status: 'erro', config: { nickname: 'Conta QA' },
          segredo_dica: '••••1234', ultimo_erro: 'https://private.bad/secret?token=do-not-render',
          ultimo_teste_em: '2026-10-14T11:30:00.000Z', conectado_em: '2026-10-01T11:00:00.000Z', updated_at: '2026-10-14T11:30:00.000Z',
        }],
      }),
    });
  });

  await page.goto('/configuracoes?tab=integracoes');
  await expect(page.getByText('Mercado Pago', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Última tentativa de sincronização/)).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Falha na última comunicação');
  await expect(page.getByText(/private\.bad|do-not-render|1234/)).toHaveCount(0);
});
test('testa Mercado Pago com orientacao de correcao e sem gravar dados de pagamento', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin });
  const actions: Array<Record<string, unknown>> = [];
  await page.route('http://127.0.0.1:54321/functions/v1/clinic-integrations', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.action === 'test') {
      actions.push(body);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ healthy: false, code: 'credential_expired', checked_at: '2026-10-14T11:35:00.000Z' }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        catalogo: [{ id: 'mercado_pago', nome: 'Mercado Pago', descricao: 'Conexão de pagamentos', escopo: 'clinica', campos: [] }],
        conexoes: [{ provedor: 'mercado_pago', referencia_id: null, status: 'conectado', config: { nickname: 'Conta QA' }, ultimo_erro: null, ultimo_teste_em: null, conectado_em: '2026-10-01T11:00:00.000Z', updated_at: '2026-10-14T11:00:00.000Z' }],
      }),
    });
  });

  await page.goto('/configuracoes?tab=integracoes');
  await page.getByRole('button', { name: 'Testar conexão Mercado Pago' }).click();
  await expect(page.getByText('A autorização expirou. Reconecte a conta Mercado Pago para renovar o acesso.')).toBeVisible();
  expect(actions).toEqual([{ action: 'test', provedor: 'mercado_pago' }]);
  expect(synthetic.writes.filter((write) => /\/rest\/v1\/(pagamentos_mercadopago|lancamentos|mercadopago_point_orders)/.test(write))).toEqual([]);
});
