import { expect, test, type Page, type Route } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const CLINIC_ID = '00000000-0000-4000-8000-000000000002';
const DOCTOR_ID = '00000000-0000-4000-8000-000000000093';
const ITEM_ID = '00000000-0000-4000-9000-000000000091';
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 1280, height: 800 }];

const todaySaoPaulo = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const daysBefore = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00-03:00`);
  value.setDate(value.getDate() - days);
  return value.toISOString().slice(0, 10);
};

async function fulfill(route: Route, data: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/1' }, body: JSON.stringify(data) });
}

// Registrado depois de installSyntheticClinic: o Playwright consulta primeiro
// as rotas mais recentes, então só estas tabelas recebem dados de cenário.
async function routeTable(page: Page, table: string, data: (url: URL) => unknown) {
  await page.route(`http://127.0.0.1:54321/rest/v1/${table}?**`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await fulfill(route, data(new URL(route.request().url())));
  });
}

const expectNoHorizontalOverflow = async (page: Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
};

test('cashier history uses the header success treatment for every open status', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  const today = todaySaoPaulo();
  await routeTable(page, 'caixa_diario', () => [{
    id: '00000000-0000-4000-9000-000000000081', clinica_id: CLINIC_ID, data: daysBefore(today, 1), aberto: true,
    valor_abertura: 100, valor_fechamento: null, operador_abertura: 'Recepção QA', operador_fechamento: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }]);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/recepcao?tab=caixa');
    const main = page.locator('#main-content');
    await main.getByRole('tab', { name: 'Histórico', exact: true }).click();

    const listBadge = main.getByText('Aberto', { exact: true });
    await expect(listBadge).toBeVisible();
    await expect(listBadge).toHaveClass(/bg-success\/10/);
    await expect(listBadge).toHaveClass(/text-success/);
    await expect(listBadge).not.toHaveClass(/bg-primary/);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`caixa-historico-aberto-${viewport.width}.png`), animations: 'disabled' });

    await listBadge.click();
    const dialog = page.getByRole('dialog');
    const dialogBadge = dialog.getByText('Aberto', { exact: true });
    await expect(dialogBadge).toHaveClass(/bg-success\/10/);
    await expect(dialogBadge).toHaveClass(/text-success/);
    await expect(dialogBadge).not.toHaveClass(/bg-primary/);
    await page.screenshot({ path: testInfo.outputPath(`caixa-detalhe-aberto-${viewport.width}.png`), animations: 'disabled' });
    await page.keyboard.press('Escape');
  }

  expect(synthetic.writes.filter((write) => !write.includes('/rpc/'))).toEqual([]);
});

test('service price table marks margins from 50% as success', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  await routeTable(page, 'configuracoes_clinica', (url) => (url.searchParams.get('chave') === 'eq.precos_exames_internos' ? [{
    valor: [
      { nome: 'Hemograma QA', codigo_tuss: null, descricao: '', valor: 100, custo: 50 },
      { nome: 'Glicemia QA', codigo_tuss: null, descricao: '', valor: 100, custo: 70 },
      { nome: 'Lipidograma QA', codigo_tuss: null, descricao: '', valor: 100, custo: 90 },
    ],
    updated_at: new Date().toISOString(),
  }] : []));

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/precos-servicos?tab=precos');
    const main = page.locator('#main-content');
    const margin = (name: string, value: string) => main.getByRole('row').filter({ hasText: name }).getByText(value, { exact: true });

    await expect(margin('Hemograma QA', '50%')).toHaveClass(/bg-success/);
    await expect(margin('Glicemia QA', '30%')).toHaveClass(/bg-secondary/);
    await expect(margin('Lipidograma QA', '10%')).toHaveClass(/bg-destructive/);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`precos-margem-${viewport.width}.png`), animations: 'disabled' });
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('stock timeline keeps ordinary movements out of the destructive palette', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false });
  const now = new Date().toISOString();
  await routeTable(page, 'estoque', () => [{
    id: ITEM_ID, clinica_id: CLINIC_ID, nome: 'Luva QA', descricao: null, categoria: 'material', quantidade: 40,
    quantidade_minima: 10, quantidade_maxima: null, unidade: 'caixa', valor_unitario: 10, preco_venda: null,
    fornecedor: null, lote: null, validade: null, localizacao: null, created_at: now, updated_at: now,
  }]);
  await routeTable(page, 'movimentacoes_estoque', () => [
    { id: '00000000-0000-4000-9000-000000000092', clinica_id: CLINIC_ID, item_id: ITEM_ID, tipo: 'saida', quantidade: 5, motivo: 'Uso em procedimento', created_at: now },
    { id: '00000000-0000-4000-9000-000000000093', clinica_id: CLINIC_ID, item_id: ITEM_ID, tipo: 'entrada', quantidade: 20, motivo: 'Compra', created_at: now },
  ]);

  for (const viewport of [...VIEWPORTS, { width: 390, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/estoque');
    const main = page.locator('#main-content');
    await expect(main.getByRole('button', { name: 'Registrar entrada de Luva QA' }).locator('svg')).toHaveClass(/text-success/);
    await expect(main.getByRole('button', { name: 'Registrar saída de Luva QA' }).locator('svg')).toHaveClass(/text-muted-foreground/);

    await main.getByRole('button', { name: 'Ver histórico de Luva QA' }).click();
    await expect(page).toHaveURL(`/estoque/${ITEM_ID}/historico`);
    const history = page.locator('#main-content');
    const entrada = history.getByText('↓ Entrada', { exact: true });
    const saida = history.getByText('↑ Saída', { exact: true });
    await expect(entrada).toHaveClass(/bg-success/);
    await expect(saida).toHaveClass(/bg-secondary/);
    await expect(saida).not.toHaveClass(/destructive/);
    await expect(history.locator('.bg-destructive')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`estoque-historico-${viewport.width}.png`), animations: 'disabled' });
    await page.getByRole('button', { name: 'Voltar ao estoque' }).click();
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('doctor report shows 50-79% completion with readable warning text', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  const today = todaySaoPaulo();
  const doctor = { id: DOCTOR_ID, nome: 'Dra. Taxa QA', crm: '0000', especialidade: 'Clínica geral', ativo: true, clinica_id: CLINIC_ID };
  await routeTable(page, 'medicos', () => [doctor]);
  await routeTable(page, 'agendamentos', () => ['finalizado', 'finalizado', 'confirmado'].map((status, index) => ({
    id: `00000000-0000-4000-9000-00000000010${index}`, clinica_id: CLINIC_ID, paciente_id: null, medico_id: DOCTOR_ID,
    data: today, hora_inicio: `0${8 + index}:00:00`, hora_fim: `0${8 + index}:20:00`, tipo: 'Consulta', status,
    pacientes: null, medicos: doctor,
  })));

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/relatorios');
    const main = page.locator('#main-content');
    await main.getByRole('tab', { name: 'Por Médico', exact: true }).click();
    const rate = main.getByRole('row').filter({ hasText: 'Dra. Taxa QA' }).getByText('67%', { exact: true });
    await expect(rate).toHaveClass(/bg-warning\/10/);
    await expect(rate).toHaveClass(/text-warning-foreground/);
    await rate.scrollIntoViewIfNeeded();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`relatorios-taxa-medico-${viewport.width}.png`), animations: 'disabled' });
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
