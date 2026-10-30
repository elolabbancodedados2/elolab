import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('payable change history has its own clinic-scoped page and returns to the accounts list', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role: 'financeiro' });
  const accountId = '00000000-0000-4000-9000-000000000093';
  const rpcCalls: unknown[] = [];
  const account = {
    id: accountId, descricao: 'Serviço de laboratório QA', valor: 1275.5,
    data_vencimento: '2026-11-14', tipo: 'despesa', clinica_id: synthetic.clinicId,
  };

  await page.route('http://127.0.0.1:54321/rest/v1/lancamentos**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    expect(request.method()).toBe('GET');
    expect(url.searchParams.get('id')).toBe(`eq.${accountId}`);
    expect(url.searchParams.get('clinica_id')).toBe(`eq.${synthetic.clinicId}`);
    expect(url.searchParams.get('tipo')).toBe('eq.despesa');
    const wantsObject = request.headers().accept?.includes('application/vnd.pgrst.object+json');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(wantsObject ? account : [account]) });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/historico_alteracoes_lancamento', async route => {
    const payload = route.request().postDataJSON() as { p_lancamento_id: string };
    rpcCalls.push(payload);
    expect(payload.p_lancamento_id).toBe(accountId);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { alterado_em: '2026-10-20T13:00:00Z', alterado_por_nome: 'Financeiro QA', campo: 'valor', valor_anterior: '1200', valor_novo: '1275.5' },
      { alterado_em: '2026-10-19T11:00:00Z', alterado_por_nome: null, campo: 'data_vencimento', valor_anterior: '2026-11-10', valor_novo: '2026-11-14' },
    ]) });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/contas/pagar/${accountId}/historico`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Histórico de alterações' })).toBeVisible();
  await expect(page.getByText('Serviço de laboratório QA').first()).toBeVisible();
  await expect(page.getByText('Financeiro QA')).toBeVisible();
  await expect(page.getByText(/R\$\s1\.200,00/)).toBeVisible();
  await expect(page.getByRole('cell', { name: /R\$\s1\.275,50/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: '14/11/2026' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('payable-history-desktop.png'), fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('payable-history-mobile.png'), fullPage: true, animations: 'disabled' });
  const mobileLastCell = page.getByRole('cell', { name: /R\$\s1\.275,50/ });
  await mobileLastCell.scrollIntoViewIfNeeded();
  const [lastCellBox, mobileNavigationBox] = await Promise.all([
    mobileLastCell.boundingBox(), page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox(),
  ]);
  expect(lastCellBox && mobileNavigationBox && lastCellBox.y + lastCellBox.height <= mobileNavigationBox.y,
    JSON.stringify({ lastCellBox, mobileNavigationBox })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('payable-history-mobile-row.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Voltar às contas' }).click();
  await expect(page).toHaveURL('/contas?tab=pagar');
  expect(rpcCalls).toEqual([{ p_lancamento_id: accountId }]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('the history is not queried when the expense is outside the active clinic', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role: 'financeiro' });
  const accountId = '00000000-0000-4000-9000-000000000094';
  let historyCalls = 0;

  await page.route('http://127.0.0.1:54321/rest/v1/lancamentos**', async route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('clinica_id')).toBe(`eq.${synthetic.clinicId}`);
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/historico_alteracoes_lancamento', async route => {
    historyCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto(`/contas/pagar/${accountId}/historico`);
  await expect(page.getByRole('heading', { name: 'Conta indisponível' })).toBeVisible();
  expect(historyCalls).toBe(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('history load errors keep context and can be retried', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role: 'financeiro' });
  const accountId = '00000000-0000-4000-9000-000000000095';
  let historyCalls = 0;
  let allowEmptyHistory = false;

  await page.route('http://127.0.0.1:54321/rest/v1/lancamentos**', async route => {
    const account = { id: accountId, descricao: 'Despesa QA', valor: 200, data_vencimento: '2026-11-20', tipo: 'despesa', clinica_id: synthetic.clinicId };
    const wantsObject = route.request().headers().accept?.includes('application/vnd.pgrst.object+json');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(wantsObject ? account : [account]) });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/historico_alteracoes_lancamento', async route => {
    historyCalls += 1;
    if (!allowEmptyHistory) return route.fulfill({ status: 500, json: { message: 'falha sintética' } });
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto(`/contas/pagar/${accountId}/historico`);
  await expect(page.getByRole('heading', { name: 'Não foi possível carregar o histórico' })).toBeVisible();
  allowEmptyHistory = true;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('Nenhuma alteração de vencimento, valor, categoria ou centro de custo foi registrada.')).toBeVisible();
  expect(historyCalls).toBeGreaterThan(1);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
