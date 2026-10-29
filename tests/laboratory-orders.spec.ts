import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('lab orders retain the form after a failed request and create a searchable multi-exam order', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  const pedidoId = '00000000-0000-4000-9000-000000000171';
  const rpcCalls: Array<Record<string, unknown>> = [];
  let failFirstAttempt = true;
  let pedidos: Array<Record<string, unknown>> = [];

  await page.route('**/rest/v1/pedidos_laboratorio**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pedidos) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/rpc/criar_pedido_laboratorio', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    rpcCalls.push(body);
    if (failFirstAttempt) {
      failFirstAttempt = false;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'SYNTHETIC_FAILURE', message: 'Falha sintética ao registrar pedido' }),
      });
      return;
    }
    pedidos = [{
      id: pedidoId,
      codigo: 'LAB-QA-001',
      status: 'solicitado',
      prioridade: body.p_prioridade,
      solicitado_em: new Date().toISOString(),
      indicacao_clinica: body.p_indicacao_clinica,
      pacientes: { nome: 'Pessoa Exemplo QA' },
      medicos: null,
      convenios: null,
      exames: (body.p_exames as Array<{ nome: string }>).map((exame, index) => ({
        id: `exame-${index + 1}`, tipo_exame: exame.nome, status: 'solicitado',
      })),
    }];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pedidoId) });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/laboratorio');
  const main = page.locator('#main-content');
  await main.getByRole('tab', { name: /Pedidos/ }).click();
  await expect(main.getByRole('heading', { name: 'Pedidos de exames' })).toBeVisible();
  await expect(main.getByRole('region', { name: 'Indicadores do laboratório hoje' })).toHaveCount(0);
  await expect(main.getByText('Ainda não há pedidos laboratoriais')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('lab-pedidos-vazio-1280.png'), animations: 'disabled' });

  await main.getByRole('button', { name: 'Registrar primeiro pedido' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Novo pedido laboratorial' })).toBeVisible();
  const patientPicker = dialog.getByRole('combobox', { name: 'Paciente' });
  await patientPicker.click();
  await page.getByPlaceholder('Buscar paciente...').fill('Pessoa Exemplo QA');
  await page.getByRole('option', { name: /Pessoa Exemplo QA/ }).click();
  const submit = dialog.getByRole('button', { name: 'Registrar pedido' });
  await expect(submit).toBeDisabled();

  await dialog.getByRole('combobox', { name: 'Prioridade' }).click();
  await page.getByRole('option', { name: 'Urgente', exact: true }).click();
  await dialog.getByLabel('Indicação clínica').fill('Acompanhamento de anemia sintomática.');
  await dialog.getByRole('textbox', { name: 'Nome do exame 1' }).fill('Hemograma completo');
  await dialog.getByRole('button', { name: 'Adicionar exame' }).click();
  await dialog.getByRole('textbox', { name: 'Nome do exame 2' }).fill('Ferritina');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText('Falha sintética ao registrar pedido')).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Nome do exame 1' })).toHaveValue('Hemograma completo');
  await expect(dialog.getByRole('textbox', { name: 'Nome do exame 2' })).toHaveValue('Ferritina');
  await submit.click();
  await expect(dialog).toHaveCount(0);

  expect(rpcCalls).toHaveLength(2);
  expect(rpcCalls[1]).toMatchObject({
    p_paciente_id: '00000000-0000-4000-8000-000000000004',
    p_prioridade: 'urgente',
    p_indicacao_clinica: 'Acompanhamento de anemia sintomática.',
    p_exames: [
      { catalog_id: null, nome: 'Hemograma completo' },
      { catalog_id: null, nome: 'Ferritina' },
    ],
  });
  const desktopOrders = main.getByRole('table');
  await expect(desktopOrders.getByText('LAB-QA-001')).toBeVisible();
  await expect(desktopOrders.getByText('Hemograma completo, Ferritina')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('lab-pedidos-criado-1280.png'), animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 844 });
  await main.evaluate(element => { element.scrollTop = 0; });
  const mobileOrders = main.getByRole('list', { name: 'Pedidos laboratoriais' });
  await expect(mobileOrders.getByText('Pessoa Exemplo QA')).toBeVisible();
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  const mobileHistory = mobileOrders.getByRole('button', { name: 'Ver histórico do pedido LAB-QA-001' });
  await expect(mobileHistory).toBeVisible();
  await expect(page.getByText('Pedido laboratorial registrado')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('lab-pedidos-390-inicio.png'), animations: 'disabled' });
  await mobileOrders.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('lab-pedidos-criado-390.png'), animations: 'disabled' });
  const orderSearch = main.getByRole('textbox', { name: 'Buscar pedidos' });
  await orderSearch.fill('Ferritina');
  await expect(mobileOrders.getByText('LAB-QA-001')).toBeVisible();
  await orderSearch.fill('pedido inexistente');
  await expect(main.getByText('Nenhum pedido encontrado')).toBeVisible();
  await orderSearch.fill('');
  await expect(mobileOrders.getByText('LAB-QA-001')).toBeVisible();
  await mobileHistory.click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Histórico do pedido' })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Nenhum evento registrado.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 740 });
  await main.evaluate(element => { element.scrollTop = 0; });
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await mobileOrders.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('lab-pedidos-320.png'), animations: 'disabled' });

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
});
