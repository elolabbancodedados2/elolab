import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const id = '00000000-0000-4000-8000-000000000041';
async function guideFixture(page: Page, origin: string) {
  const clinic = await installSyntheticClinic(page, { appOrigin: origin, platformAdmin: false });
  let guide = { id, clinica_id: clinic.clinicId, paciente_id: '00000000-0000-4000-8000-000000000004', paciente_nome: 'Paciente Guia QA', status: 'recebida', origem: 'manual', data_recebimento: '2026-10-29T15:00:00Z', medico_externo_nome: 'Solicitante QA', exames_solicitados: [{ nome: 'Hemograma' }], status_terceirizacao: 'nao_enviado' };
  let fail = false; let readFail = false; let missing = false;
  const writes: any[] = []; const calls: any[] = [];
  await page.route('**/rest/v1/guias_externas?*', route => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('clinica_id')).toBe(`eq.${clinic.clinicId}`);
    if (route.request().method() === 'GET') return route.fulfill(readFail ? { status: 400, json: { message: 'Leitura QA indisponível' } } : { json: missing ? [] : [guide] });
    const body = route.request().postDataJSON(); writes.push(body);
    if (fail) return route.fulfill({ status: 400, json: { message: 'Salvamento QA indisponível' } });
    guide = { ...guide, ...body };
    return route.fulfill({ json: [{ id }] });
  });
  await page.route('**/rest/v1/laboratorios?*', route => route.fulfill({ json: [{ id: 'parceiro-qa', nome: 'Laboratório QA' }] }));
  await page.route('**/rest/v1/guias_externas_eventos_lab?*', route => route.fulfill({ json: [{ id: 'evento-qa', tipo: 'parceiro_registrado', created_at: '2026-10-29T15:00:00Z' }] }));
  await page.route('**/rest/v1/rpc/*guia_externa*', route => {
    calls.push({ url: route.request().url(), body: route.request().postDataJSON() });
    guide = { ...guide, status: route.request().url().includes('agendar_') ? 'agendada' : 'encaminhada_fila' };
    return route.fulfill({ json: { id } });
  });
  return { clinic, writes, calls, fail: (value: boolean) => fail = value, readFail: (value: boolean) => readFail = value, missing: (value: boolean) => missing = value };
}

for (const width of [1440, 768, 390]) {
  test(`guide detail at ${width}px preserves context and draft`, async ({ page }, info) => {
    await guideFixture(page, String(info.project.use.baseURL));
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/guias-externas');
    await page.getByLabel('Buscar guias externas', { exact: true }).fill('Paciente Guia');
    await page.getByRole('button', { name: 'Abrir', exact: true }).click();
    await expect(page).toHaveURL(`/guias-externas/${id}`);
    await expect(page.getByRole('heading', { name: 'Guia externa', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: `.qa-artifacts/guide-workspaces-20261029/detail-${width}.png` });
    await page.getByLabel('Custo do parceiro (R$)', { exact: true }).fill('12,50');
    const action = page.getByRole('button', { name: 'Enviar para fila de coleta', exact: true });
    await action.evaluate(el => el.scrollIntoView({ block: 'center' }));
    expect((await action.boundingBox())!.y + (await action.boundingBox())!.height).toBeLessThanOrEqual(width < 1024 ? 900 : 960);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.qa-artifacts/guide-workspaces-20261029/footer-${width}.png` });
    await page.getByRole('link', { name: 'Voltar às guias', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByLabel('Custo do parceiro (R$)', { exact: true })).toHaveValue('12,50');
    await page.getByRole('link', { name: 'Voltar às guias', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page.getByLabel('Buscar guias externas', { exact: true })).toHaveValue('Paciente Guia');
  });
}

test('guide saves partner, schedules and sends to queue through existing RPCs without losing draft', async ({ page }, info) => {
  const fixture = await guideFixture(page, String(info.project.use.baseURL));
  await page.goto(`/guias-externas/${id}`);
  await page.getByLabel('Custo do parceiro (R$)', { exact: true }).fill('-1');
  await page.getByRole('button', { name: 'Salvar acompanhamento' }).click();
  await expect(page.getByText('Informe um custo válido, igual ou maior que zero.', { exact: true })).toBeVisible();
  expect(fixture.writes).toHaveLength(0);
  await page.getByLabel('Custo do parceiro (R$)', { exact: true }).fill('12,50');
  fixture.fail(true);
  await page.getByRole('button', { name: 'Salvar acompanhamento' }).click();
  await expect(page.getByText('Salvamento QA indisponível', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Custo do parceiro (R$)', { exact: true })).toHaveValue('12,50');
  fixture.fail(false);
  await page.getByRole('button', { name: 'Salvar acompanhamento' }).click();
  await expect(page.getByText('Acompanhamento do laboratório externo salvo.', { exact: true })).toBeVisible();
  expect(fixture.writes[1]).toMatchObject({ custo_laboratorio: 12.5, status_terceirizacao: 'nao_enviado' });
  await page.getByLabel('Custo do parceiro (R$)', { exact: true }).fill('25');
  await page.getByRole('button', { name: 'Agendar coleta', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
  await expect(page.getByText('Informe uma data e hora válidas.', { exact: true })).toBeVisible();
  await page.getByLabel('Data', { exact: true }).fill('2026-11-10');
  await page.getByLabel('Hora', { exact: true }).fill('10:00');
  await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
  await expect(page.getByText('Agendada', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Custo do parceiro (R$)', { exact: true })).toHaveValue('25');
  await page.getByRole('button', { name: 'Enviar para fila de coleta' }).click();
  await expect(page.getByText('Na fila', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar para fila de coleta' })).toHaveCount(0);
  expect(fixture.calls).toHaveLength(2);
  expect(fixture.calls[0].body).toMatchObject({ p_guia_id: id, p_clinica_id: fixture.clinic.clinicId, p_data: '2026-11-10', p_hora: '10:00' });
  expect(fixture.calls[1].url).toContain('encaminhar_guia_externa_para_fila');
  await page.getByRole('link', { name: 'Voltar às guias' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
});

test('guide distinguishes read failure, retry and unavailable record', async ({ page }, info) => {
  const fixture = await guideFixture(page, String(info.project.use.baseURL));
  fixture.readFail(true);
  await page.goto(`/guias-externas/${id}`);
  await expect(page.getByText('Não foi possível carregar a guia', { exact: true })).toBeVisible();
  fixture.readFail(false); fixture.missing(true);
  await page.getByRole('button', { name: /Tentar novamente/i }).click();
  await expect(page.getByRole('heading', { name: 'Guia não encontrada' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar para fila de coleta' })).toHaveCount(0);
});

for (const width of [1440, 768, 390]) {
  test(`portal page at ${width}px has readable state and protects draft`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
    await page.route('**/rest/v1/portal_guias_tokens*', route => route.fulfill({ json: [{ id: 'token-qa', descricao: 'Parceiro QA', ativo: true, token: 'synthetic-not-a-credential' }] }));
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/guias-externas/portal');
    await expect(page.getByRole('heading', { name: 'Portal externo de guias', exact: true })).toBeVisible();
    await expect(page.getByText('Ativo · Nunca usado', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByLabel('Descrição (opcional)').fill('Novo parceiro QA');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.qa-artifacts/guide-workspaces-20261029/portal-${width}.png` });
    await page.getByRole('link', { name: 'Voltar às guias' }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL('/guias-externas');
  });
}

test('portal preserves create, disable and delete with clinic scoping and failure recovery', async ({ page }, info) => {
  const fixture = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  let tokens: any[] = []; let fail = true; const requests: any[] = [];
  await page.route('**/rest/v1/portal_guias_tokens*', route => {
    const method = route.request().method();
    if (method === 'GET') return route.fulfill({ json: tokens });
    const body = route.request().postDataJSON(); requests.push({ method, body });
    if (fail) return route.fulfill({ status: 400, json: { message: 'Portal QA indisponível' } });
    if (method === 'POST') tokens = [{ id: 'token-qa', ativo: true, token: 'synthetic', ...body }];
    else {
      expect(new URL(route.request().url()).searchParams.get('clinica_id')).toBe(`eq.${fixture.clinicId}`);
      if (method === 'PATCH') tokens[0] = { ...tokens[0], ...body };
      if (method === 'DELETE') tokens = [];
    }
    return route.fulfill({ json: method === 'POST' ? null : [{ id: 'token-qa' }] });
  });
  await page.goto('/guias-externas/portal');
  await expect(page.getByText('Nenhum link gerado.', { exact: true })).toBeVisible();
  await page.getByLabel('Descrição (opcional)').fill('Parceiro QA');
  await page.getByRole('button', { name: 'Gerar link' }).click();
  await expect(page.getByText('Portal QA indisponível', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Descrição (opcional)')).toHaveValue('Parceiro QA');
  fail = false;
  await page.getByRole('button', { name: 'Gerar link' }).click();
  await expect(page.getByLabel('Descrição (opcional)')).toHaveValue('');
  expect(requests[1].body).toMatchObject({ descricao: 'Parceiro QA', clinica_id: fixture.clinicId });
  await page.getByRole('switch', { name: 'Desativar link Parceiro QA' }).click();
  await expect(page.getByText('Inativo · Nunca usado', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Excluir link Parceiro QA' }).click();
  await expect(page.getByText('Nenhum link gerado.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar às guias' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('finance cannot open either guide workspace', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'financeiro' });
  for (const path of [`/guias-externas/${id}`, '/guias-externas/portal']) {
    await page.goto(path);
    await expect(page.getByText('Acesso Negado', { exact: true })).toBeVisible();
  }
});

for (const linked of [false, true]) {
  test(`partner PDF is ${linked ? 'preserved after a lost server response' : 'removed on confirmed discard'}`, async ({ page }, info) => {
    const fixture = await guideFixture(page, String(info.project.use.baseURL));
    let checks = 0; let removals = 0;
    await page.route('**/rest/v1/guias_externas?*', route => {
      const params = new URL(route.request().url()).searchParams;
      if (!params.has('laudo_externo_url')) return route.fallback();
      checks++;
      expect(params.get('clinica_id')).toBe(`eq.${fixture.clinic.clinicId}`);
      return route.fulfill({ json: linked ? [{ id }] : [] });
    });
    await page.route('**/storage/v1/object/guias-externas**', route => {
      if (route.request().method() === 'DELETE') removals++;
      return route.fulfill({ json: route.request().method() === 'DELETE' ? [] : { Key: 'arquivo-qa.pdf' } });
    });
    await page.goto(`/guias-externas/${id}`);
    await page.getByLabel('Laudo PDF do laboratório parceiro').setInputFiles({ name: 'laudo-qa.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 QA synthetic') });
    await expect(page.getByRole('button', { name: 'laudo-qa.pdf', exact: true })).toBeVisible();
    fixture.fail(true);
    await page.getByRole('button', { name: 'Salvar acompanhamento' }).click();
    await expect(page.getByText('Salvamento QA indisponível', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Voltar às guias' }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    expect(removals).toBe(0);
    await page.getByRole('link', { name: 'Voltar às guias' }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect.poll(() => checks).toBe(1);
    if (linked) expect(removals).toBe(0);
    else await expect.poll(() => removals).toBe(1);
  });
}
