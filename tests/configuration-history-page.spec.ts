import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('configuração compara versões em página própria e restaura com controle de concorrência', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  const restoreWrites: unknown[] = [];
  const currentConfig = { nomeClinica: 'Clínica sintética atual', telefone: '1100000000' };
  const previousConfig = { nomeClinica: 'Clínica sintética anterior', telefone: '1199999999' };

  await page.route('http://127.0.0.1:54321/rest/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname === '/rest/v1/configuracoes_clinica_versoes') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: 'versao-atual', valor: currentConfig, criado_em: '2026-10-02T12:00:00Z', operacao: 'salvar', restaurada_de: null },
        { id: 'versao-anterior', valor: previousConfig, criado_em: '2026-10-01T12:00:00Z', operacao: 'salvar', restaurada_de: null },
      ]) });
      return;
    }
    if (request.method() === 'GET' && url.pathname === '/rest/v1/configuracoes_clinica') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { chave: 'config_clinica', valor: currentConfig, updated_at: 'versao-etag-sintetica' },
      ]) });
      return;
    }
    await route.fallback();
  });
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/restaurar_configuracao_clinica_versao', async route => {
    restoreWrites.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/configuracoes?tab=clinica');
  await page.getByRole('button', { name: 'Histórico e versões' }).click();
  await expect(page).toHaveURL(/\/configuracoes\/historico-versoes\?chave=config_clinica&origem=clinica$/);
  await expect(page.getByRole('heading', { name: 'Histórico de versões' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('configuration-history-desktop.png'), animations: 'disabled' });
  await page.getByRole('button', { name: /Alteração salva/ }).last().click();
  await expect(page.getByText('Clínica sintética anterior')).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const restore = page.getByRole('button', { name: 'Restaurar versão comparada' });
  await restore.scrollIntoViewIfNeeded();
  const navigation = page.getByRole('navigation', { name: 'Navegação principal' });
  const [restoreBox, navBox] = await Promise.all([restore.boundingBox(), navigation.boundingBox()]);
  expect(restoreBox && navBox && restoreBox.y + restoreBox.height <= navBox.y, JSON.stringify({ restoreBox, navBox })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('configuration-history-mobile.png'), fullPage: true, animations: 'disabled' });

  await restore.click();
  await expect(page).toHaveURL(/\/configuracoes\?tab=clinica$/);
  expect(restoreWrites).toEqual([{ p_versao_id: 'versao-anterior', p_versao_esperada: 'versao-etag-sintetica' }]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('configurações encaminha salas e leitos ao workspace operacional', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/configuracoes?tab=salas');
  await page.getByRole('link', { name: 'Abrir salas e leitos' }).click();

  await expect(page).toHaveURL(/\/gestao-fluxo\?tab=salas$/);
  await expect(page.getByRole('heading', { name: 'Salas e Leitos', level: 1 })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('settings-rooms-workspace-mobile.png'), fullPage: true, animations: 'disabled' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('histórico de faturas da assinatura funciona em página própria', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  const rpcCalls: unknown[] = [];
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/historico_cobranca_assinatura', async route => {
    rpcCalls.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { id: 'fatura-sintetica', origem: 'fatura_recorrente', referencia: 'ref-1', metodo: 'cartao', valor: 149.9, status: 'approved', detalhe: null, criado_em: '2026-10-29T12:00:00Z', atualizado_em: '2026-10-29T12:00:00Z' },
    ]) });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/configuracoes?tab=plano');
  await page.getByRole('link', { name: 'Ver histórico de faturas' }).click();
  await expect(page).toHaveURL('/configuracoes/plano/faturas');
  await expect(page.getByRole('heading', { name: 'Histórico de faturas' })).toBeVisible();
  await expect(page.getByText('Fatura recorrente').first()).toBeVisible();
  await expect(page.getByText('Pago').first()).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('configuration-billing-history-desktop.png'), animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByText('R$ 149,90').last()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('configuration-billing-history-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('link', { name: 'Voltar ao plano' }).click();
  await expect(page).toHaveURL('/configuracoes?tab=plano');
  expect(rpcCalls).toEqual([{ p_limit: 50 }]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('histórico de faturas explica a falha e permite tentar novamente', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  let allowEmptyResponse = false;
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/historico_cobranca_assinatura', async route => {
    await route.fulfill(allowEmptyResponse
      ? { status: 200, contentType: 'application/json', body: '[]' }
      : { status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'falha sintética' }) });
  });

  await page.goto('/configuracoes/plano/faturas');
  await expect(page.getByRole('alert')).toBeVisible();
  allowEmptyResponse = true;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('status').getByText('Nenhuma fatura encontrada ainda.')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('configurações encaminha backup e importação para páginas próprias', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/configuracoes?tab=backup');

  await page.getByRole('link', { name: 'Abrir backup' }).click();
  await expect(page).toHaveURL('/configuracoes/backup');
  await expect(page.getByRole('heading', { name: 'Backup e recuperação' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('link', { name: 'Voltar às configurações' }).click();
  await expect(page).toHaveURL('/configuracoes?tab=backup');
  await page.getByRole('link', { name: 'Abrir importação' }).click();
  await expect(page).toHaveURL('/configuracoes/importar-dados');
  await expect(page.getByRole('heading', { name: 'Importar dados' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('prévia de restauração é uma tela completa sem modal e mantém o arquivo em memória', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/tabelas_para_backup', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(['pacientes']) });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/pacientes**', async route => {
    if (route.request().method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/1' }, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/configuracoes/backup');
  const backup = {
    version: '3.0', createdAt: '2026-10-30T12:00:00.000Z', type: 'manual', completo: true,
    collections: { pacientes: [{ id: 'paciente-sintetico', clinica_id: 'clinica-sintetica' }] },
    metadata: { totalRecords: 1, tablesCount: 1, tabelasComFalha: [], tabelasTruncadas: [], collectionCounts: { pacientes: 1 } },
  };
  await page.locator('input[type="file"]').setInputFiles({
    name: 'backup-sintetico.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
  });

  await expect(page.getByRole('heading', { name: 'Conferir restauração' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Impacto previsto' })).toBeVisible();
  await expect(page.getByText('1 registro', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restaurar Backup' })).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('backup-restore-preview-desktop.png'), fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('backup-restore-preview-mobile.png'), fullPage: true, animations: 'disabled' });
  const restore = page.getByRole('button', { name: 'Restaurar Backup' });
  await restore.scrollIntoViewIfNeeded();
  const navigation = page.getByRole('navigation', { name: 'Navegação principal' });
  const [restoreBox, navBox] = await Promise.all([restore.boundingBox(), navigation.boundingBox()]);
  expect(restoreBox && navBox && restoreBox.y + restoreBox.height <= navBox.y, JSON.stringify({ restoreBox, navBox })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('backup-restore-preview-mobile-actions.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Escolher outro arquivo' }).first().click();
  await expect(page.getByRole('heading', { name: 'Backup e recuperação' })).toBeVisible();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
