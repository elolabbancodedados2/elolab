import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
for (const width of [1440, 768, 390]) {
  test(`laboratory order page at ${width}px protects its draft`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/laboratorio/pedidos/novo');
    await expect(page.getByRole('heading', { name: 'Novo pedido laboratorial', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByLabel('Nome do exame 1', { exact: true }).fill('Exame QA');
    await page.screenshot({ path: `.qa-artifacts/lab-orders-20261029/new-${width}.png` });
    const save = page.getByRole('button', { name: 'Registrar pedido', exact: true });
    await save.evaluate(element => element.scrollIntoView({ block: 'center' }));
    await expect(save).toBeDisabled();
    const box = await save.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(width < 1024 ? 900 : 960);
    await page.screenshot({ path: `.qa-artifacts/lab-orders-20261029/footer-${width}.png` });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByLabel('Nome do exame 1', { exact: true })).toHaveValue('Exame QA');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL('/laboratorio?aba=pedidos');
    await expect(page.getByRole('heading', { name: 'Pedidos de exames', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('order history loads by identifier beyond the worklist, scopes events and preserves search', async ({ page }, info) => {
  const fixture = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  const id = '00000000-0000-4000-9000-000000000171';
  const record = { id, codigo: 'LAB-QA-171', status: 'em_processamento', prioridade: 'urgente', solicitado_em: '2026-10-29T10:00:00Z', pacientes: { nome: 'Paciente QA' }, exames: [{ id: 'exame', tipo_exame: 'Hemograma QA', status: 'solicitado' }] };
  await page.route('**/rest/v1/pedidos_laboratorio*', route => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('clinica_id')).toBe(`eq.${fixture.clinicId}`);
    if (params.has('id')) expect(params.get('id')).toBe(`eq.${id}`);
    return route.fulfill({ json: [record] });
  });
  let fail = true;
  await page.route('**/rest/v1/pedido_laboratorio_eventos*', route => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('clinica_id')).toBe(`eq.${fixture.clinicId}`);
    expect(params.get('pedido_id')).toBe(`eq.${id}`);
    return route.fulfill(fail ? { status: 403, json: { message: 'Falha sintética do histórico' } } : { json: [{ id: 'evento', tipo: 'pedido_criado', created_at: '2026-10-29T10:00:00Z', detalhes: {} }] });
  });
  await page.goto('/laboratorio?aba=pedidos');
  await page.getByLabel('Buscar pedidos').fill('Hemograma');
  await page.getByRole('button', { name: 'Ver histórico do pedido LAB-QA-171', exact: true }).filter({ visible: true }).click();
  await expect(page.getByText('Não foi possível carregar o histórico', { exact: true })).toBeVisible({ timeout: 15000 });
  fail = false;
  await page.getByRole('button', { name: /Tentar novamente/ }).click();
  await expect(page.getByText('Pedido criado', { exact: true })).toBeVisible();
  await page.screenshot({ path: '.qa-artifacts/lab-orders-20261029/history.png' });
  await page.getByRole('link', { name: 'Voltar aos pedidos' }).click();
  await expect(page.getByLabel('Buscar pedidos')).toHaveValue('Hemograma');
});

test('missing order and finance access cannot expose the form or history', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await page.goto('/laboratorio/pedidos/ausente/historico');
  await expect(page.getByText('Pedido não encontrado nesta clínica.', { exact: true })).toBeVisible();
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'financeiro' });
  await page.goto('/laboratorio/pedidos/novo');
  await expect(page.getByText('Acesso Negado', { exact: true })).toBeVisible();
});
