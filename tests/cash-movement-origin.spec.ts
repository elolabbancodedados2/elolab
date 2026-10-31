import { expect, test, type Route } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const todaySaoPaulo = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const json = (route: Route, body: unknown) => route.fulfill({
  status: 200, contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/*' },
  body: JSON.stringify(body),
});

test('caixa diário só libera editar e excluir o que o caixa lançou e mostra a origem do resto', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'admin', accountsPopulated: true });
  const today = todaySaoPaulo();
  const cashId = '00000000-0000-4000-9000-000000000171';
  const movements = [
    { id: '00000000-0000-4000-9000-000000000181', tipo: 'receita', valor: 420, forma_pagamento: 'cartao_credito', categoria: 'consulta', descricao: 'Pagamento: Consulta de retorno', created_at: `${today}T09:00:00-03:00`, origem_pagamento: true },
    { id: '00000000-0000-4000-9000-000000000182', tipo: 'sangria', valor: 200, forma_pagamento: 'dinheiro', categoria: 'sangria', descricao: 'Sangria — Depósito no banco', created_at: `${today}T10:00:00-03:00`, origem_pagamento: false },
    { id: '00000000-0000-4000-9000-000000000183', tipo: 'despesa', valor: 35, forma_pagamento: 'dinheiro', categoria: 'Limpeza', descricao: 'Material de limpeza', created_at: `${today}T10:30:00-03:00`, origem_pagamento: false },
    { id: '00000000-0000-4000-9000-000000000184', tipo: 'despesa', valor: 1800, forma_pagamento: 'pix', categoria: 'honorario_medico', descricao: 'Repasse médico — Dra. QA', created_at: `${today}T11:00:00-03:00`, origem_pagamento: false },
    { id: '00000000-0000-4000-9000-000000000185', tipo: 'despesa', valor: 90, forma_pagamento: 'convenio', categoria: 'ajuste_convenio', descricao: 'Correção de recebimento do lote TISS 0042', created_at: `${today}T11:30:00-03:00`, origem_pagamento: false },
  ];

  await page.route('http://127.0.0.1:54321/rest/v1/caixa_diario**', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    if (url.searchParams.get('data')?.startsWith('lt.')) return json(route, []);
    return json(route, [{
      id: cashId, data: today, aberto: true, valor_abertura: 150, valor_fechamento: null,
      operador_abertura: 'Conta QA sintética', operador_fechamento: null, observacoes: null,
      clinica_id: synthetic.clinicId, created_at: `${today}T08:00:00-03:00`, updated_at: `${today}T08:00:00-03:00`,
    }]);
  });
  await page.route('http://127.0.0.1:54321/rest/v1/caixa_diario_eventos**', route => json(route, []));
  await page.route('**/rest/v1/rpc/movimentos_caixa_diario**', route => json(route, movements));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/caixa-diario', { waitUntil: 'networkidle' });
  const table = page.getByRole('table').filter({ hasText: 'Repasse médico — Dra. QA' });
  await expect(table).toBeVisible();

  const row = (text: string) => table.getByRole('row').filter({ hasText: text });
  await expect(row('Sangria — Depósito no banco').getByRole('button', { name: 'Editar lançamento' })).toBeVisible();
  await expect(row('Material de limpeza').getByRole('button', { name: 'Excluir lançamento' })).toBeVisible();
  await expect(row('Repasse médico — Dra. QA').getByRole('button', { name: /Editar|Excluir/ })).toHaveCount(0);
  await expect(row('Repasse médico — Dra. QA').getByRole('button', { name: /abrir Repasse/ })).toBeVisible();
  await expect(row('lote TISS 0042').getByRole('button', { name: /Editar|Excluir/ })).toHaveCount(0);
  await expect(row('lote TISS 0042').getByRole('button', { name: /abrir Convênio/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await table.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('cash-daily-origin-desktop.png'), fullPage: true, animations: 'disabled' });

  await row('Repasse médico — Dra. QA').getByRole('button', { name: /abrir Repasse/ }).click();
  await expect(page).toHaveURL('/repasses-medicos');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('fluxo de caixa separa sangria e suprimento do saldo do mês', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'admin', accountsPopulated: true });
  const today = todaySaoPaulo();
  const base = {
    clinica_id: synthetic.clinicId, paciente_id: null, fornecedor: null, numero_documento: null,
    data: today, data_emissao: today, data_vencimento: today, data_pagamento: today, competencia: today.slice(0, 7),
    desconto: 0, acrescimo: 0, status: 'pago', recorrente: false, frequencia_recorrencia: null,
    centro_custo: 'geral', observacoes: null, created_at: `${today}T12:00:00Z`, updated_at: `${today}T12:00:00Z`,
  };
  const rows = [
    { ...base, id: '00000000-0000-4000-9000-000000000191', tipo: 'receita', categoria: 'consulta', descricao: 'Consulta QA', forma_pagamento: 'pix', valor: 1000, valor_pago: 1000 },
    { ...base, id: '00000000-0000-4000-9000-000000000192', tipo: 'despesa', categoria: 'Limpeza', descricao: 'Limpeza QA', forma_pagamento: 'dinheiro', valor: 300, valor_pago: 300 },
    { ...base, id: '00000000-0000-4000-9000-000000000193', tipo: 'sangria', categoria: 'sangria', descricao: 'Sangria — Depósito', forma_pagamento: 'dinheiro', valor: 400, valor_pago: 400 },
    { ...base, id: '00000000-0000-4000-9000-000000000194', tipo: 'suprimento', categoria: 'suprimento', descricao: 'Suprimento de Caixa', forma_pagamento: 'dinheiro', valor: 100, valor_pago: 100 },
  ];
  await page.route('http://127.0.0.1:54321/rest/v1/lancamentos**', route => route.request().method() === 'GET' ? json(route, rows) : route.fallback());
  await page.route('http://127.0.0.1:54321/rest/v1/pagamentos**', route => route.request().method() === 'GET' ? json(route, []) : route.fallback());

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/fluxo-caixa', { waitUntil: 'networkidle' });
  const resumo = page.getByRole('region', { name: 'Resumo do fluxo de caixa do mês' });
  await expect(resumo).toContainText('Entradas no mês');
  await expect(resumo.getByText('Entradas no mês').locator('..')).toContainText('R$ 1.000,00');
  await expect(resumo.getByText('Saídas no mês').locator('..')).toContainText('R$ 300,00');
  await expect(resumo.getByText('Saldo do mês').locator('..')).toContainText('R$ 700,00');
  const transferencias = page.getByRole('region', { name: 'Transferências internas do mês' });
  await expect(transferencias).toContainText('R$ 100,00');
  await expect(transferencias).toContainText('R$ 400,00');
  await expect(transferencias).toContainText('-R$ 300,00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('cash-flow-transfers-desktop.png'), fullPage: true, animations: 'disabled' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('pedido recebido oferece lançar a conta a pagar já preenchida', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'admin' });
  const pedidoId = 'ab12cd34-0000-4000-9000-000000000201';
  let recebido = false;
  const pedido = () => ({
    id: pedidoId, status: recebido ? 'recebido' : 'emitido', total: 487.5, created_at: new Date().toISOString(),
    recebido_em: recebido ? new Date().toISOString() : null, fornecedor_id: 'f-1', cotacao_id: null,
    fornecedores: { nome: 'Distribuidora QA' }, cotacoes_compra: null,
    pedido_compra_itens: [{ id: 'i-1', descricao: 'Luva', quantidade: 5, preco_unitario: 97.5, estoque_id: null }],
  });
  await page.route('http://127.0.0.1:54321/rest/v1/pedidos_compra**', route => route.request().method() === 'GET' ? json(route, [pedido()]) : route.fallback());
  await page.route('http://127.0.0.1:54321/rest/v1/fornecedores**', route => route.request().method() === 'GET' ? json(route, []) : route.fallback());
  await page.route('**/rest/v1/rpc/receber_pedido_compra', route => { recebido = true; return json(route, { entradas: 0 }); });

  await page.goto('/compras?aba=pedidos', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Receber pedido' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: /Receber|Confirmar/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Pedido nº AB12CD34 recebido' })).toBeVisible();
  await page.getByRole('button', { name: 'Lançar conta a pagar' }).click();
  await expect(page).toHaveURL('/contas/pagar/nova');
  await expect(page.locator('#payable-value')).toHaveValue('487.5');
  await expect(page.getByRole('textbox', { name: /Descrição/ })).toHaveValue('Pedido de compra nº AB12CD34 — Distribuidora QA');
  await expect(page.getByRole('textbox', { name: /Fornecedor/ })).toHaveValue('Distribuidora QA');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
