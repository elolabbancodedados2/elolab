import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
const clinic = '00000000-0000-4000-8000-000000000002';
const patient = '00000000-0000-4000-8000-000000000004';
async function fillRequest(page: Page) {
  await page.getByLabel('Paciente *', { exact: true }).click();
  await page.getByRole('option', { name: /Pessoa Exemplo QA/ }).click();
  await page.getByLabel('Especialidade *', { exact: true }).click();
  await page.getByRole('option', { name: 'Cardiologia', exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.getByLabel('Motivo', { exact: true }).fill('Pedido sintético de vaga');
}
for (const width of [1440, 768, 390]) {
  test(`waiting request has a dedicated page at ${width}px`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'recepcao', platformAdmin: false, prontuarioPopulated: true });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/gestao-fluxo?tab=espera&origem=qa');
    await page.getByRole('button', { name: 'Adicionar à Lista', exact: true }).click();
    await expect(page).toHaveURL('/gestao-fluxo/espera/nova');
    await expect(page.getByRole('heading', { name: 'Adicionar à lista de espera', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`waiting-create-${width}.png`) });
    await fillRequest(page);
    await page.getByRole('button', { name: 'Adicionar', exact: true }).scrollIntoViewIfNeeded();
    await expect.poll(async () => { const box = await page.getByRole('button', { name: 'Adicionar', exact: true }).boundingBox(); return box ? box.y + box.height : Infinity; }).toBeLessThanOrEqual(width < 1024 ? 840 : 900);
    await page.screenshot({ path: info.outputPath(`waiting-footer-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByLabel('Motivo', { exact: true })).toHaveValue('Pedido sintético de vaga');
    await page.getByRole('button', { name: 'Voltar à lista de espera' }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL('/gestao-fluxo?tab=espera&origem=qa');
    await expect(page.getByRole('tab', { name: 'Lista de espera', exact: true })).toHaveAttribute('data-state', 'active');
  });
}
test('waiting request keeps duplicate prevention and recovers failed insert', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, prontuarioPopulated: true });
  let duplicate = true;
  let writes = 0;
  await page.route('**/rest/v1/lista_espera*', route => {
    const request = route.request();
    if (request.method() === 'GET') {
      const params = new URL(request.url()).searchParams;
      if (params.get('select') === 'id,status') {
        expect(params.get('clinica_id')).toBe(`eq.${clinic}`);
        expect(params.get('paciente_id')).toBe(`eq.${patient}`);
        expect(params.get('especialidade')).toBe('eq.Cardiologia');
        return route.fulfill({ json: duplicate ? [{ id: 'duplicate-qa', status: 'aguardando' }] : [] });
      }
      return route.fulfill({ json: [] });
    }
    writes++;
    expect(request.postDataJSON()).toMatchObject({ clinica_id: clinic, paciente_id: patient, especialidade: 'Cardiologia', motivo: 'Pedido sintético de vaga', status: 'aguardando', medico_id: null });
    return route.fulfill(writes === 1 ? { status: 400, json: { message: 'Falha sintética na inclusão' } } : { status: 201, json: null });
  });
  await page.goto('/gestao-fluxo/espera/nova');
  await fillRequest(page);
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(page.getByText('Este pedido já está na lista de espera.', { exact: true })).toBeVisible();
  expect(writes).toBe(0);
  duplicate = false;
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(page.getByText('Falha sintética na inclusão', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Motivo', { exact: true })).toHaveValue('Pedido sintético de vaga');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(page).toHaveURL('/gestao-fluxo?tab=espera');
  expect(writes).toBe(2);
});
test('waiting request route keeps the workspace role restriction', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), role: 'medico', platformAdmin: false });
  await page.goto('/gestao-fluxo/espera/nova');
  await expect(page.getByRole('heading', { name: 'Acesso Negado', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar', exact: true })).toHaveCount(0);
});
