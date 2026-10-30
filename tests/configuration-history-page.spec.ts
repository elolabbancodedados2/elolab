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
