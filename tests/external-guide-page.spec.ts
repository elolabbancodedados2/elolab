import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
for (const width of [1440, 768, 390]) {
  test(`new external guide at ${width}px uses integrated sections and protects draft`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/guias-externas/nova');
    await expect(page.getByRole('heading', { name: 'Nova guia externa', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await page.getByLabel('Nome completo *', { exact: true }).fill('Pessoa Exemplo QA');
    await page.screenshot({ path: `.qa-artifacts/external-guide-20261029/new-${width}.png` });
    const save = page.getByRole('button', { name: 'Registrar guia', exact: true });
    await save.evaluate(el => el.scrollIntoView({ block: 'center' }));
    expect((await save.boundingBox())!.y + (await save.boundingBox())!.height).toBeLessThanOrEqual(width < 1024 ? 900 : 960);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.qa-artifacts/external-guide-20261029/footer-${width}.png` });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByLabel('Nome completo *', { exact: true })).toHaveValue('Pessoa Exemplo QA');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL('/guias-externas');
  });
}

test('guide validates patient and exams, recovers save failure and restores list search', async ({ page }, info) => {
  const fixture = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  let fail = true;
  const writes: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/guias_externas*', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    const data = route.request().postDataJSON(); writes.push(Array.isArray(data) ? data[0] : data);
    return route.fulfill(fail ? { status: 400, json: { message: 'Falha QA ao salvar guia' } } : { status: 201, json: null });
  });
  await page.goto('/guias-externas');
  await page.getByLabel('Buscar guias externas', { exact: true }).fill('Pessoa QA');
  await page.getByRole('button', { name: 'Nova guia', exact: true }).first().click();
  await page.getByLabel('Nome completo *', { exact: true }).fill('Pessoa Exemplo QA');
  const save = page.getByRole('button', { name: 'Registrar guia', exact: true });
  await save.click();
  await expect(page.getByText('Liste ao menos um exame', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.getByLabel('Exames solicitados (um por linha) *', { exact: true }).fill('Hemograma\nGlicemia');
  await page.getByLabel('CPF', { exact: true }).fill('11111111111');
  await save.click();
  await expect(page.getByText('CPF inválido. Confira os números digitados.', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.getByLabel('CPF', { exact: true }).fill('');
  await save.click();
  await expect(page.getByText('Falha QA ao salvar guia', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Exames solicitados (um por linha) *', { exact: true })).toHaveValue('Hemograma\nGlicemia');
  fail = false;
  await save.click();
  await expect(page).toHaveURL('/guias-externas');
  await expect(page.getByLabel('Buscar guias externas', { exact: true })).toHaveValue('Pessoa QA');
  expect(writes).toHaveLength(2);
  expect(writes[1]).toMatchObject({ clinica_id: fixture.clinicId, origem: 'manual', status: 'recebida', exames_solicitados: [{ nome: 'Hemograma' }, { nome: 'Glicemia' }] });
});

for (const persisted of [false, true]) {
  test(`discarded attachment is ${persisted ? 'preserved when linked on server' : 'removed only after confirmed discard'}`, async ({ page }, info) => {
    const fixture = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
    let removals = 0; let checks = 0;
    await page.route('**/storage/v1/object/guias-externas**', route => {
      if (route.request().method() === 'DELETE') removals++;
      return route.fulfill({ json: route.request().method() === 'DELETE' ? [] : { Key: 'arquivo.pdf' } });
    });
    await page.route('**/rest/v1/guias_externas*', route => {
      const params = new URL(route.request().url()).searchParams;
      if (params.has('anexo_url')) {
        checks++;
        expect(params.get('clinica_id')).toBe(`eq.${fixture.clinicId}`);
        return route.fulfill({ json: persisted ? [{ id: 'guia-persistida' }] : [] });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto('/guias-externas/nova');
    await page.getByLabel('Anexo da guia (PDF/imagem)', { exact: true }).setInputFiles({ name: 'arquivo-qa.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 QA synthetic') });
    await expect(page.getByText('arquivo-qa.pdf', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    expect(removals).toBe(0);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL('/guias-externas');
    await expect.poll(() => checks).toBe(1);
    if (!persisted) await expect.poll(() => removals).toBe(1);
    else expect(removals).toBe(0);
  });
}

test('finance cannot open the external guide form', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'financeiro' });
  await page.goto('/guias-externas/nova');
  await expect(page.getByText('Acesso Negado', { exact: true })).toBeVisible();
});
