import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
test.setTimeout(90_000);

for (const width of [1280, 390]) {
  test(`reception workspaces keep controls named and content reachable at ${width}px`, async ({ page }, info) => {
    const synthetic = await installSyntheticClinic(page, {
      appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'recepcao',
      receptionPopulated: true, queuePopulated: true, agendaPopulated: true,
    });
    await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
    await page.route('**/rest/v1/platform_admins*', route => route.fulfill({ status: 200, json: null }));
    const errors: string[] = [];
    const failures: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${new URL(response.url()).pathname}`); });
    page.on('requestfailed', request => {
      const reason = request.failure()?.errorText;
      if (reason && !reason.includes('ERR_BLOCKED_BY_CLIENT') && reason !== 'net::ERR_ABORTED') failures.push(`${reason} ${new URL(request.url()).pathname}`);
    });
    await page.setViewportSize({ width, height: 844 });
    for (const [route, heading] of [
      ['/recepcao', 'Recepção'], ['/agenda', 'Agenda'], ['/fila', 'Fila de atendimento'],
      ['/fila/adicionar', 'Adicionar à fila'], ['/recepcao/encaixe', 'Encaixe sem agendamento'],
    ]) {
      await page.goto(route);
      const main = page.locator('#main-content');
      await expect(main.getByRole('heading', { level: 1, ...(route === '/agenda' ? {} : { name: heading, exact: true }) })).toBeVisible();
      await expect(main.locator('[aria-busy="true"]')).toHaveCount(0);
      if (route === '/recepcao') {
        if (width < 640) {
          await expect(main.getByRole('button', { name: 'Lista', exact: true })).toHaveAttribute('aria-pressed', 'true');
          await expect(main.getByTestId('reception-appointment-card').filter({ hasText: 'Ana Souza' })).toBeVisible();
          await expect(main.getByRole('group', { name: 'Resumo da recepção', includeHidden: true })).toBeHidden();
        } else {
          await expect(main.getByRole('button', { name: 'Selecionar Ana Souza', exact: true })).toBeVisible();
        }
        const search = main.getByRole('textbox', { name: 'Buscar paciente ou médico na recepção' });
        expect((await search.boundingBox())!.width, 'a busca precisa permitir ler e editar o nome').toBeGreaterThan(200);
        for (const label of ['Filtrar por médico', 'Ordenar pacientes']) {
          const filter = main.getByRole('combobox', { name: label });
          expect((await filter.boundingBox())!.width, `${label} precisa exibir o valor selecionado`).toBeGreaterThanOrEqual(150);
        }
      }
      if (route === '/agenda') {
        await expect(main.getByText('Ana Souza', { exact: true }).filter({ visible: true }).first()).toBeVisible();
        const search = main.getByRole('textbox', { name: 'Buscar paciente, CPF ou telefone' });
        expect((await search.boundingBox())!.width, 'a busca da agenda precisa permitir ler e editar o nome').toBeGreaterThan(200);
        if (width < 640) {
          await main.getByRole('button', { name: /^Filtros \(/ }).click();
          const sheet = page.getByRole('dialog', { name: 'Filtros da agenda' });
          for (const name of ['Médicos', 'Status', 'Legenda']) await expect(sheet.getByRole('button', { name, exact: true })).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(sheet).toBeHidden();
        } else {
          const doctors = await main.getByRole('button', { name: 'Médicos', exact: true }).boundingBox();
          const summary = await main.getByRole('group', { name: /Resumo dos atendimentos/ }).boundingBox();
          expect(doctors!.x + doctors!.width <= summary!.x || doctors!.y + doctors!.height <= summary!.y, 'o resumo não pode encobrir os filtros').toBe(true);
        }
      }
      if (route === '/fila') await expect(main.getByTestId('fila-card')).toHaveCount(3);
      if (route === '/fila/adicionar') await expect(main.getByLabel('Agendamento', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
      const unnamed = await main.locator('input:not([type="hidden"]), textarea, select, button').evaluateAll(elements => elements
        .filter(element => element.getClientRects().length > 0 && !element.closest('[aria-hidden="true"]'))
        .filter(element => !(element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') || element.getAttribute('title') || element.textContent?.trim() || ('labels' in element && Array.from((element as HTMLInputElement).labels ?? []).some(label => label.textContent?.trim()))))
        .map(element => ({ tag: element.tagName, placeholder: element.getAttribute('placeholder'), type: element.getAttribute('type') })));
      expect.soft(unnamed, `${route} at ${width}px`).toEqual([]);
      await page.screenshot({ path: info.outputPath(`${route.replaceAll('/', '-')}-${width}.png`), fullPage: true, animations: 'disabled' });
    }
    await info.attach(`network-${width}.json`, { body: JSON.stringify({ errors, failures }, null, 2), contentType: 'application/json' });
    // A clínica sintética bloqueia recursos externos de propósito.
    expect(errors.filter(error => !error.includes('ERR_BLOCKED_BY_CLIENT'))).toEqual([]);
    expect(failures).toEqual([]);
    expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  });
}

test('switching reception patients does not inherit a pending checklist save', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'recepcao', receptionPopulated: true });
  let releaseSave!: () => void;
  const savePending = new Promise<void>(resolve => { releaseSave = resolve; });
  let requested = false;
  await page.route('**/rest/v1/agendamentos*', async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    requested = true;
    await savePending;
    await route.fulfill({ status: 500, json: { message: 'Falha sintética ao salvar conferência' } });
  });
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto('/recepcao');
  await page.getByRole('button', { name: 'Selecionar Ana Souza', exact: true }).click();
  const checkbox = page.getByRole('checkbox', { name: 'Dados cadastrais conferidos' });
  await checkbox.check();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole('button', { name: 'Selecionar Bruno Almeida', exact: true }).click();
  try {
    await expect(checkbox).toBeEnabled();
    await expect(checkbox).not.toBeChecked();
  } finally {
    releaseSave();
  }
});

test('quadro, lista e linha do tempo oferecem as mesmas ações para o paciente', async ({ page }, info) => {
  await page.clock.install({ time: new Date(`${new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date())}T18:00:00-03:00`) });
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'recepcao', receptionPopulated: true });
  await page.goto('/recepcao');
  const main = page.locator('#main-content');
  await main.getByRole('textbox', { name: 'Buscar paciente ou médico na recepção' }).fill('Ana Souza');
  for (const view of ['Fluxo', 'Lista', 'Linha do tempo']) {
    await main.getByRole('button', { name: view, exact: true }).click();
    const card = main.getByTestId(view === 'Linha do tempo' ? 'reception-timeline-item' : 'reception-appointment-card');
    await expect(card).toHaveCount(1);
    await expect(card.getByRole('button', { name: 'Fazer check-in', exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Mais ações do paciente' }).click();
    await expect(page.getByRole('menuitem')).toHaveText(['Está a caminho?', 'Marcar falta']);
    await page.keyboard.press('Escape');
  }
  await main.getByRole('button', { name: /^Atendimento/ }).click();
  await expect(page).toHaveURL(/\/fila\?etapa=atendimento$/);
  await expect(page.getByRole('button', { name: 'Ver todas as etapas' })).toBeVisible();
});

test('fechar o dia exclui quem chegou e marca somente a falta selecionada', async ({ page }, info) => {
  const hoje = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  await page.clock.install({ time: new Date(`${hoje}T18:00:00-03:00`) });
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'recepcao', receptionPopulated: true, queuePopulated: true });
  const alteracoes: { id: string | null; status: string; versao: string | null }[] = [];
  await page.route('**/rest/v1/fila_atendimento*', async route => {
    if (!new URL(route.request().url()).searchParams.get('agendamento_id')?.startsWith('eq.')) return route.fallback();
    await route.fulfill({ json: [] });
  });
  await page.route('**/rest/v1/agendamentos*', async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('clinica_id')).toBe(`eq.${synthetic.clinicId}`);
    alteracoes.push({ id: params.get('id'), status: route.request().postDataJSON().status, versao: params.get('updated_at') });
    await route.fulfill({ json: { id: params.get('id')?.slice(3) } });
  });
  await page.goto('/recepcao');
  await page.getByRole('button', { name: 'Fechar o dia', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Fechar o dia' });
  await expect(dialog.getByRole('checkbox')).toHaveCount(4);
  for (const nome of ['Ana Souza', 'Bruno Almeida', 'Carla Oliveira']) await expect(dialog.getByText(nome, { exact: false })).toHaveCount(0);
  await dialog.getByRole('checkbox', { name: /Diego Santos/ }).check();
  await dialog.getByRole('button', { name: 'Marcar falta nas selecionadas (1)' }).click();
  await expect(dialog).toBeHidden();
  expect(alteracoes).toEqual([{ id: 'eq.00000000-0000-4000-9000-000000000013', status: 'faltou', versao: 'is.null' }]);
});
