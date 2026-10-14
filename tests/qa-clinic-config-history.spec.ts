import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('compara snapshot persistido antes da restauração e registra a ação como nova revisão', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin });
  const currentAt = '2026-10-14T13:00:00.000Z';
  const originalAt = '2026-10-10T09:00:00.000Z';
  const previous = { nomeClinica: 'Clínica Original QA', cnpj: '', duracaoConsulta: 30, diasFuncionamento: ['seg', 'qua'] };
  let current = { nomeClinica: 'Clínica Atual QA', cnpj: '', duracaoConsulta: 45, diasFuncionamento: ['seg', 'qua'] };
  let updatedAt = currentAt;
  const restoreCalls: Array<{ body: unknown; url: string }> = [];
  const versionRows = [
    { id: '00000000-0000-4000-8000-000000000981', valor: current, criado_em: currentAt, operacao: 'salvar', restaurada_de: null },
    { id: '00000000-0000-4000-8000-000000000982', valor: previous, criado_em: originalAt, operacao: 'salvar', restaurada_de: null },
  ];

  await page.route('**/rest/v1/configuracoes_clinica*', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET' || !url.searchParams.get('chave')?.includes('config_clinica')) {
      await route.fallback();
      return;
    }
    const row = { chave: 'config_clinica', valor: current, updated_at: updatedAt };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.searchParams.has('select') && url.searchParams.get('select') === 'valor,updated_at' ? row : [row]) });
  });
  await page.route('**/rest/v1/configuracoes_clinica_versoes*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(versionRows) });
  });
  await page.route('**/rest/v1/rpc/restaurar_configuracao_clinica_versao', async route => {
    restoreCalls.push({ body: route.request().postDataJSON(), url: route.request().url() });
    current = previous;
    updatedAt = '2026-10-14T13:05:00.000Z';
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updatedAt) });
  });

  await page.goto('/configuracoes');
  await page.getByRole('button', { name: 'Histórico e versões' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Diferenças antes de restaurar' })).toBeVisible();
  await expect(dialog.getByText('nomeClinica', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Clínica Atual QA', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Clínica Original QA', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Alteração salva' }).last()).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Restaurar versão comparada' }).click();

  await expect.poll(() => restoreCalls.length).toBe(1);
  expect(restoreCalls[0].body).toEqual({ p_versao_id: versionRows[1].id, p_versao_esperada: currentAt });
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Nome da clínica')).toHaveValue('Clínica Original QA');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.filter((write) => /\/rest\/v1\/(pagamentos_mercadopago|lancamentos)/.test(write))).toEqual([]);
});
