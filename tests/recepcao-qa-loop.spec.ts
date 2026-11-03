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
        await expect(main.getByRole('button', { name: 'Selecionar Ana Souza', exact: true })).toBeVisible();
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
        const doctors = await main.getByRole('button', { name: 'Médicos', exact: true }).boundingBox();
        const summary = await main.getByRole('group', { name: /Resumo dos atendimentos/ }).boundingBox();
        expect(doctors!.x + doctors!.width <= summary!.x || doctors!.y + doctors!.height <= summary!.y, 'o resumo não pode encobrir os filtros').toBe(true);
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
