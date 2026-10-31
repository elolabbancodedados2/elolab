import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('patient registry puts lookup and the patient list ahead of secondary actions', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  await page.route('**/rest/v1/rpc/listar_duplicidades_pacientes*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }));
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/pacientes');
    const main = page.locator('#main-content');
    await expect(main.getByRole('heading', { name: 'Pacientes', exact: true })).toBeVisible();
    await expect(main.getByRole('textbox', { name: 'Buscar pacientes por nome, CPF, telefone ou e-mail' })).toBeVisible();
    const createPatient = main.getByRole('button', { name: 'Novo Paciente', exact: true });
    const primaryButtonStyle = await createPatient.evaluate(element => ({
      backgroundImage: getComputedStyle(element).backgroundImage,
      backgroundColor: getComputedStyle(element).backgroundColor,
    }));
    expect(primaryButtonStyle.backgroundImage).toBe('none');
    expect(primaryButtonStyle.backgroundColor).toBe('rgb(20, 86, 192)');
    if (viewport.width < 1024) {
      await expect(main.getByRole('button', { name: /^PE Pessoa Exemplo QA/ })).toBeVisible();
      const actions = main.getByTestId('patient-mobile-actions');
      await expect(actions.getByRole('button', { name: 'Editar Pessoa Exemplo QA' })).toBeVisible();
      const deleteAction = actions.getByRole('button', { name: 'Excluir Pessoa Exemplo QA' });
      await expect(deleteAction).toBeVisible();
      await deleteAction.scrollIntoViewIfNeeded();
      const navigation = page.getByRole('navigation', { name: 'Navegação principal' });
      await expect(navigation).toBeVisible();
      const [actionBounds, navigationBounds] = await Promise.all([deleteAction.boundingBox(), navigation.boundingBox()]);
      const clearsMobileNavigation = !!actionBounds && !!navigationBounds && actionBounds.y + actionBounds.height <= navigationBounds.y;
      expect(clearsMobileNavigation, 'a ultima acao precisa ficar acima da navegacao fixa').toBe(true);
      await page.screenshot({ path: testInfo.outputPath('patient-registry-390-actions.png'), animations: 'disabled' });
      const actionLayoutIsClear = await actions.evaluate(element => {
        const boxes = [...element.querySelectorAll('button, a')].map(action => action.getBoundingClientRect());
        return boxes.every((box, index) => boxes.slice(index + 1).every(other =>
          box.right <= other.left + 1 || other.right <= box.left + 1 || box.bottom <= other.top + 1 || other.bottom <= box.top + 1,
        ));
      });
      expect(actionLayoutIsClear, 'as ações do paciente não devem se sobrepor no celular').toBe(true);
    } else {
      const patientRow = main.getByRole('row').filter({ hasText: 'Pessoa Exemplo QA' });
      await expect(patientRow).toBeVisible();
      await expect(patientRow.getByLabel('Sexo não informado')).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`patient-registry-${viewport.width}.png`), animations: 'disabled' });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  const main = page.locator('#main-content');
  const search = main.getByRole('textbox', { name: 'Buscar pacientes por nome, CPF, telefone ou e-mail' });
  await search.fill('Paciente sem cadastro');
  await expect(main.getByRole('heading', { name: /Nenhum paciente corresponde/ })).toBeVisible();
  const clearSearch = main.getByRole('button', { name: 'Limpar busca e filtros' });
  await expect(clearSearch).toBeVisible();
  await clearSearch.click();
  const patientRow = main.getByRole('row', { name: 'Abrir ficha de Pessoa Exemplo QA' });
  await expect(patientRow).toBeVisible();
  await search.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(patientRow).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('patient-registry-row-keyboard-focus-1280.png'), animations: 'disabled' });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/pacientes\/[^/]+$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await main.getByRole('button', { name: /Voltar .* lista/ }).click();
  await expect(page).toHaveURL(/\/pacientes$/);
  const filters = main.getByRole('button', { name: 'Mostrar filtros' });
  await filters.click();
  await expect(main.getByRole('button', { name: 'Ocultar filtros' })).toHaveAttribute('aria-expanded', 'true');
  const activeFilter = main.getByRole('button', { name: 'Ocultar filtros' });
  await page.mouse.move(0, 0);
  await expect(activeFilter).toHaveCSS('background-color', 'rgb(20, 86, 192)');
  const activeFilterStyle = await activeFilter.evaluate(element => ({
    backgroundImage: getComputedStyle(element).backgroundImage,
    backgroundColor: getComputedStyle(element).backgroundColor,
  }));
  expect(activeFilterStyle.backgroundImage).toBe('none');
  expect(activeFilterStyle.backgroundColor).toBe('rgb(20, 86, 192)');
  await expect(main.getByRole('combobox', { name: 'Filtrar pacientes por sexo' })).toBeVisible();
  await main.getByRole('button', { name: 'Revisar duplicidades' }).click();
  const duplicateReview = page.getByRole('dialog');
  await expect(duplicateReview.getByRole('heading', { name: 'Revisar cadastros duplicados' })).toBeVisible();
  const duplicateIconColor = await duplicateReview.getByRole('heading', { name: 'Revisar cadastros duplicados' }).locator('svg').evaluate(element => getComputedStyle(element).color);
  expect(duplicateIconColor).toBe('rgb(20, 86, 192)');
  await page.screenshot({ path: testInfo.outputPath('patient-duplicate-review-palette-1280.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(duplicateReview).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
});

test('patient timeline keeps clinical context and filters usable on desktop and mobile', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, prontuarioPopulated: true });
  const historyAudits: string[] = [];
  let summaryInvocations = 0;
  await page.route('**/functions/v1/patient-clinical-summary*', route => {
    summaryInvocations += 1;
    return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ summary: 'Síntese clínica sintética para validação visual.\nRevisar os registros originais.' }),
    });
  });
  await page.route('**/rest/v1/rpc/registrar_visualizacao_historico_paciente*', async route => {
    historyAudits.push('patient-history');
    await route.fulfill({ status: 200, contentType: 'application/json', body: '1' });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/pacientes');
  const main = page.locator('#main-content');
  await main.getByRole('button', { name: 'Ver detalhes de Pessoa Exemplo QA' }).click();
  const patientDialog = page.locator('#main-content');
  await patientDialog.getByRole('tab', { name: /Prontu.rio/ }).click();
  const signedEvolution = patientDialog.getByRole('button', { name: /Cefaleia recorrente/ });
  await expect(signedEvolution).toBeVisible();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (await signedEvolution.evaluate(element => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(signedEvolution).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('patient-record-signed-evolution-keyboard-focus-1280.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('patient-record-signed-evolution-375.png'), animations: 'disabled' });
  await page.keyboard.press('Enter');
  await expect(patientDialog.getByPlaceholder('Queixa principal...')).toHaveValue(/^Cefaleia recorrente/);
  await patientDialog.getByRole('tab', { name: /Prontu.rio/ }).click();
  await patientDialog.getByRole('tab', { name: 'Timeline' }).click();
  await expect(patientDialog.getByRole('heading', { name: 'Histórico Completo do Paciente' })).toBeVisible();
  await expect(patientDialog.getByText('Cefaleia recorrente', { exact: false }).first()).toBeVisible();
  const search = patientDialog.getByRole('textbox', { name: 'Buscar no histórico do paciente' });
  await search.fill('sem resultado sintetico');
  await expect(patientDialog.getByText('Nenhum evento corresponde a esta busca.')).toBeVisible();
  await patientDialog.getByRole('button', { name: 'Limpar busca e filtros' }).click();
  await expect(patientDialog.getByText('Cefaleia recorrente', { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('patient-timeline-1280.png'), animations: 'disabled' });

  await page.setViewportSize({ width: 1440, height: 900 });
  await search.fill('Cefaleia');
  await expect(patientDialog.getByText('Cefaleia recorrente', { exact: false }).first()).toBeVisible();
  await patientDialog.getByRole('button', { name: 'Resumo clínico IA' }).click();
  await expect(page).toHaveURL(/timeline=summary/);
  await expect.poll(() => summaryInvocations).toBe(1);
  await expect(patientDialog.getByRole('heading', { name: 'Resumo clínico inteligente' })).toBeFocused();
  await expect(patientDialog.getByText('Síntese clínica sintética para validação visual.')).toBeVisible();
  await expect(patientDialog.getByRole('note')).toContainText('não substitui o prontuário');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('patient-summary-1440.png'), fullPage: true, animations: 'disabled' });

  await patientDialog.getByRole('button', { name: 'Voltar ao histórico' }).click();
  await expect(page).not.toHaveURL(/timeline=summary/);
  await expect(patientDialog.getByRole('textbox', { name: 'Buscar no histórico do paciente' })).toHaveValue('Cefaleia');
  await expect(patientDialog.getByRole('button', { name: 'Ver resumo clínico' })).toBeFocused();

  await page.setViewportSize({ width: 375, height: 812 });
  await patientDialog.getByRole('button', { name: 'Ver resumo clínico' }).click();
  await expect(page).toHaveURL(/timeline=summary/);
  await expect(patientDialog.getByRole('heading', { name: 'Resumo clínico inteligente' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const patientMobileNavigation = page.getByRole('navigation', { name: 'Navegação principal' });
  if (await patientMobileNavigation.isVisible()) {
    const [headingBounds, navBounds] = await Promise.all([
      patientDialog.getByRole('heading', { name: 'Resumo clínico inteligente' }).boundingBox(),
      patientMobileNavigation.boundingBox(),
    ]);
    expect(!!headingBounds && !!navBounds && headingBounds.y + headingBounds.height <= navBounds.y).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('patient-summary-375.png'), fullPage: true, animations: 'disabled' });
  await patientDialog.getByRole('note').evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  if (await patientMobileNavigation.isVisible()) {
    const [noteBounds, navBounds] = await Promise.all([
      patientDialog.getByRole('note').boundingBox(),
      patientMobileNavigation.boundingBox(),
    ]);
    expect(!!noteBounds && !!navBounds && noteBounds.y + noteBounds.height <= navBounds.y).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('patient-summary-375-note.png'), animations: 'disabled' });
  await patientDialog.getByRole('button', { name: 'Voltar ao histórico' }).click();
  await expect(page).not.toHaveURL(/timeline=summary/);
  await expect(patientDialog.getByRole('textbox', { name: 'Buscar no histórico do paciente' })).toHaveValue('Cefaleia');
  await expect(patientDialog.getByRole('button', { name: 'Ver resumo clínico' })).toBeFocused();
  await expect(patientDialog.getByText('Cefaleia recorrente', { exact: false }).first()).toBeVisible();
  await search.fill('');

  await page.setViewportSize({ width: 375, height: 812 });
  const patientTabs = patientDialog.getByRole('tablist');
  expect(await patientTabs.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const timelineFilters = patientDialog.getByRole('group', { name: /Filtrar hist.rico por tipo/ });
  expect(await timelineFilters.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await timelineFilters.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return [...element.querySelectorAll('button')].every(button => {
      const buttonBounds = button.getBoundingClientRect();
      return buttonBounds.left >= bounds.left - 1 && buttonBounds.right <= bounds.right + 1;
    });
  })).toBe(true);
  for (const tabName of ['Dados', 'Consultas', 'Exames', /Prontu.rio/, 'Timeline', 'Sinais', /End/, 'Financeiro', 'LGPD']) {
    await expect(patientTabs.getByRole('tab', { name: tabName })).toBeVisible();
  }
  await expect(patientDialog.getByRole('tab', { name: 'Timeline' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('patient-timeline-375.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 768, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await patientTabs.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await timelineFilters.evaluate(element => [...element.querySelectorAll('button')].every(button => {
    const bounds = button.getBoundingClientRect();
    const container = element.getBoundingClientRect();
    return bounds.left >= container.left - 1 && bounds.right <= container.right + 1;
  }))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('patient-timeline-768.png'), animations: 'disabled' });

  const directSummaryUrl = new URL(page.url());
  directSummaryUrl.searchParams.set('timeline', 'summary');
  await page.goto(`${directSummaryUrl.pathname}${directSummaryUrl.search}`);
  await expect(page.locator('#main-content').getByRole('heading', { name: 'Resumo clínico inteligente' })).toBeVisible();
  await expect(page.locator('#main-content').getByText(/Este resumo não está carregado nesta sessão/)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  expect(historyAudits.length).toBeGreaterThan(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
});

test('signed-record addenda use a dedicated page and return to the same patient section', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { role: 'medico', platformAdmin: false, prontuarioPopulated: true });
  const patientId = '00000000-0000-4000-8000-000000000004';
  const recordId = '00000000-0000-4000-9000-000000000101';
  const saveAttempts: Record<string, unknown>[] = [];
  let failFirstSave = true;
  await page.route('**/rest/v1/rpc/registrar_prontuario_adendo**', async route => {
    saveAttempts.push(route.request().postDataJSON());
    if (failFirstSave) {
      failFirstSave = false;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'P0001', message: 'Falha sintética de gravação. Tente novamente.' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: '00000000-0000-4000-9000-000000000151', hash: 'synthetic-hash', created_at: new Date().toISOString() }),
    });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/prontuarios?paciente=${patientId}&prontuario=${recordId}&secao=adendos`);
  const addendumButton = page.getByRole('button', { name: 'Novo adendo' });
  await expect(addendumButton).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Adendos' })).toHaveAttribute('aria-selected', 'true');
  await addendumButton.click();
  await expect(page).toHaveURL(new RegExp(`/prontuarios/${recordId}/adendos/novo$`));
  await expect(page.getByRole('heading', { name: 'Novo adendo ao prontuário' })).toBeVisible();
  await expect(page.getByText('Pessoa Exemplo QA', { exact: true })).toBeVisible();
  await expect(page.getByText('Evolução assinada', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Motivo' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('prontuario-addendum-desktop.png'), animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('textbox', { name: 'Motivo' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('prontuario-addendum-mobile-form.png'), animations: 'disabled' });
  const fieldsClearOfStickyActions = await page.evaluate(() => {
    const footer = document.querySelector('[data-testid="adendo-mobile-actions"]')?.getBoundingClientRect();
    const fields = ['adendo-tipo', 'adendo-motivo', 'adendo-conteudo']
      .map(id => document.getElementById(id)?.getBoundingClientRect())
      .filter((rect): rect is DOMRect => Boolean(rect));
    return Boolean(footer) && fields.every(field => field.bottom <= footer!.top || field.top >= footer!.bottom);
  });
  expect(fieldsClearOfStickyActions, 'a barra fixa de ações não pode cobrir campos do adendo').toBe(true);
  const submit = page.getByRole('button', { name: 'Registrar adendo imutável' });
  await submit.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'auto' }));
  const submitBounds = await submit.boundingBox();
  const cancelBounds = await page.getByRole('button', { name: 'Cancelar' }).boundingBox();
  const navigationBounds = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
  const mainBounds = await page.locator('#main-content').boundingBox();
  await page.screenshot({ path: testInfo.outputPath('prontuario-addendum-mobile-actions.png'), animations: 'disabled' });
  const actionsReachableAboveNavigation = !!submitBounds && !!cancelBounds && !!navigationBounds && !!mainBounds
    && submitBounds.y >= mainBounds.y && submitBounds.y + submitBounds.height <= navigationBounds.y
    && cancelBounds.y >= mainBounds.y && cancelBounds.y + cancelBounds.height <= navigationBounds.y;
  expect(actionsReachableAboveNavigation, 'as duas ações precisam ficar visíveis entre o cabeçalho e a navegação fixa').toBe(true);
  await page.screenshot({ path: testInfo.outputPath('prontuario-addendum-mobile.png'), animations: 'disabled', fullPage: true });

  await submit.click();
  await expect(page.getByText('Informe o motivo do adendo.')).toBeVisible();
  await expect(page.getByText('Informe o conteúdo do adendo.')).toBeVisible();
  expect(saveAttempts).toHaveLength(0);
  await page.getByRole('combobox', { name: 'Tipo de registro' }).click();
  await page.getByRole('option', { name: 'Retificação' }).click();
  await page.getByRole('textbox', { name: 'Motivo' }).fill('Correção de dado clínico no cenário sintético.');
  await page.getByRole('textbox', { name: 'Conteúdo do adendo' }).fill('O registro original permanece intacto; esta nota documenta a correção.');
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('Falha sintética de gravação');
  await expect(page.getByRole('textbox', { name: 'Motivo' })).toHaveValue('Correção de dado clínico no cenário sintético.');
  await expect(page.getByRole('textbox', { name: 'Conteúdo do adendo' })).toHaveValue('O registro original permanece intacto; esta nota documenta a correção.');
  await submit.click();

  await expect(page).toHaveURL(new RegExp(`/prontuarios\\?paciente=${patientId}.*secao=adendos`));
  await expect(page.getByRole('tab', { name: 'Adendos' })).toHaveAttribute('aria-selected', 'true');
  expect(saveAttempts).toHaveLength(2);
  expect(saveAttempts[1]).toMatchObject({
    p_prontuario_id: recordId,
    p_tipo: 'retificacao',
    p_motivo: 'Correção de dado clínico no cenário sintético.',
    p_texto: 'O registro original permanece intacto; esta nota documenta a correção.',
  });
  const scopedRecordRead = synthetic.requests.find(request => request.includes(`/rest/v1/prontuarios?`) && request.includes(`id=eq.${recordId}`));
  expect(scopedRecordRead).toContain(`clinica_id=eq.${synthetic.clinicId}`);
  expect(scopedRecordRead).toContain('assinado=eq.true');
  expect(scopedRecordRead).toContain('medico_id=eq.00000000-0000-4000-8000-000000000003');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
});

test('Auth desktop preserves readable login and signup states without horizontal overflow', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, authenticated: false });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/auth');

    const accessSwitch = page.getByRole('group', { name: 'Modo de acesso' });
    await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
    await expect(page.getByText('Tudo o que sua clínica precisa, em um só lugar.')).toBeVisible();
    await expect(page.getByText('Sistema completo para clínicas')).toHaveCount(0);
    await expect(page.getByLabel('E-mail')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Senha' })).toBeVisible();
    await expect(accessSwitch.getByRole('button', { name: 'Entrar' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toHaveCount(1);
    await expect(page.locator('form').getByRole('button', { name: 'Acessar conta', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`auth-login-${viewport.width}.png`), fullPage: true });

    await accessSwitch.getByRole('button', { name: 'Criar Conta' }).click();
    await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible();
    await expect(page.getByLabel('Nome completo')).toBeVisible();
    await expect(page.getByLabel('Telefone (opcional)')).toBeVisible();
    await expect(page.getByLabel('CPF ou CNPJ (opcional)')).toBeVisible();
    await expect(page.getByLabel('Confirmar senha')).toBeVisible();
    await expect(accessSwitch.getByRole('button', { name: 'Criar Conta' })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`auth-signup-${viewport.width}.png`), fullPage: true });
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.filter((write) => !write.includes('/rpc/'))).toEqual([]);
});

test('dashboard desktop keeps one primary role shortcut and softens the secondary actions', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dashboard');

  const workspace = page.locator('section[aria-labelledby="role-workspace-title"]');
  const actions = workspace.getByRole('link');
  await expect(workspace.getByRole('heading', { name: 'Visão da administração' })).toBeVisible();
  await expect(page.getByText('Agenda, equipe e informações importantes em um só lugar.')).toBeVisible();
  const dashboardHeroTitle = page.getByText('Sua clínica, mais organizada.', { exact: true });
  await expect(dashboardHeroTitle).toBeVisible();
  await expect(dashboardHeroTitle).toHaveClass(/text-primary/);
  await expect(dashboardHeroTitle.locator('xpath=ancestor::section[1]')).toHaveClass(/bg-card/);
  await expect(actions).toHaveCount(3);
  await expect(actions.nth(0)).toHaveAttribute('href', '/analytics');
  await expect(actions.nth(1)).toHaveAttribute('href', '/equipe');
  await expect(actions.nth(2)).toHaveAttribute('href', '/configuracoes');

  const visualTones = await actions.evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element);
    return { backgroundImage: style.backgroundImage, backgroundColor: style.backgroundColor, borderStyle: style.borderStyle };
  }));
  expect(visualTones[0]?.backgroundImage).toBe('none');
  expect(visualTones[0]?.backgroundColor).toBe('rgb(20, 86, 192)');
  expect(visualTones[1]?.backgroundImage).toBe('none');
  expect(visualTones[1]?.borderStyle).toBe('solid');
  expect(visualTones[2]?.backgroundImage).toBe('none');
  expect(visualTones[2]?.borderStyle).toBe('solid');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('dashboard-role-actions-1280.png'), fullPage: true });

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.every(write => write.includes(' POST /rest/v1/rpc/'))).toBe(true);
});

test('admin dashboard puts the agenda and clinic priorities ahead of monthly indicators', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'admin', receptionPopulated: true });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/dashboard');

    // Tela de Início aprovada em 30/10/2026: branco gelo, preto nos destaques, cor só em pendências.
    const dashboard = page.locator('[data-testid="inicio-painel"]');
    await expect(dashboard.getByRole('heading', { name: 'Início', exact: true })).toBeVisible();
    await expect(dashboard.getByRole('heading', { name: 'Na sala de espera' })).toBeVisible();
    await expect(dashboard.getByRole('heading', { name: 'Agenda de hoje' })).toBeVisible();
    await expect(dashboard.getByRole('heading', { name: 'Precisa de atenção' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(dashboard.locator('.bg-gradient-primary')).toHaveCount(0);
    await expect(dashboard.locator('[style*="linear-gradient"]')).toHaveCount(0);
    const primeiraAcao = dashboard.getByRole('navigation', { name: 'Ações rápidas' }).getByRole('link').first().locator('span').first();
    expect(await primeiraAcao.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(17, 18, 20)');
    await page.screenshot({ path: testInfo.outputPath(`admin-dashboard-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
    if (viewport.width === 375) {
      await dashboard.getByRole('heading', { name: 'Agenda de hoje' }).scrollIntoViewIfNeeded();
      await expect(dashboard.getByRole('heading', { name: 'Agenda de hoje' })).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath('admin-dashboard-375-agenda.png'), animations: 'disabled' });
    }
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('admin dashboard pauses partial metrics on an agenda error and recovers on retry', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'admin', receptionPopulated: true });
  let allowAgendaRequests = false;
  await page.route('**/rest/v1/agendamentos?*', route => {
    if (route.request().method() !== 'GET' || allowAgendaRequests) return route.fallback();
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'synthetic agenda failure' }) });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dashboard');
  const error = page.getByRole('alert').filter({ hasText: 'Não foi possível carregar o dashboard' });
  await expect(error).toBeVisible();
  await expect(error.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  await expect(page.getByText('Não conseguimos carregar estas informações agora. Tente novamente em instantes.')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('admin-dashboard-error-1280.png'), animations: 'disabled' });

  allowAgendaRequests = true;
  await error.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.locator('[data-testid="inicio-painel"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Agenda de hoje' })).toBeVisible();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('reception preserves the return decision when finalizing an old visit fails', async ({ page }, testInfo) => {
  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const today = `${dateParts.find(part => part.type === 'year')?.value}-${dateParts.find(part => part.type === 'month')?.value}-${dateParts.find(part => part.type === 'day')?.value}`;
  const yesterdayDate = new Date(`${today}T12:00:00Z`);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'admin', receptionPopulated: true, today });
  const appointmentId = '00000000-0000-4000-9000-000000000111';
  const oldVisit = {
    id: appointmentId, clinica_id: '00000000-0000-4000-8000-000000000002', data: yesterday,
    hora_inicio: '10:00:00', tipo: 'consulta', paciente_id: '00000000-0000-4000-8000-000000000010',
    medico_id: '00000000-0000-4000-8000-000000000003', status: 'em_atendimento',
    observacoes: null,
    pacientes: { nome: 'Ana Souza', nome_social: null, convenio_id: null },
    medicos: { nome: 'Dra. Marina Ribeiro' },
  };
  let allowFinalization = false;
  await page.route('**/rest/v1/agendamentos?*', route => {
    const requestUrl = new URL(route.request().url());
    if (route.request().method() === 'GET' && requestUrl.searchParams.get('id') === `eq.${appointmentId}`) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([oldVisit]) });
    }
    if (route.request().method() === 'GET' && requestUrl.searchParams.get('status') === 'eq.em_atendimento') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(allowFinalization ? [] : [oldVisit]) });
    }
    return route.fallback();
  });
  await page.route('**/rest/v1/rpc/finalizar_atendimento_atomico', route => allowFinalization
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ status_agendamento: 'finalizado', cobranca_criada: false, repetido: false }]) })
    : route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'falha sintética na finalização' }) }));

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/recepcao');
  await page.getByRole('button', { name: 'Foi atendido' }).click();
  await expect(page).toHaveURL(`/atendimentos/${appointmentId}/finalizar?origem=atendimentos-abertos`);
  const finalizationPage = page.locator('#main-content');
  await expect(finalizationPage.getByRole('heading', { name: 'Finalizar atendimento' })).toBeVisible();
  await finalizationPage.getByText('30 dias', { exact: true }).click();
  await expect(finalizationPage.getByText(/Retorno previsto:/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('reception-finalization-retry-1280.png'), animations: 'disabled' });
  await finalizationPage.getByRole('button', { name: 'Confirmar finalização' }).click();
  await expect(page.getByText('Não foi possível finalizar o atendimento')).toBeVisible();
  await expect(finalizationPage.getByRole('radio', { name: '30 dias' })).toBeChecked();

  allowFinalization = true;
  await finalizationPage.getByRole('button', { name: 'Confirmar finalização' }).click();
  await expect(page).toHaveURL('/recepcao');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('platform-only account is routed from the clinic dashboard to its own workspace', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: true, platformOnly: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dashboard');

  await expect.poll(() => new URL(page.url()).pathname).toBe('/painel-admin');
  await expect(page.getByRole('heading', { name: /geral/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('platform-only-home.png'), fullPage: true, animations: 'disabled' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

const operationalDashboardCases = [
  { role: 'recepcao', title: 'Seu turno na recepção', hrefs: ['/recepcao', '/agenda', '/fila'] },
  { role: 'enfermagem', title: 'Cuidados e laboratório', hrefs: ['/triagem', '/mapa-coleta', '/laboratorio'] },
  { role: 'financeiro', title: 'Rotina financeira', hrefs: ['/financeiro', '/contas', '/cobranca-inadimplentes'] },
] as const;

test('operational dashboard separates paid appointments from completed attendance', async ({ page }, testInfo) => {
  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const today = `${dateParts.find(part => part.type === 'year')?.value}-${dateParts.find(part => part.type === 'month')?.value}-${dateParts.find(part => part.type === 'day')?.value}`;
  await page.clock.install({ time: new Date(`${today}T09:00:00-03:00`) });
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'recepcao', receptionPopulated: true, today });
  const appointments = [
    { id: '00000000-0000-4000-9000-000000000201', data: today, hora_inicio: '08:00:00', hora_fim: '08:30:00', tipo: 'Consulta', status: 'atendimento_finalizado', pacientes: { nome: 'Paciente atendido' }, medicos: { nome: 'Dra. Marina Ribeiro' } },
    { id: '00000000-0000-4000-9000-000000000202', data: today, hora_inicio: '10:30:00', hora_fim: '11:00:00', tipo: 'Consulta', status: 'pago', pacientes: { nome: 'Paciente pagante' }, medicos: { nome: 'Dra. Marina Ribeiro' } },
    { id: '00000000-0000-4000-9000-000000000203', data: today, hora_inicio: '11:00:00', hora_fim: '11:30:00', tipo: 'Consulta', status: 'faltou', pacientes: { nome: 'Paciente ausente' }, medicos: { nome: 'Dra. Marina Ribeiro' } },
  ];
  await page.route('**/rest/v1/agendamentos?*', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      headers: { 'content-range': '0-2/3', 'access-control-expose-headers': 'content-range' },
      contentType: 'application/json',
      body: JSON.stringify(appointments),
    });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dashboard');
  const main = page.locator('#main-content');
  const hero = main.locator('section[aria-labelledby="turno-title"]');
  await expect(hero).toContainText('Paciente pagante');
  const finalized = main.getByRole('link').filter({ hasText: 'Finalizadas' });
  await expect(finalized.locator('p').nth(1)).toHaveText('1');
  await expect(finalized).toContainText('33% do dia');
  await expect(main.getByText('Paciente ausente')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('operational-dashboard-payment-vs-completion-1280.png'), animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('operational-dashboard-payment-vs-completion-390.png'), animations: 'disabled' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

for (const dashboardCase of operationalDashboardCases) {
  test(`dashboard desktop keeps shortcuts clear for ${dashboardCase.role}`, async ({ page }, testInfo) => {
    const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: dashboardCase.role });

    for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(viewport);
      await page.goto('/dashboard');
      const main = page.locator('#main-content');
      const hero = main.locator('section[aria-labelledby="turno-title"]');
      const actions = hero.getByRole('link');
      await expect(hero.getByRole('heading', { name: dashboardCase.title })).toBeVisible();
      await expect(actions).toHaveCount(3);
      for (const [index, href] of dashboardCase.hrefs.entries()) {
        await expect(actions.nth(index)).toHaveAttribute('href', href);
      }
      const tones = await actions.evaluateAll(elements => elements.map(element => {
        const style = getComputedStyle(element);
        return { image: style.backgroundImage, background: style.backgroundColor, border: style.borderStyle };
      }));
      expect(tones[0]?.image).toBe('none');
      expect(tones[0]?.background).toBe('rgb(255, 255, 255)');
      for (const tone of tones.slice(1)) {
        expect(tone?.image).toBe('none');
        expect(tone?.border).toBe('solid');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`dashboard-${dashboardCase.role}-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
    }

    expect(synthetic.assertAllWritesAreMocked()).toBe(true);
    expect(synthetic.writes.every(write => write.includes(' POST /rest/v1/rpc/'))).toBe(true);
  });
}

test('doctor monthly KPIs render without staggered entrance on desktop', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'medico', agendaPopulated: true });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: /Bom dia|Boa tarde|Boa noite/ })).toBeVisible();
    const dashboard = page.locator('#main-content');
    const newRecord = dashboard.getByRole('link', { name: 'Novo prontuário' });
    const myAgenda = dashboard.getByRole('link', { name: 'Minha agenda' });
    const startVisit = dashboard.getByRole('link', { name: /Iniciar atendimento/ });
    const queue = dashboard.getByRole('link', { name: 'Ver fila' });
    await expect(newRecord).toBeVisible();
    await expect(myAgenda).toBeVisible();
    await expect(startVisit).toBeVisible();
    await expect(queue).toBeVisible();
    const [primaryStyle, secondaryStyle] = await Promise.all([
      newRecord.evaluate(element => ({ image: getComputedStyle(element).backgroundImage, background: getComputedStyle(element).backgroundColor })),
      myAgenda.evaluate(element => ({ image: getComputedStyle(element).backgroundImage, border: getComputedStyle(element).borderStyle })),
    ]);
    expect(primaryStyle.image).toBe('none');
    expect(primaryStyle.background).toBe('rgb(20, 86, 192)');
    expect(secondaryStyle.image).toBe('none');
    expect(secondaryStyle.border).toBe('solid');
    for (const label of ['Meus Pacientes', 'Atendimentos/Mês', 'Prontuários/Mês', 'Prescrições/Mês']) {
      const metricLabel = dashboard.getByText(label, { exact: true });
      await expect(metricLabel).toBeVisible();
      expect(await metricLabel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`doctor-dashboard-kpis-${viewport.width}.png`), animations: 'disabled' });
  }

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/dashboard');
  const mobileDashboard = page.locator('#main-content');
  const nextPatientHeading = mobileDashboard.getByRole('heading', { name: 'Próximo paciente' });
  const todayPatientsHeading = mobileDashboard.getByRole('heading', { name: 'Pacientes de hoje' });
  await expect(nextPatientHeading).toBeVisible();
  await expect(mobileDashboard.getByRole('link', { name: /Iniciar atendimento/ })).toBeVisible();
  const [nextPatientBounds, todayPatientsBounds] = await Promise.all([
    nextPatientHeading.boundingBox(), todayPatientsHeading.boundingBox(),
  ]);
  expect(nextPatientBounds).not.toBeNull();
  expect(todayPatientsBounds).not.toBeNull();
  expect(nextPatientBounds!.y).toBeLessThan(todayPatientsBounds!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('doctor-dashboard-operational-priority-375.png'), animations: 'disabled' });
  const finalActivityLink = mobileDashboard.getByRole('link', { name: /Encaminhamentos/ });
  await finalActivityLink.scrollIntoViewIfNeeded();
  await expect(finalActivityLink).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('doctor-dashboard-activity-mobile-375.png'), animations: 'disabled' });

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('doctor dashboard recovers from an agenda query failure without hiding an empty schedule', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'medico', agendaPopulated: true });
  let agendaMode: 'error' | 'empty' | 'populated' = 'error';
  await page.route('**/rest/v1/agendamentos**', async route => {
    if (route.request().method() === 'GET' && agendaMode === 'error') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Falha sintética ao consultar a agenda' }) });
      return;
    }
    if (route.request().method() === 'GET' && agendaMode === 'empty') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.fallback();
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dashboard');
  const errorState = page.locator('#main-content').getByRole('alert');
  await expect(errorState).toContainText('Não foi possível carregar o painel médico');
  await expect(page.getByText('Não conseguimos carregar estas informações agora. Tente novamente em instantes.', { exact: true })).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('doctor-dashboard-error-1280.png'), animations: 'disabled' });

  agendaMode = 'populated';
  await errorState.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('heading', { name: 'Próximo paciente' })).toBeVisible();

  agendaMode = 'empty';
  await page.reload();
  const dashboard = page.locator('#main-content');
  await expect(dashboard.getByText('Sem consultas para hoje')).toBeVisible();
  await expect(dashboard.getByText('Nenhum paciente pendente')).toBeVisible();
  await expect(dashboard.getByText('Sua agenda está livre por enquanto.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('doctor-dashboard-empty-1280.png'), animations: 'disabled' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('landing desktop explicita cartão recorrente e Pix por período', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Toda a clínica\.\s*Em um só fluxo\./ })).toBeVisible();
  await expect(page.getByText('Cartão recorrente · Pix por período')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('landing-1280.png') });
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
});

test('clinic demo groups sample indicators and keeps readable actions on desktop and mobile', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, authenticated: false });

  for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/demonstracao');

    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Conheça a rotina da clínica' })).toBeVisible();
    await expect(main.getByText('Nada é lido ou salvo na sua conta.')).toBeVisible();
    await expect(main.getByRole('region', { name: 'Indicadores fictícios' })).toContainText('18');
    await expect(main.getByRole('region', { name: 'Indicadores fictícios' })).toContainText('6');
    await expect(main.getByRole('region', { name: 'Indicadores fictícios' })).toContainText('4');
    const plansLink = main.getByRole('link', { name: 'Ver planos' });
    await expect(plansLink).toBeVisible();
    const contrast = await plansLink.evaluate(element => {
      const parse = (value: string) => value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
      const luminance = (value: number[]) => {
        const linear = value.map(channel => {
          const srgb = channel / 255;
          return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
        });
        return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
      };
      const style = getComputedStyle(element);
      const colors = [luminance(parse(style.color)), luminance(parse(style.backgroundColor))].sort((a, b) => b - a);
      return (colors[0] + 0.05) / (colors[1] + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`clinic-demo-${viewport.width}.png`), fullPage: true });
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('Agenda desktop shows short appointments and opens them with Enter', async ({ page }, testInfo) => {
  const duplicateKeyWarnings: string[] = [];
  page.on('console', message => {
    if (/same key|unique.*key/i.test(message.text())) duplicateKeyWarnings.push(message.text());
  });
  await page.clock.install({ time: new Date('2026-10-13T08:00:00-03:00') });
  const synthetic = await installSyntheticClinic(page, { agendaPopulated: true, waitingListPopulated: true, platformAdmin: false, today: '2026-10-13' });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/agenda');

    const main = page.locator('#main-content');
    await expect(main.getByRole('heading', { name: 'Terça-feira, 13 de out' })).toBeVisible();
    await expect(main.getByText(/Terça-feira, 13 de outubro/)).toBeVisible();
    await expect(main.getByRole('textbox', { name: 'Buscar paciente, CPF ou telefone' })).toBeVisible();
    const globalSearch = page.getByRole('button', { name: 'Abrir busca global, atalho Control K' });
    const todayBar = page.getByRole('region', { name: 'Agenda de hoje' });
    const [searchBounds, todayBarBounds] = await Promise.all([globalSearch.boundingBox(), todayBar.boundingBox()]);
    expect(searchBounds).not.toBeNull();
    expect(todayBarBounds).not.toBeNull();
    expect(searchBounds!.x + searchBounds!.width).toBeLessThanOrEqual(todayBarBounds!.x);
    const card = main.getByRole('button', { name: /Consulta de Ana Souza, 08:00/ }).first();
    await expect(card).toBeVisible();
    await expect(card.getByText('Ana Souza')).toBeVisible();
    const appointmentColorTreatment = await card.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        backgroundImage: style.backgroundImage,
        backgroundColor: style.backgroundColor,
        accentBorder: style.borderLeftColor,
      };
    });
    expect(appointmentColorTreatment.backgroundImage).toBe('none');
    expect(appointmentColorTreatment.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(appointmentColorTreatment.accentBorder).not.toBe('rgba(0, 0, 0, 0)');
    const axisTickCenter = await main.getByTestId('agenda-hour-axis').getByText('08:00', { exact: true })
      .evaluate(element => {
        const rect = element.getBoundingClientRect();
        return rect.top + rect.height / 2;
      });
    const appointmentTop = await card.evaluate(element => element.getBoundingClientRect().top);
    expect(Math.abs(appointmentTop - axisTickCenter)).toBeLessThanOrEqual(6);
    await expect(main.locator('[data-agenda-slot="true"][tabindex="0"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Alternar lista de espera, 3 pacientes' })).toBeVisible();
    await expect(main.getByText('Lia Martins', { exact: true })).toBeVisible();
    await expect(main.getByText('João Nunes', { exact: true })).toBeVisible();
    await expect(main.getByText('Mariana Costa', { exact: true })).toBeVisible();
    await expect(main.getByText('Urgente', { exact: true })).toHaveClass(/bg-destructive\/10/);
    await expect(main.getByText('Preferencial', { exact: true })).toHaveClass(/bg-info\/10.*text-info/);
    await expect(main.getByText('Normal', { exact: true })).toHaveClass(/bg-muted.*text-muted-foreground/);
    const waitingValue = main.getByText('Aguard.', { exact: true }).locator('xpath=..').locator('span').first();
    await expect(waitingValue).toHaveClass(/text-warning-foreground/);

    const grid = main.getByTestId('agenda-day-grid');
    const initialScroll = await Promise.all([
      main.evaluate(element => ({ height: element.clientHeight, scrollHeight: element.scrollHeight })),
      grid.evaluate(element => ({ height: element.clientHeight, scrollHeight: element.scrollHeight })),
    ]);
    expect(initialScroll[0].scrollHeight).toBeGreaterThan(initialScroll[0].height);
    expect(initialScroll[1].scrollHeight).toBe(initialScroll[1].height);

    await main.evaluate(element => {
      const strip = element.querySelector('[data-testid="agenda-doctor-header-strip"]')!;
      const target = element.scrollTop + strip.getBoundingClientRect().top - element.getBoundingClientRect().top + 40;
      element.scrollTop = Math.min(target, element.scrollHeight - element.clientHeight);
      element.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    const [mainTop, headerTop] = await Promise.all([
      main.evaluate(element => element.getBoundingClientRect().top),
      main.getByTestId('agenda-doctor-header-strip').evaluate(element => element.getBoundingClientRect().top),
    ]);
    expect(Math.abs(mainTop - headerTop)).toBeLessThanOrEqual(1);
    await main.evaluate(element => { element.scrollTop = 0; });

    await card.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Editar consulta', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Voltar à agenda', exact: true }).first().click();
    await expect(main.getByRole('heading', { name: 'Terça-feira, 13 de out' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`agenda-semantic-status-${viewport.width}.png`), animations: 'disabled' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/agenda?data=2026-10-13&view=daily');
  const mobileMain = page.locator('#main-content');
  const mobileList = mobileMain.getByRole('region', { name: /Consultas do dia/ });
  const firstMobileAppointment = mobileList.getByRole('button', { name: /Abrir consulta de Ana Souza/ });
  await expect(mobileList).toBeVisible();
  await expect(mobileMain.getByRole('button', { name: 'Nova consulta' }).getByText('Nova consulta')).toBeVisible();
  await expect(firstMobileAppointment).toBeVisible();
  await expect(firstMobileAppointment.getByText('Confirmado')).toBeVisible();
  expect(await firstMobileAppointment.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(56);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('agenda-daily-mobile.png'), fullPage: true, animations: 'disabled' });
  await firstMobileAppointment.click();
  await expect(page.getByRole('heading', { name: 'Editar consulta', exact: true })).toBeVisible();
  expect(duplicateKeyWarnings).toEqual([]);
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
});

test('Agenda color settings keep old custom colors and offer accessible EloLab choices', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { agendaPopulated: true, platformAdmin: false, today: '2026-10-13' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/agenda?data=2026-10-13&view=daily');
  await page.getByRole('button', { name: 'Mais opções da agenda' }).click();
  await page.getByRole('menuitem', { name: 'Esquema de cores' }).click();

  const dialog = page.getByRole('dialog', { name: 'Personalizar cores da agenda' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Colorir por' })).toBeVisible();
  const navy = dialog.getByRole('button', { name: 'Usar Azul-marinho para Agendado' });
  await expect(navy).toHaveAttribute('aria-pressed', 'false');
  const target = await navy.boundingBox();
  expect(target).not.toBeNull();
  expect(target!.width).toBeGreaterThan(42);
  expect(target!.height).toBeGreaterThan(42);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('agenda-color-settings-mobile.png'), animations: 'disabled' });

  await navy.click();
  await expect(navy).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('Agenda restores date and view through its URL and browser history', async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date('2026-10-13T08:00:00-03:00') });
  const synthetic = await installSyntheticClinic(page, { agendaPopulated: true, waitingListPopulated: true, platformAdmin: false, today: '2026-10-13' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/agenda?data=2026-10-13&view=daily&origem=qa');

  const main = page.locator('#main-content');
  await expect(main.getByRole('heading', { name: 'Terça-feira, 13 de out' })).toBeVisible();
  await expect(page).toHaveURL(/data=2026-10-13&view=daily&origem=qa/);
  const viewControls = main.getByRole('group', { name: 'Visualização da agenda' });
  const appointmentSummary = main.getByRole('group', { name: /Resumo dos atendimentos:/ });
  const [viewBounds, summaryBounds] = await Promise.all([viewControls.boundingBox(), appointmentSummary.boundingBox()]);
  expect(viewBounds).not.toBeNull();
  expect(summaryBounds).not.toBeNull();
  const overlaps = viewBounds!.x < summaryBounds!.x + summaryBounds!.width
    && viewBounds!.x + viewBounds!.width > summaryBounds!.x
    && viewBounds!.y < summaryBounds!.y + summaryBounds!.height
    && viewBounds!.y + viewBounds!.height > summaryBounds!.y;
  expect(overlaps).toBe(false);

  await main.getByRole('button', { name: 'Visualização semanal' }).click();
  await expect(page).toHaveURL(/data=2026-10-13&view=weekly&origem=qa/);
  await expect(main.getByRole('heading', { name: 'Semana de 13 de out' })).toBeVisible();

  await main.getByRole('button', { name: 'Próximo' }).click();
  await expect(page).toHaveURL(/data=2026-10-20&view=weekly&origem=qa/);
  await expect(main.getByRole('heading', { name: 'Semana de 20 de out' })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/data=2026-10-13&view=weekly&origem=qa/);
  await expect(main.getByRole('heading', { name: 'Semana de 13 de out' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/data=2026-10-13&view=daily&origem=qa/);
  await expect(main.getByRole('heading', { name: 'Terça-feira, 13 de out' })).toBeVisible();
  await page.goForward();
  await page.goForward();
  await expect(page).toHaveURL(/data=2026-10-20&view=weekly&origem=qa/);
  await expect(main.getByRole('heading', { name: 'Semana de 20 de out' })).toBeVisible();

  const appointmentId = '00000000-0000-4000-9000-000000000010';
  await page.goto(`/agenda?data=2026-10-13&view=daily&agendamento=${appointmentId}`);
  await expect(page.getByRole('heading', { name: 'Editar consulta', exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/agenda/${appointmentId}/editar$`));
  await page.getByRole('button', { name: 'Voltar à agenda', exact: true }).first().click();
  await expect(page).toHaveURL(/data=2026-10-13&view=daily$/);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  await expect(page.getByText('Não conseguimos carregar estas informações agora. Tente novamente em instantes.')).toBeHidden({ timeout: 10_000 });
  await page.screenshot({ path: testInfo.outputPath('agenda-url-state-desktop.png'), animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByText('NÃ£o conseguimos carregar estas informaÃ§Ãµes agora. Tente novamente em instantes.')).toBeHidden({ timeout: 10_000 });
  await page.screenshot({ path: testInfo.outputPath('agenda-url-state-mobile.png'), fullPage: true, animations: 'disabled' });
});

test('agenda keeps a conflicting clinician slot unsaved and explains the conflict', async ({ page }, testInfo) => {
  const appointmentDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const synthetic = await installSyntheticClinic(page, { agendaPopulated: true, platformAdmin: false, today: appointmentDate });
  const patientId = '00000000-0000-4000-8000-000000000099';
  let appointmentInsertCount = 0;
  let agendaReadFails = false;
  await page.route('**/rest/v1/rpc/buscar_pacientes_paginado*', async route => {
    const payload = route.request().postDataJSON() as { p_termo?: string };
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(payload.p_termo ? [{
        id: patientId, nome: 'Paciente QA Agenda', nome_social: null, cpf: null,
        telefone: '(11) 90000-0010', email: null, data_nascimento: '1990-05-14', convenio_id: null, ativo: true,
      }] : []),
    });
  });
  await page.route('**/rest/v1/pacientes**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET' && url.searchParams.get('id') === `eq.${patientId}`) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        id: patientId, nome: 'Paciente QA Agenda', nome_social: null, cpf: null, telefone: '(11) 90000-0010',
        email: null, data_nascimento: '1990-05-14', convenio_id: null, ativo: true,
      }) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/agendamentos**', async route => {
    if (route.request().method() === 'POST') appointmentInsertCount += 1;
    const url = new URL(route.request().url());
    const select = url.searchParams.get('select') || '';
    if (route.request().method() === 'GET' && select.includes('sala_id') && select.includes('hora_fim')) {
      if (agendaReadFails) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Falha sintetica ao consultar a agenda' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
        id: '00000000-0000-4000-9000-000000000012', paciente_id: '00000000-0000-4000-8000-000000000012',
        medico_id: '00000000-0000-4000-8000-000000000003', sala_id: null,
        hora_inicio: '09:00:00', hora_fim: '09:20:00', status: 'confirmado',
      }]) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/medico_disponibilidade**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify([{ hora_inicio: '08:00:00', hora_fim: '18:00:00' }]),
  }));

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/agenda?data=${appointmentDate}&view=daily`);
  const main = page.locator('#main-content');
  await main.getByRole('button', { name: 'Nova consulta' }).click();
  const dialog = page.locator('#main-content');
  await expect(dialog.getByRole('heading', { name: 'Nova consulta' })).toBeVisible();
  await dialog.locator('#appointment-patient').click();
  await page.getByPlaceholder('Buscar paciente...').fill('Paciente QA Agenda');
  const patientOption = page.getByRole('option', { name: /Paciente QA Agenda/ });
  await expect(patientOption).toBeVisible();
  await patientOption.click();
  await dialog.locator('#appointment-doctor').click();
  await page.getByRole('option', { name: /Dra\. Marina Ribeiro/ }).click();
  await expect(dialog.locator('#appointment-date')).toHaveValue(appointmentDate);
  await expect(dialog.locator('#appointment-start')).toHaveValue('09:00');
  await page.screenshot({ path: testInfo.outputPath('agenda-conflito-medico-1280.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('agenda-conflito-medico-375.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await dialog.getByRole('button', { name: 'Agendar', exact: true }).click();

  await expect(page.getByText(/Este médico já tem consulta neste horário/)).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(appointmentInsertCount).toBe(0);
  await expect(page.getByText(/Este mÃ©dico jÃ¡ tem consulta neste horÃ¡rio/)).toBeHidden();
  agendaReadFails = true;
  await dialog.getByRole('button', { name: 'Agendar', exact: true }).click();
  await expect(page.getByText(/Não foi possível conferir os horários da agenda/)).toBeVisible();
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('agenda-falha-consulta-horarios-1280.png'), animations: 'disabled' });
  expect(appointmentInsertCount).toBe(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('convenios desktop distinguishes active states and renders a solid destructive action', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { conveniosPopulated: true, platformAdmin: false });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/convenios');
    const main = page.locator('#main-content');
    await expect(main.getByRole('heading', { name: 'Convênios', exact: true })).toBeVisible();
    const activeRow = main.getByRole('row').filter({ hasText: 'Convênio QA Ativo' });
    const inactiveRow = main.getByRole('row').filter({ hasText: 'Convênio QA Inativo' });
    await expect(activeRow.getByText('Ativo', { exact: true })).toHaveClass(/bg-success/);
    await expect(inactiveRow.getByText('Inativo', { exact: true })).toHaveClass(/bg-secondary/);
    await page.screenshot({ path: testInfo.outputPath(`convenios-populated-${viewport.width}.png`), fullPage: true, animations: 'disabled' });

    await activeRow.getByRole('button', { name: 'Excluir convênio Convênio QA Ativo' }).click();
    const alert = page.getByRole('alertdialog');
    const confirmDelete = alert.getByRole('button', { name: 'Excluir', exact: true });
    await expect(confirmDelete).toHaveClass(/bg-none/);
    await expect(confirmDelete).toHaveClass(/bg-destructive/);
    const style = await confirmDelete.evaluate(element => {
      const computed = getComputedStyle(element);
      return { backgroundImage: computed.backgroundImage, backgroundColor: computed.backgroundColor };
    });
    expect(style.backgroundImage).toBe('none');
    expect(style.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    await page.keyboard.press('Escape');
    await expect(alert).toBeHidden();
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
});

test('prescriptions desktop explains and mutes creation until an active doctor exists', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/documentos-clinicos');

  await expect(page.getByRole('heading', { name: 'Prescrições' })).toBeVisible();
  await expect(page.getByRole('alert').getByRole('link', { name: 'Gerenciar equipe' })).toBeVisible();
  const createButton = page.getByRole('button', { name: 'Nova Prescrição' });
  await expect(createButton).toBeDisabled();
  const disabledStyle = await createButton.evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, backgroundImage: style.backgroundImage, color: style.color, opacity: style.opacity };
  });
  const mutedSurface = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'bg-muted';
    document.body.append(probe);
    const background = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return background;
  });
  expect(disabledStyle.background).toBe(mutedSurface);
  expect(disabledStyle.backgroundImage).toBe('none');
  expect(disabledStyle.opacity).toBe('1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('prescricoes-no-doctor-1280.png'), fullPage: true, animations: 'disabled' });

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
});

test('referrals desktop gives clinic administrators a compact next step when no doctor is linked', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/documentos-clinicos?tab=encaminhamentos');

  await expect(page.getByRole('heading', { name: 'Encaminhamentos', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pacientes', exact: true })).toHaveCount(0);
  await expect(page.getByText(/Um médico identificado precisa constar como origem/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Gerenciar corpo clínico' })).toHaveAttribute('href', '/equipe');
  const referralState = page.getByRole('link', { name: 'Gerenciar corpo clínico' }).locator('xpath=ancestor::div[contains(@class, "max-w-3xl")]');
  const referralBounds = await referralState.boundingBox();
  expect(referralBounds?.height).toBeLessThan(220);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('encaminhamentos-sem-medico-1280.png'), fullPage: true, animations: 'disabled' });
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
});

test('insurance billing desktop explains prerequisites for empty clinic setup', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/faturamento-convenios');

  await expect(page.getByRole('heading', { name: 'Faturamento de Convênios' })).toBeVisible();
  await expect(page.getByRole('status').getByRole('link', { name: 'convênio' })).toHaveAttribute('href', '/convenios');
  await expect(page.getByRole('status')).toContainText('marcar um lote como enviado');
  const createBatchButton = page.getByRole('button', { name: 'Novo lote' });
  const registerGlosaButton = page.getByRole('button', { name: 'Registrar glosa' });
  await expect(createBatchButton).toBeDisabled();
  await expect(registerGlosaButton).toBeDisabled();
  const disabledStyles = await Promise.all([createBatchButton, registerGlosaButton].map(button => button.evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, backgroundImage: style.backgroundImage, opacity: style.opacity };
  })));
  expect(disabledStyles.map(style => style.background)).toEqual(['rgb(247, 249, 253)', 'rgb(247, 249, 253)']);
  expect(disabledStyles.map(style => style.backgroundImage)).toEqual(['none', 'none']);
  expect(disabledStyles.map(style => style.opacity)).toEqual(['1', '1']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('faturamento-convenios-empty-1280.png'), fullPage: true, animations: 'disabled' });
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
});

test('receivables desktop keeps both empty summaries compact and actionable', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/contas?tab=receber');

  const emptyCharts = page.getByRole('status', { name: 'Gráficos sem dados nas contas filtradas' });
  await expect(emptyCharts.getByRole('heading', { name: 'Receita por Categoria' })).toBeVisible();
  await expect(emptyCharts.getByText('Cadastre uma receita ou ajuste os filtros acima.')).toBeVisible();
  await expect(emptyCharts.getByRole('heading', { name: 'Recebido por Forma de Pagamento' })).toBeVisible();
  await expect(emptyCharts.getByText('Registre a baixa de uma conta ou ajuste os filtros acima.')).toBeVisible();
  const bounds = await emptyCharts.boundingBox();
  expect(bounds?.height).toBeLessThan(150);
  const periodFilter = page.getByRole('group', { name: 'Filtrar por período' });
  await expect(periodFilter.getByRole('button', { name: 'Mês atual', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: testInfo.outputPath('contas-receber-empty-summaries-1280.png'), animations: 'disabled' });
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
});

test('clinical interoperability desktop protects export behind patient selection', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/interoperabilidade');

  await expect(page.getByRole('heading', { name: 'Interoperabilidade clínica' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exportar JSON FHIR' })).toBeDisabled();
  const interoperabilityNotice = page.getByRole('main').getByRole('note');
  await expect(interoperabilityNotice).toContainText('Guarde e compartilhe somente em ambiente autorizado');
  await expect(interoperabilityNotice).toContainText('links privados temporários, válidos por 1 hora');
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
});

test('custom reports desktop explains disabled exports before the first result', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/relatorios');

  await expect(page.getByRole('heading', { name: 'Relatório Customizado' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Gere o relatório para habilitar Excel, CSV e impressão.');
  await expect(page.getByRole('button', { name: 'Excel', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'CSV', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Imprimir / PDF', exact: true })).toBeDisabled();
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
});

test('clinic reports group exports and retain readable summary navigation on desktop and mobile', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/relatorios');
    const main = page.locator('#main-content');
    await expect(main.getByRole('heading', { name: 'Relatórios da clínica' })).toBeVisible();

    await expect(main.getByRole('heading', { name: 'Relatório Customizado' })).toBeVisible();
    await expect(main.getByRole('region', { name: 'Resumo do período' })).toHaveCount(0);
    await expect(main.getByRole('button', { name: 'Atualizar dados dos relatórios' })).toHaveCount(0);
    await expect(main.getByRole('button', { name: 'Exportar relatórios' })).toHaveCount(0);
    await expect(main.getByRole('button', { name: 'Mês Atual', exact: true })).toHaveCount(0);
    if (viewport.width < 600) {
      await expect(main.getByRole('tab', { name: 'Status' })).toBeVisible();
      const reportTabs = await main.getByRole('tablist').evaluate(element => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }));
      expect(reportTabs.scrollWidth).toBeLessThanOrEqual(reportTabs.clientWidth);
    }
    if (viewport.width < 600) {
      const builderHeading = await main.getByRole('heading', { name: 'Relatório Customizado' }).boundingBox();
      const mobileNavigation = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
      expect(builderHeading && mobileNavigation && builderHeading.y + builderHeading.height < mobileNavigation.y,
        'o construtor deve começar acima da navegação fixa no celular').toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath(`reports-custom-${viewport.width}.png`), animations: 'disabled' });

    await main.getByRole('tab', { name: 'Financeiro' }).click();
    const summary = main.getByRole('region', { name: 'Resumo do período' });
    await expect(summary.getByRole('button', { name: /Receitas/ })).toBeVisible();
    await expect(summary.getByRole('button', { name: /Despesas/ })).toBeVisible();
    await expect(summary.getByRole('button', { name: /Resultado/ })).toHaveAttribute('aria-pressed', 'false');
    await summary.getByRole('button', { name: /Receitas/ }).click();
    await expect(main.getByRole('tab', { name: 'Financeiro' })).toHaveAttribute('data-state', 'active');

    const exportTrigger = main.getByRole('button', { name: 'Exportar relatórios' });
    await expect(exportTrigger).toBeVisible();
    await exportTrigger.click();
    const exportMenu = page.getByRole('menu');
    await expect(exportMenu.getByRole('menuitem', { name: 'Financeiro em Excel' })).toBeVisible();
    await expect(exportMenu.getByRole('menuitem', { name: 'Financeiro em PDF' })).toBeVisible();
    await expect(exportMenu.getByRole('menuitem', { name: 'Agenda em Excel' })).toBeVisible();
    await expect(exportMenu.getByRole('menuitem', { name: 'Pacientes em Excel' })).toBeVisible();
    await expect(exportMenu.getByRole('menuitem', { name: 'Estoque em Excel' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`reports-finance-exports-${viewport.width}.png`), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await expect(main.getByRole('status').filter({ hasText: 'Sem movimentações financeiras no período.' })).toBeVisible();
    await expect(main.getByRole('status').filter({ hasText: 'Sem recebimentos líquidos por forma de pagamento no período.' })).toBeVisible();
    await main.getByRole('status').filter({ hasText: 'Sem movimentações financeiras no período.' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`reports-finance-empty-${viewport.width}.png`), animations: 'disabled' });
    await main.getByRole('tab', { name: 'DRE' }).click();
    await expect(main.getByRole('status').filter({ hasText: 'Sem receitas ou despesas por categoria no período.' })).toBeVisible();
    await main.getByRole('status').filter({ hasText: 'Sem receitas ou despesas por categoria no período.' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`reports-dre-empty-${viewport.width}.png`), animations: 'disabled' });

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`reports-workspace-${viewport.width}.png`), animations: 'disabled' });
  }
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('finance role sees only the report tabs and exports allowed for its profile', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'financeiro' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/relatorios');
  const main = page.locator('#main-content');
  await expect(main.getByRole('heading', { name: 'Relatórios da clínica' })).toBeVisible();
  await expect(main.getByRole('tab', { name: 'Financeiro' })).toBeVisible();
  await expect(main.getByRole('tab', { name: 'Estoque' })).toBeVisible();
  await expect(main.getByRole('tab', { name: 'Atendimentos' })).toHaveCount(0);
  await expect(main.getByRole('tab', { name: 'Pacientes' })).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Exportar relatórios' })).toHaveCount(0);
  await main.getByRole('tab', { name: 'Financeiro' }).click();
  const exportTrigger = main.getByRole('button', { name: 'Exportar relatórios' });
  await exportTrigger.focus();
  await page.keyboard.press('Enter');
  const exportMenu = page.getByRole('menu');
  await expect(exportMenu.getByRole('menuitem', { name: 'Financeiro em Excel' })).toBeFocused();
  await expect(exportMenu.getByRole('menuitem', { name: 'Financeiro em Excel' })).toBeVisible();
  await expect(exportMenu.getByRole('menuitem', { name: 'Financeiro em PDF' })).toBeVisible();
  await expect(exportMenu.getByRole('menuitem', { name: 'Estoque em Excel' })).toBeVisible();
  await expect(exportMenu.getByRole('menuitem', { name: 'Agenda em Excel' })).toHaveCount(0);
  await expect(exportMenu.getByRole('menuitem', { name: 'Pacientes em Excel' })).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('financial reports chart populated synthetic payments and expenses', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, {
    platformAdmin: false,
    accountsPopulated: true,
    agendaPopulated: true,
    today: '2026-10-29',
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/relatorios');
  const main = page.locator('#main-content');
  await expect(main.getByRole('heading', { name: 'Relatórios da clínica' })).toBeVisible();
  await main.getByRole('tab', { name: 'Financeiro' }).click();
  const summary = main.getByRole('region', { name: 'Resumo do período' });
  await expect(summary.getByRole('button', { name: /Receitas/ })).toContainText('R$ 720,00');
  await expect(summary.getByRole('button', { name: /Despesas/ })).toContainText('R$ 945,00');
  await expect(main.getByRole('status').filter({ hasText: 'Sem movimentações financeiras no período.' })).toHaveCount(0);
  await main.getByRole('heading', { name: 'Formas de Pagamento' }).scrollIntoViewIfNeeded();
  const paymentBars = main.locator('.recharts-bar-rectangle');
  await expect(paymentBars).toHaveCount(2);
  await expect.poll(async () => paymentBars.evaluateAll(elements => elements.every(element => {
    const bounds = element.getBoundingClientRect();
    return bounds.width > bounds.height && bounds.height <= 32;
  })), { timeout: 5000 }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('reports-finance-populated-1280.png'), animations: 'disabled' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('custom report stays available while stock loads and stock failures stay local', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  let releaseStockRead: (() => void) | undefined;
  let stockReadReleased = false;
  let failStockReads = true;
  const stockReadGate = new Promise<void>(resolve => { releaseStockRead = resolve; });
  await page.route('**/rest/v1/estoque*', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    if (!stockReadReleased) await stockReadGate;
    if (failStockReads) {
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'synthetic stock read failure' }) });
    }
    return route.fallback();
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/relatorios');
  const main = page.locator('#main-content');
  await expect(main.getByRole('heading', { name: 'Relatório Customizado' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('reports-custom-while-stock-loads-1280.png'), animations: 'disabled' });
  stockReadReleased = true;
  releaseStockRead?.();

  await main.getByRole('tab', { name: 'Financeiro' }).click();
  await expect(main.getByRole('heading', { name: 'Receitas x Despesas' })).toBeVisible();
  await main.getByRole('tab', { name: 'Estoque' }).click();
  await expect(main.getByRole('alert')).toContainText('Não foi possível carregar o estoque');
  await expect(main.getByText('Não conseguimos carregar estas informações agora. Tente novamente em instantes.', { exact: true })).toHaveCount(1);
  await expect(main.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  await main.getByRole('alert').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('reports-stock-error-local-1280.png'), animations: 'disabled' });
  failStockReads = false;
  await main.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(main.getByRole('alert')).toHaveCount(0);
  await expect(main.getByText('Itens em Estoque', { exact: true })).toBeVisible();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

const KEY_SCREENS = [
  ['dashboard', '/dashboard'],
  ['agenda', '/agenda'],
  ['recepcao', '/recepcao'],
  ['caixa-diario', '/recepcao?tab=caixa'],
  ['triagem', '/triagem'],
  ['fila', '/fila'],
  ['pacientes', '/pacientes'],
  ['prontuarios', '/prontuarios'],
  ['retornos', '/retornos'],
  ['corpo-clinico', '/medicos'],
  ['atestados', '/atestados'],
  ['documentos-clinicos-prescricoes', '/documentos-clinicos'],
  ['documentos-clinicos-encaminhamentos', '/documentos-clinicos?tab=encaminhamentos'],
  ['faturamento-convenios', '/faturamento-convenios'],
  ['interoperabilidade', '/interoperabilidade'],
  ['convenios', '/convenios'],
  ['precos-tipos', '/precos-servicos?tab=tipos'],
  ['espera-salas', '/gestao-fluxo'],
  ['lista-espera', '/gestao-fluxo?tab=espera'],
  ['exames', '/exames'],
  ['inadimplentes', '/cobranca-inadimplentes'],
  ['laboratorio', '/laboratorio'],
  ['contas', '/contas?tab=receber'],
  ['contas-pagar', '/contas?tab=pagar'],
  ['fluxo-caixa', '/fluxo-caixa'],
  ['financeiro', '/financeiro'],
  ['analytics', '/analytics'],
  ['tarefas', '/tarefas'],
  ['equipe-funcionarios', '/equipe?aba=funcionarios'],
  ['relatorios', '/relatorios'],
  ['preferencias', '/preferencias'],
] as const;

test('queue presents the full care journey and keeps patients readable at desktop widths', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, queuePopulated: true, queueTriagePending: true });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/fila');
    const main = page.locator('#main-content');
    await expect(main.getByRole('heading', { name: 'Fila de Atendimento' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Jornada dos atendimentos' })).toBeVisible();
    await expect(main.locator('#fila-etapa-aguardando')).toContainText('2');
    await expect(main.locator('#fila-etapa-triagem')).toContainText('1');
    await expect(main.locator('#fila-etapa-atendimento')).toContainText('1');
    await expect(main.locator('#fila-etapa-finalizado')).toContainText('1');
    const atendimentoStage = main.locator('#fila-etapa-atendimento');
    const atendimentoContrast = await atendimentoStage.evaluate(element => {
      const rgb = (value: string) => value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [255, 255, 255];
      const luminance = (value: string) => rgb(value)
        .map(channel => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
      const background = getComputedStyle(element).backgroundColor;
      const foreground = getComputedStyle(element.querySelector('h3')!).color;
      const [lighter, darker] = [luminance(background), luminance(foreground)].sort((a, b) => b - a);
      return { background, contrast: (lighter + 0.05) / (darker + 0.05) };
    });
    expect(atendimentoContrast.background).not.toBe('rgb(255, 255, 255)');
    expect(atendimentoContrast.contrast).toBeGreaterThanOrEqual(4.5);
    await expect(main.getByText(/1 acima de 30 min/)).toBeVisible();
    await expect(main.getByRole('button', { name: 'Registrar próxima triagem' })).toBeVisible();
    await expect(main.getByText('Ana Souza', { exact: true }).first()).toBeVisible();
    await expect(main.getByText('Bruno Almeida', { exact: true }).first()).toBeVisible();
    await expect(main.getByText('Carla Oliveira', { exact: true }).first()).toBeVisible();
    await expect(main.locator('.bg-gradient-primary')).toHaveCount(0);
    const queueStatus = (patient: string, status: string) => main.getByTestId('fila-card')
      .filter({ hasText: patient })
      .getByText(status, { exact: true });
    await expect(queueStatus('Ana Souza', 'Aguardando')).toHaveClass(/bg-warning\/10/);
    await expect(queueStatus('Bruno Almeida', 'Chamado')).toHaveClass(/bg-info\/10/);
    await expect(queueStatus('Carla Oliveira', 'Em Atendimento')).toHaveClass(/bg-primary\/10/);
    await expect(main.getByText(/1 urgente/i)).toBeVisible();
    await expect(main.getByRole('button', { name: 'Atualizar fila' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(main.getByTestId('fila-card')).toHaveCount(3);
    await expect.poll(async () => {
      const cards = await main.getByTestId('fila-card').evaluateAll(elements =>
        elements.every(element => Number(getComputedStyle(element).opacity) >= 0.99),
      );
      return cards;
    }).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`fila-populated-${viewport.width}.png`), fullPage: true });

    if (viewport.width >= 1024) {
      const removePatient = main.getByRole('button', { name: 'Remover Bruno Almeida da fila' });
      const chatButton = page.getByRole('button', { name: /Abrir chat interno/ });
      await removePatient.scrollIntoViewIfNeeded();
      const [removeBounds, chatBounds] = await Promise.all([removePatient.boundingBox(), chatButton.boundingBox()]);
      expect(removeBounds).not.toBeNull();
      expect(chatBounds).not.toBeNull();
      expect(removeBounds!.x + removeBounds!.width).toBeLessThanOrEqual(chatBounds!.x);
    }

    await main.getByRole('button', { name: 'Remover Ana Souza da fila' }).click();
    const removeDialog = page.getByRole('alertdialog');
    await expect(removeDialog.getByRole('heading', { name: 'Remover da fila?' })).toBeVisible();
    await expect(removeDialog).toContainText('O paciente será removido da fila.');
    const removeAction = removeDialog.getByRole('button', { name: 'Remover', exact: true });
    await expect(removeAction).toHaveClass(/bg-destructive/);
    await expect(removeAction).toHaveClass(/text-destructive-foreground/);
    const destructiveStyle = await removeAction.evaluate(element => {
      const style = getComputedStyle(element);
      return { backgroundImage: style.backgroundImage, backgroundColor: style.backgroundColor };
    });
    expect(destructiveStyle.backgroundImage).toBe('none');
    expect(destructiveStyle.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    await page.keyboard.press('Escape');
    await expect(removeDialog).toBeHidden();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const urgentIndicator = main.locator('.animate-pulse').first();
    await expect(urgentIndicator).toHaveClass(/motion-reduce:animate-none/);
    expect(await urgentIndicator.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await main.getByRole('button', { name: 'Registrar próxima triagem' }).click();
    await expect(page).toHaveURL(/tab=triagem/);
    const triageDialog = page.getByRole('dialog');
    await expect(triageDialog.getByRole('heading', { name: 'Registrar Triagem' })).toBeVisible();
    await page.keyboard.press('Escape');
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
});

test('reception sees the triage stage without access to the triage form', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'recepcao', queuePopulated: true, queueTriagePending: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/fila');
  const main = page.locator('#main-content');
  await expect(main.locator('#fila-etapa-triagem')).toContainText('1');
  await expect(main.getByText(/1 acima de 30 min/)).toBeVisible();
  await expect(main.getByRole('button', { name: 'Registrar próxima triagem' })).toHaveCount(0);
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('doctor starts a called appointment and opens the same patient in a new prontuario', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role: 'medico', queuePopulated: true });
  const appointmentId = '00000000-0000-4000-9000-000000000011';
  const patientId = '00000000-0000-4000-8000-000000000011';
  const appointmentDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const transitionCalls: Array<{ p_agendamento_id: string; p_fila_id: string }> = [];
  const auditCalls: string[] = [];

  await page.route('**/rest/v1/rpc/iniciar_atendimento_atomico*', async route => {
    transitionCalls.push(route.request().postDataJSON() as { p_agendamento_id: string; p_fila_id: string });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ repetido: false, status: 'em_atendimento' }) });
  });
  await page.route('**/rest/v1/rpc/registrar_visualizacao_historico_paciente*', async route => {
    auditCalls.push('visualizacao_historico_paciente');
    await route.fulfill({ status: 200, contentType: 'application/json', body: '0' });
  });
  await page.route('**/rest/v1/pacientes**', async route => {
    const requestUrl = new URL(route.request().url());
    const idFilter = requestUrl.searchParams.get('id');
    if (route.request().method() === 'GET' && idFilter?.includes(patientId)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: patientId, clinica_id: '00000000-0000-4000-8000-000000000002',
          nome: 'Bruno Almeida', nome_social: null, cpf: null, telefone: null, email: null,
          data_nascimento: '1990-05-14', sexo: 'nao_informado', alergias: [], ativo: true,
        }]),
      });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/agendamentos**', async route => {
    const requestUrl = new URL(route.request().url());
    if (route.request().method() === 'GET' && requestUrl.searchParams.get('id') === `eq.${appointmentId}`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: appointmentId, paciente_id: patientId,
          medico_id: '00000000-0000-4000-8000-000000000003',
          data: appointmentDate, hora_inicio: '08:30:00', tipo: 'Consulta',
        }),
      });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/prontuarios**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.fallback();
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/fila');
  const main = page.locator('#main-content');
  await expect(main.getByRole('button', { name: 'Iniciar Atendimento', exact: true })).toBeVisible();
  await main.getByRole('button', { name: 'Iniciar Atendimento', exact: true }).click();

  await expect.poll(() => transitionCalls.length).toBe(1);
  expect(transitionCalls[0]).toEqual({
    p_agendamento_id: appointmentId,
    p_fila_id: '00000000-0000-4000-9000-000000000061',
  });
  await expect(page).toHaveURL(new RegExp(`/prontuarios/atendimento\\?paciente=${patientId}.*agendamento=${appointmentId}`));
  const clinicalWorkspace = page.locator('#main-content');
  await expect(clinicalWorkspace.getByRole('heading', { name: 'Nova evolução' })).toBeVisible();
  await expect(clinicalWorkspace.getByText('Bruno Almeida', { exact: true }).first()).toBeVisible();
  const appointmentContext = clinicalWorkspace.getByTestId('prontuario-agendamento-context');
  await expect(appointmentContext).toContainText('08:30');
  await expect(appointmentContext).toContainText('Consulta');
  await expect(appointmentContext).toContainText('Dra. Marina Ribeiro');
  await expect.poll(() => auditCalls.length).toBeGreaterThan(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('fila-atendimento-prontuario-novo-1280.png'), animations: 'disabled' });

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(clinicalWorkspace.getByRole('heading', { name: 'Nova evolução' })).toBeVisible();
  await expect(appointmentContext).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('fila-atendimento-prontuario-novo-375.png'), animations: 'disabled' });
  expect(transitionCalls).toHaveLength(1);
});

test('doctor reopens the prontuario already linked to an active queue appointment', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role: 'medico', queuePopulated: true });
  const appointmentId = '00000000-0000-4000-9000-000000000012';
  const patientId = '00000000-0000-4000-8000-000000000012';
  const prontuarioId = '00000000-0000-4000-9000-000000000201';
  const appointmentDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const historyAccesses: string[] = [];
  const examInsertPayloads: Array<Array<Record<string, unknown>>> = [];
  const requestedLabResultFilters: string[] = [];
  let labReadsBeforeHistoryAudit = 0;
  let labResultMode: 'loading' | 'success' | 'empty' | 'error' = 'success';
  const syntheticExames: Array<Record<string, unknown>> = [];
  const syntheticColetas: Array<Record<string, unknown>> = [];
  const coletaInsertPayloads: Array<Record<string, unknown>> = [];

  await page.route('**/rest/v1/rpc/registrar_visualizacao_historico_paciente*', async route => {
    historyAccesses.push('historico');
    await route.fulfill({ status: 200, contentType: 'application/json', body: '1' });
  });
  await page.route('**/rest/v1/rpc/registrar_prontuario_acesso*', async route => {
    historyAccesses.push('prontuario');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify('synthetic-access-id') });
  });
  await page.route('**/rest/v1/pacientes**', async route => {
    const requestUrl = new URL(route.request().url());
    if (route.request().method() === 'GET' && requestUrl.searchParams.get('id')?.includes(patientId)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: patientId, clinica_id: '00000000-0000-4000-8000-000000000002',
          nome: 'Carla Oliveira', nome_social: null, cpf: null, telefone: null, email: null,
          data_nascimento: '1990-05-14', sexo: 'nao_informado', alergias: [], ativo: true,
        }]),
      });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/agendamentos**', async route => {
    const requestUrl = new URL(route.request().url());
    if (route.request().method() === 'GET' && requestUrl.searchParams.get('id') === `eq.${appointmentId}`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: appointmentId, paciente_id: patientId, medico_id: '00000000-0000-4000-8000-000000000003', data: appointmentDate, hora_inicio: '09:00:00', tipo: 'Consulta' }),
      });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/prontuarios**', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const requestUrl = new URL(route.request().url());
    const requestedId = requestUrl.searchParams.get('id')?.replace(/^eq\./, '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: requestUrl.searchParams.get('assinado') === 'eq.false' || (requestedId && requestedId !== prontuarioId) ? '[]' : JSON.stringify([{
        id: prontuarioId, clinica_id: '00000000-0000-4000-8000-000000000002',
        paciente_id: patientId, agendamento_id: appointmentId,
        medico_id: '00000000-0000-4000-8000-000000000003', data: appointmentDate,
        queixa_principal: 'Evolução já registrada', assinado: true,
        medicos: { nome: 'Dra. Marina Ribeiro', crm: '000000', especialidade: 'Clínica geral' },
      }]),
    });
  });
  await page.route('**/rest/v1/prescricoes**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/rest/v1/resultados_laboratorio**', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const requestUrl = new URL(route.request().url());
    requestedLabResultFilters.push(requestUrl.searchParams.toString());
    if (!historyAccesses.includes('historico')) labReadsBeforeHistoryAudit += 1;
    if (labResultMode === 'loading') await new Promise(resolve => setTimeout(resolve, 500));
    if (labResultMode === 'error') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'SYNTHETIC_FAILURE', message: 'Falha simulada na leitura do laboratório' }) });
      return;
    }
    const authorizedRelease = requestUrl.searchParams.get('liberado') === 'eq.true'
      && requestUrl.searchParams.get('clinica_id') === 'eq.00000000-0000-4000-8000-000000000002'
      && requestUrl.searchParams.get('paciente_id') === `eq.${patientId}`;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(authorizedRelease && labResultMode !== 'empty' ? [{
      id: 'synthetic-result-release-1', parametro: 'Hemoglobina', resultado: '13,8', unidade: 'g/dL',
      critico: false, numero_versao: 1, data_liberacao: '2026-10-29T10:30:00-03:00',
      valor_referencia_min: 12, valor_referencia_max: 16, valor_referencia_texto: null, coleta_id: 'synthetic-collection-release-1',
      coletas_laboratorio: { id: 'synthetic-collection-release-1', codigo_amostra: 'QA-1042' },
      exames: { tipo_exame: 'Hemograma completo' },
    }] : []) });
  });
  await page.route('**/rest/v1/exames**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(syntheticExames) });
      return;
    }
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as Array<Record<string, unknown>>;
      examInsertPayloads.push(payload);
      const inserted = payload.map((exam, index) => ({
        ...exam,
        id: `synthetic-exam-${index + 1}`,
        pacientes: { nome: 'Carla Oliveira', nome_social: null },
        medicos: { nome: 'Dra. Marina Ribeiro', crm: '000000', especialidade: 'Clínica geral' },
      }));
      syntheticExames.splice(0, syntheticExames.length, ...inserted);
      syntheticColetas.splice(0, syntheticColetas.length, ...inserted.map((exam, index) => ({
        id: `synthetic-coleta-${index + 1}`,
        exame_id: exam.id,
        clinica_id: '00000000-0000-4000-8000-000000000002',
        status: 'pendente',
        urgente: false,
        created_at: new Date().toISOString(),
        pacientes: { nome: 'Carla Oliveira', nome_social: null, cpf: null },
      })));
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(inserted) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/coletas_laboratorio**', async route => {
    if (route.request().method() === 'GET') {
      const requestUrl = new URL(route.request().url());
      const exameId = requestUrl.searchParams.get('exame_id')?.replace(/^eq\./, '');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(syntheticColetas.filter(coleta => !exameId || coleta.exame_id === exameId)) });
      return;
    }
    if (route.request().method() === 'POST') {
      coletaInsertPayloads.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/laboratorios**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/rest/v1/tipo_exames_catalog**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/fila');
  const main = page.locator('#main-content');
  await expect(main.getByRole('button', { name: 'Abrir prontuário', exact: true })).toBeVisible();
  await main.getByRole('button', { name: 'Abrir prontuário', exact: true }).click();

  await expect(page).toHaveURL(/\/prontuarios(?:\?.*)?$/);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /Prontuário.*Carla Oliveira/ })).toBeVisible();
  await expect(dialog.locator('textarea').first()).toHaveValue('Evolução já registrada');
  await expect(dialog.getByTestId('prontuario-agendamento-context')).toContainText('09:00');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('tab', { name: 'Solicitações' }).click();
  await expect(page.getByText('Resultados laboratoriais liberados')).toBeVisible();
  await expect(page.getByText('Hemoglobina', { exact: true })).toBeVisible();
  await expect(page.getByText('13,8 g/dL')).toBeVisible();
  await expect(page.getByText('Amostra QA-1042')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir laudo' })).toHaveAttribute('href', '/laudos-lab?coleta=synthetic-collection-release-1');
  expect(requestedLabResultFilters.some(filters => filters.includes('liberado=eq.true') && filters.includes(`paciente_id=eq.${patientId}`) && filters.includes('clinica_id=eq.00000000-0000-4000-8000-000000000002'))).toBe(true);
  expect(labReadsBeforeHistoryAudit).toBe(0);
  const releasedResult = page.getByRole('listitem').filter({ hasText: 'Hemoglobina' });
  await releasedResult.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('prontuario-resultados-laboratorio-liberados-1280.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByText('Hemoglobina', { exact: true })).toBeVisible();
  await page.locator('#main-content').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(page.getByText(/Liberado em 29\/10\/26/)).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('prontuario-resultados-laboratorio-liberados-375.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1280, height: 800 });
  labResultMode = 'loading';
  await page.getByRole('tab', { name: 'Evoluções' }).click();
  await page.getByRole('tab', { name: 'Solicitações' }).click();
  await expect(page.getByRole('status', { name: 'Carregando registros relacionados' })).toBeVisible();
  await expect(page.getByText('Hemoglobina', { exact: true })).toBeVisible();
  labResultMode = 'empty';
  await page.getByRole('tab', { name: 'Evoluções' }).click();
  await page.getByRole('tab', { name: 'Solicitações' }).click();
  await expect(page.getByText('Nenhum resultado liberado para este paciente.')).toBeVisible();
  labResultMode = 'error';
  await page.getByRole('tab', { name: 'Evoluções' }).click();
  await page.getByRole('tab', { name: 'Solicitações' }).click();
  await expect(page.getByRole('alert')).toContainText('Não conseguimos carregar estas informações agora.');
  labResultMode = 'success';
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('Hemoglobina', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Evoluções' }).click();
  await page.getByRole('button', { name: /Abrir evolução de/ }).click();
  await expect(dialog).toBeVisible();
  expect(historyAccesses).toContain('historico');
  expect(historyAccesses).toContain('prontuario');
  expect(historyAccesses.at(-1)).toBe('prontuario');
  await page.screenshot({ path: testInfo.outputPath('fila-atendimento-prontuario-existente-1280.png'), animations: 'disabled' });

  await dialog.getByRole('button', { name: 'Solicitar Exame' }).click();
  await expect(page).toHaveURL(new RegExp(`/exames/nova\\?paciente=${patientId}.*prontuario=${prontuarioId}`));
  const examDialog = page.locator('#main-content');
  await expect(examDialog.getByRole('heading', { name: 'Nova Guia de Exames' })).toBeVisible();
  await expect(examDialog.getByRole('note')).toContainText('Carla Oliveira');
  await expect(examDialog.getByRole('note')).toContainText('associados a este prontuário');
  await page.screenshot({ path: testInfo.outputPath('pedido-exame-contexto-prontuario-1280.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: testInfo.outputPath('pedido-exame-contexto-prontuario-375.png'), animations: 'disabled' });
  const examFooter = examDialog.getByTestId('exam-request-footer');
  await examFooter.scrollIntoViewIfNeeded();
  expect((await examFooter.boundingBox())!.y + (await examFooter.boundingBox())!.height).toBeLessThanOrEqual(752);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await examDialog.getByLabel(/Indicação Clínica/).scrollIntoViewIfNeeded();
  await expect(examDialog.getByLabel(/Indicação Clínica/)).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('pedido-exame-contexto-prontuario-375-rolado.png'), animations: 'disabled' });
  await examDialog.getByPlaceholder('Buscar por nome, TUSS ou código livre...').fill('Hemograma Completo');
  await examDialog.getByRole('button', { name: /Hemograma Completo/ }).click();
  await examDialog.getByLabel(/Indicação Clínica/).fill('Investigação de anemia em acompanhamento.');
  await examDialog.getByRole('button', { name: 'Solicitar (1)' }).click();
  await expect.poll(() => examInsertPayloads.length).toBe(1);
  expect(examInsertPayloads[0]).toHaveLength(1);
  expect(examInsertPayloads[0][0]).toMatchObject({
    paciente_id: patientId,
    prontuario_id: prontuarioId,
    medico_solicitante_id: '00000000-0000-4000-8000-000000000003',
    tipo_exame: '40304361 - Hemograma Completo',
  });
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('40304361 - Hemograma Completo', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Coleta no Laboratório' })).toBeVisible();
  expect(coletaInsertPayloads).toHaveLength(0);
  const savedRequestUrl = new URL(page.url());
  expect(savedRequestUrl.searchParams.has('prontuario')).toBe(false);
  expect(savedRequestUrl.searchParams.get('voltar')).toBe('prontuario');
  await expect(page.getByRole('link', { name: 'Voltar ao prontuário' })).toBeVisible();
  await page.getByRole('link', { name: 'Coleta no Laboratório' }).click();
  await expect(page).toHaveURL(/\/laboratorio$/);
  const labSearch = page.getByRole('textbox', { name: 'Buscar coletas por paciente, código ou CPF' });
  await expect(labSearch).toHaveValue('Carla Oliveira');
  await expect(page.getByRole('tabpanel', { name: 'Worklist' }).getByText('Carla Oliveira', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('pedido-exame-worklist-contexto-375.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: testInfo.outputPath('pedido-exame-worklist-contexto-1280.png'), animations: 'disabled' });

  await page.goto(`/exames?paciente=${patientId}&prontuario=00000000-0000-4000-9000-000000000299&novo=1&voltar=prontuario`);
  const invalidContextDialog = page.locator('#main-content');
  await expect(invalidContextDialog.getByRole('alert')).toContainText('Não foi possível confirmar o paciente e o prontuário de origem');
  await invalidContextDialog.getByPlaceholder('Buscar por nome, TUSS ou código livre...').fill('Hemograma Completo');
  await invalidContextDialog.getByRole('button', { name: /Hemograma Completo/ }).click();
  await invalidContextDialog.getByLabel(/Indicação Clínica/).fill('Pedido com prontuário de origem não validado.');
  await invalidContextDialog.getByRole('button', { name: 'Solicitar (1)' }).click();
  await expect(page.getByText('Não foi possível confirmar o vínculo com o prontuário de origem.')).toBeVisible();
  expect(examInsertPayloads).toHaveLength(1);
  await invalidContextDialog.getByRole('button', { name: 'Voltar aos exames', exact: true }).click();
  await page.getByRole('button', { name: 'Descartar e sair' }).click();
  await expect(page).not.toHaveURL(/prontuario=.*novo=1/);
  await expect(page.getByRole('link', { name: 'Voltar ao prontuário' })).toBeVisible();
});

test('reception hides the triage shortcut from roles without clinical access', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'recepcao', receptionPopulated: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/recepcao');
  const main = page.locator('#main-content');
  await expect(main.locator('h1').first()).toBeVisible();
  await expect(main.getByRole('button', { name: 'Check-in' }).first()).toBeVisible();
  await expect(main.getByRole('button', { name: /Abrir triagem de / })).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('reception does not offer triage before the patient checks in', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'admin', receptionPopulated: true });
  await page.route('**/rest/v1/rpc/listar_agendamentos_com_triagem*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/recepcao');
  const main = page.locator('#main-content');
  await expect(main.getByRole('button', { name: 'Check-in' }).first()).toBeVisible();
  await expect(main.getByRole('button', { name: /Abrir triagem de / })).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('reception keeps triage hidden when its status lookup fails and restores it after retry', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'admin', receptionPopulated: true });
  let attempts = 0;
  await page.route('**/rest/v1/rpc/listar_agendamentos_com_triagem*', route => {
    attempts += 1;
    return route.fulfill(attempts <= 2
      ? { status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'temporary failure' }) }
      : { status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/rest/v1/fila_atendimento**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(Array.from({ length: 7 }, (_, index) => ({
      id: `00000000-0000-4000-9000-${String(index + 60).padStart(12, '0')}`,
      clinica_id: '00000000-0000-4000-8000-000000000002',
      agendamento_id: `00000000-0000-4000-9000-${String(index + 10).padStart(12, '0')}`,
      status: 'aguardando', horario_chegada: new Date().toISOString(),
    }))),
  }));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/recepcao');
  const main = page.locator('#main-content');
  await expect(main.getByRole('alert')).toContainText('O atalho de triagem fica oculto');
  await expect(main.getByRole('button', { name: /Abrir triagem de / })).toHaveCount(0);
  await main.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(main.getByRole('alert')).toHaveCount(0);
  await expect(main.getByRole('button', { name: /Abrir triagem de / })).toHaveCount(7);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('authorized reception shortcut carries patient and appointment into the triage form', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role: 'admin', receptionPopulated: true });
  const patientNames = ['Ana Souza', 'Bruno Almeida', 'Carla Oliveira', 'Diego Santos', 'Elisa Ferreira', 'Felipe Costa', 'Gabriela Lima'];
  const appointmentIds = patientNames.map((_, index) => `00000000-0000-4000-9000-${String(index + 10).padStart(12, '0')}`);
  const patientLookupUrls: string[] = [];
  await page.route('**/rest/v1/pacientes**', async route => {
    const requestUrl = new URL(route.request().url());
    const patientFilter = requestUrl.searchParams.get('id');
    if (route.request().method() === 'GET' && patientFilter?.startsWith('eq.')) {
      const requestedPatientId = patientFilter.slice(3);
      patientLookupUrls.push(requestUrl.toString());
      const patientIndex = Number(requestedPatientId.slice(-12)) - 10;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: requestedPatientId, clinica_id: '00000000-0000-4000-8000-000000000002',
          nome: patientNames[patientIndex], nome_social: null, cpf: null, telefone: '(11) 90000-0000',
          email: null, data_nascimento: '1990-05-14', sexo: 'nao_informado', ativo: true,
        }),
      });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/fila_atendimento**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(appointmentIds.map((agendamento_id, index) => ({
          id: `00000000-0000-4000-9000-${String(index + 60).padStart(12, '0')}`,
          clinica_id: '00000000-0000-4000-8000-000000000002', agendamento_id,
          status: 'aguardando', prioridade: 'normal', horario_chegada: new Date().toISOString(),
        }))),
      });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/rpc/listar_agendamentos_com_triagem*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ agendamento_id: appointmentIds[0] }]),
  }));

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/recepcao');
  const main = page.locator('#main-content');
  await expect(main.getByText('Ana Souza', { exact: true }).first()).toBeVisible();
  await expect(main.getByText('Triagem registrada').first()).toBeVisible();
  await expect(main.getByRole('button', { name: /Abrir triagem de / })).toHaveCount(6);
  await page.screenshot({ path: testInfo.outputPath('recepcao-triagem-origem-1280.png'), animations: 'disabled' });
  const triageButton = main.getByRole('button', { name: /Abrir triagem de / }).first();
  const patientName = (await triageButton.getAttribute('aria-label'))?.replace('Abrir triagem de ', '') ?? '';
  const patientIndex = patientNames.indexOf(patientName);
  expect(patientIndex).toBeGreaterThanOrEqual(0);
  const patientId = `00000000-0000-4000-8000-${String(patientIndex + 10).padStart(12, '0')}`;
  await expect(triageButton).toBeVisible();
  await triageButton.click();

  await expect(page).toHaveURL('/triagem/nova?origem=recepcao');
  const form = page.locator('#main-content');
  await expect(form.getByRole('heading', { name: 'Nova triagem' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Paciente encaminhado para triagem!')).toHaveCount(0);
  await expect.poll(() => patientLookupUrls.length).toBeGreaterThan(0);
  expect(patientLookupUrls[0]).toContain(patientId);
  await expect(form.locator('#triagem-paciente'), `consulta de paciente: ${patientLookupUrls.join(' | ')}`).toContainText(patientName);
  await expect(form.locator('#triagem-agendamento')).toContainText(patientName);
  await page.screenshot({ path: testInfo.outputPath('recepcao-triagem-contexto-1280.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(form.locator('#triagem-paciente')).toContainText(patientName);
  await expect(form.locator('#triagem-agendamento')).toContainText(patientName);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('recepcao-triagem-contexto-375.png'), animations: 'disabled' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('triage saves clinical data and advances the checked-in appointment into the queue', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role: 'enfermagem', queuePopulated: true, queueTriagePending: true });
  const appointmentId = '00000000-0000-4000-9000-000000000010';
  const patientId = '00000000-0000-4000-8000-000000000010';
  let savedTriage: Record<string, unknown> | null = null;
  let queueTransition: Record<string, unknown> | null = null;

  await page.route('**/rest/v1/pacientes**', async route => {
    const url = new URL(route.request().url());
    const idFilter = url.searchParams.get('id');
    if (route.request().method() === 'GET' && idFilter === `eq.${patientId}`) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        id: patientId, clinica_id: '00000000-0000-4000-8000-000000000002', nome: 'Ana Souza', nome_social: null,
        cpf: null, telefone: '(11) 90000-0000', email: null, data_nascimento: '1990-05-14', sexo: 'nao_informado', ativo: true,
      }) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/triagens**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    if (route.request().method() === 'POST') {
      savedTriage = route.request().postDataJSON()[0];
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-4000-9000-000000000099' }) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/rpc/realizar_checkin*', async route => {
    queueTransition = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ repetido: true }) });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/triagem/nova?origem=recepcao&paciente=${patientId}&agendamento=${appointmentId}`);
  const form = page.locator('#main-content');
  await expect(page).toHaveURL('/triagem/nova?origem=recepcao');
  await expect(form.getByRole('heading', { name: 'Nova triagem' })).toBeVisible();
  await expect(form.locator('#triagem-paciente')).toContainText('Ana Souza');
  await expect(form.locator('#triagem-agendamento')).toContainText('Ana Souza');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await form.getByLabel('Pressão Arterial *').fill('120/80');
  const riscoUrgente = form.getByRole('button', { name: /Urgente.*30 min/ });
  await riscoUrgente.focus();
  await riscoUrgente.press('Space');
  await expect(riscoUrgente).toHaveAttribute('aria-pressed', 'true');
  await form.locator('#triagem-queixa').fill('Dor de cabeça há dois dias — dado sintético de QA');
  await page.screenshot({ path: testInfo.outputPath('triagem-formulario-contexto-1280.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(form.locator('#triagem-paciente')).toContainText('Ana Souza');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('triagem-formulario-contexto-375.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await form.getByRole('button', { name: 'Registrar triagem' }).click();

  await expect(page.getByText('Triagem registrada!')).toBeVisible();
  await expect(page).toHaveURL('/recepcao');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(savedTriage).toMatchObject({
    paciente_id: patientId,
    agendamento_id: appointmentId,
    pressao_arterial: '120/80',
    classificacao_risco: 'amarelo',
    queixa_principal: 'Dor de cabeça há dois dias — dado sintético de QA',
    clinica_id: '00000000-0000-4000-8000-000000000002',
  });
  expect(queueTransition).toMatchObject({ p_agendamento_id: appointmentId, p_prioridade: 'preferencial' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('triage remains saved and shows a recovery warning if queue transition fails', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role: 'enfermagem', queuePopulated: true, queueTriagePending: true });
  const appointmentId = '00000000-0000-4000-9000-000000000010';
  const patientId = '00000000-0000-4000-8000-000000000010';
  let triageInsertCount = 0;

  await page.route('**/rest/v1/pacientes**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET' && url.searchParams.get('id') === `eq.${patientId}`) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        id: patientId, clinica_id: '00000000-0000-4000-8000-000000000002', nome: 'Ana Souza', nome_social: null,
        cpf: null, telefone: '(11) 90000-0000', email: null, data_nascimento: '1990-05-14', sexo: 'nao_informado', ativo: true,
      }) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/triagens**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    if (route.request().method() === 'POST') {
      triageInsertCount += 1;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-4000-9000-000000000099' }) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/rpc/realizar_checkin*', route => route.fulfill({
    status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Falha sintética ao sincronizar a fila' }),
  }));

  await page.goto(`/fila?tab=triagem&paciente=${patientId}&agendamento=${appointmentId}`);
  const form = page.locator('#main-content');
  await expect(form.getByRole('heading', { name: 'Nova triagem' })).toBeVisible();
  await form.getByLabel('Pressão Arterial *').fill('120/80');
  await form.getByRole('button', { name: /Urgente \(30 min\)/ }).click();
  await expect(form.getByRole('button', { name: /Urgente \(30 min\)/ })).toHaveAttribute('aria-pressed', 'true');
  await form.locator('#triagem-queixa').fill('Queixa sintética para validar recuperação');
  await form.getByRole('button', { name: 'Registrar triagem' }).click();

  await expect(page.getByText('Triagem registrada!')).toBeVisible();
  await expect(page.getByText(/A fila não foi atualizada/)).toBeVisible();
  await expect(page).toHaveURL('/fila?tab=triagem');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(triageInsertCount).toBe(1);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('reception identifies the patient while check-in is pending', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'recepcao', receptionPopulated: true });
  let releaseRequest!: () => void;
  let notifyRequestStarted!: () => void;
  const blockedRequest = new Promise<void>(resolve => { releaseRequest = resolve; });
  const requestStarted = new Promise<void>(resolve => { notifyRequestStarted = resolve; });
  await page.route('**/rest/v1/rpc/realizar_checkin*', async route => {
    notifyRequestStarted();
    await blockedRequest;
    await route.abort();
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/recepcao');
  const summary = page.locator('[aria-label^="Resumo de atendimento"]');
  const summaryColumns = await summary.getByTestId('reception-operational-summary').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(summaryColumns).toBe(4);
  await page.screenshot({ path: testInfo.outputPath('reception-summary-1280.png'), fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/recepcao');
  const mobileSummary = page.locator('[aria-label^="Resumo de atendimento"]');
  const mobileColumns = await mobileSummary.getByTestId('reception-operational-summary').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(mobileColumns).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('reception-summary-375.png'), fullPage: true, animations: 'disabled' });
  const showSecondaryMetrics = page.getByRole('button', { name: 'Ver outros 5 indicadores' });
  await expect(showSecondaryMetrics).toHaveAttribute('aria-expanded', 'false');
  await showSecondaryMetrics.click();
  await expect(page.getByRole('button', { name: 'Ocultar indicadores adicionais' })).toHaveAttribute('aria-expanded', 'true');
  await expect(mobileSummary.getByRole('button', { name: /Recebido líquido/ })).toBeVisible();
  await expect(mobileSummary.getByRole('button', { name: /Nenhum consultório ocupado/ })).toBeVisible();
  const clippedCaptions = await mobileSummary.locator('button p[title]').evaluateAll(elements => elements
    .filter(element => element.scrollHeight > element.clientHeight + 1)
    .map(element => element.getAttribute('title')));
  expect(clippedCaptions, 'as descrições dos indicadores devem ficar legíveis ao expandir').toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('reception-summary-375-expanded.png'), fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/recepcao');
  await page.getByRole('button', { name: 'Check-in' }).first().click();
  await requestStarted;

  const processingButton = page.locator('button[aria-busy="true"]');
  await expect(processingButton).toContainText(/Registrando/);
  await expect(processingButton).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('reception-checkin-pending.png'), fullPage: true, animations: 'disabled' });
  releaseRequest();
  await expect(processingButton).toHaveCount(0);
  await expect(page.getByText('Erro ao realizar check-in')).toBeVisible();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('reception check-in carries a free visit into the clinician queue', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'recepcao', receptionPopulated: true });
  const appointmentId = '00000000-0000-4000-9000-000000000010';
  const patientId = '00000000-0000-4000-8000-000000000010';
  const queueId = '00000000-0000-4000-9000-000000000090';
  const todayParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const today = `${todayParts.find(part => part.type === 'year')?.value}-${todayParts.find(part => part.type === 'month')?.value}-${todayParts.find(part => part.type === 'day')?.value}`;
  let queueRow: Record<string, unknown> | null = null;
  let confirmedAsFree = false;

  await page.route('**/rest/v1/tipos_consulta**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
      id: '00000000-0000-4000-8000-000000000070',
      clinica_id: '00000000-0000-4000-8000-000000000002',
      nome: 'Retorno', valor_particular: 0, ativo: true,
    }]) });
  });
  await page.route('**/rest/v1/lancamentos**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/rpc/realizar_checkin*', async route => {
    queueRow = {
      id: queueId, clinica_id: '00000000-0000-4000-8000-000000000002', agendamento_id: appointmentId,
      posicao: 1, horario_chegada: new Date().toISOString(), status: 'aguardando', prioridade: 'normal',
      cobranca_estado: 'pendente', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      agendamentos: {
        id: appointmentId, data: today,
        status: 'aguardando', paciente_id: patientId, medico_id: '00000000-0000-4000-8000-000000000003',
        pacientes: { nome: 'Ana Souza', nome_social: null },
        medicos: { nome: 'Dra. Marina Ribeiro', crm: '000000' },
      },
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      repetido: false, fila_id: queueId, status_agendamento: 'aguardando', status_anterior: 'confirmado', cobranca_estado: 'pendente',
    }) });
  });
  await page.route('**/rest/v1/rpc/confirmar_estado_cobranca_checkin*', async route => {
    confirmedAsFree = route.request().postDataJSON().p_gratuito === true;
    if (queueRow) queueRow.cobranca_estado = 'gratuita';
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
  });
  await page.route('**/rest/v1/fila_atendimento**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (route.request().method() === 'GET' && pathname === '/rest/v1/fila_atendimento') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(queueRow ? [queueRow] : []) });
      return;
    }
    await route.fallback();
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/recepcao');
  await page.getByRole('button', { name: 'Check-in' }).first().click();
  await expect(page.getByText('Check-in realizado!')).toBeVisible();
  await expect(page.getByText('Atendimento sem cobrança. Paciente pronto para ser chamado.')).toBeVisible();
  expect(confirmedAsFree).toBe(true);
  expect(queueRow).toMatchObject({ cobranca_estado: 'gratuita', agendamento_id: appointmentId });

  await page.goto('/fila');
  const main = page.locator('#main-content');
  await expect(main.getByText('Ana Souza').first()).toBeVisible();
  await expect(main.getByText('1 paciente aguardando confirmação da cobrança ou pagamento')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('reception-free-checkin-to-queue-1280.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  const stageGrid = main.getByTestId('fila-stage-grid');
  expect(await stageGrid.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
  const queueCard = main.getByTestId('fila-card').first();
  await expect(queueCard).toHaveCount(1);
  const queueCardBounds = await queueCard.boundingBox();
  expect(queueCardBounds?.y).toBeLessThan(720);
  await expect(queueCard.getByText('Ana Souza')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('reception-free-checkin-to-queue-390.png'), fullPage: true, animations: 'disabled' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('reception check-in keeps context through queue triage and applies the clinical risk priority', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const todayParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const today = `${todayParts.find(part => part.type === 'year')?.value}-${todayParts.find(part => part.type === 'month')?.value}-${todayParts.find(part => part.type === 'day')?.value}`;
  await page.clock.install({ time: new Date(`${today}T09:00:00-03:00`) });
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role: 'admin', receptionPopulated: true, today });
  const appointmentId = '00000000-0000-4000-9000-000000000010';
  const patientId = '00000000-0000-4000-8000-000000000010';
  const clinicId = '00000000-0000-4000-8000-000000000002';
  const queueId = '00000000-0000-4000-9000-000000000090';
  const appointment: Record<string, any> = {
    id: appointmentId, clinica_id: clinicId, paciente_id: patientId,
    medico_id: '00000000-0000-4000-8000-000000000003', data: today,
    hora_inicio: '10:30:00', hora_fim: '11:00:00', tipo: 'Retorno',
    status: 'confirmado', exige_triagem: true,
    pacientes: { id: patientId, nome: 'Ana Souza', nome_social: null, cpf: null, telefone: '(11) 90000-0000', convenio_id: null, ativo: true },
    medicos: { id: '00000000-0000-4000-8000-000000000003', nome: 'Dra. Marina Ribeiro', crm: '000000', especialidade: 'Clínica geral' },
  };
  let queueRow: Record<string, any> | null = null;
  let savedTriage: Record<string, any> | null = null;
  const checkinCalls: Array<Record<string, unknown>> = [];
  let startPayload: Record<string, unknown> | null = null;
  let finalizationPayload: Record<string, unknown> | null = null;
  let exitEventsRequested = false;

  await page.route('**/rest/v1/tipos_consulta**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{ id: 'tipo-retorno-qa', clinica_id: clinicId, nome: 'Retorno', valor_particular: 0, ativo: true }]),
  }));
  await page.route('**/rest/v1/agendamentos**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([appointment]) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/pacientes**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET' && url.searchParams.get('id') === `eq.${patientId}`) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(appointment.pacientes) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/lancamentos**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/fila_atendimento_eventos**', route => {
    exitEventsRequested = true;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route(url => new URL(url).pathname === '/rest/v1/fila_atendimento', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(queueRow ? [queueRow] : []) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/triagens**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(savedTriage ? [{ ...savedTriage, id: 'triagem-qa', pacientes: appointment.pacientes }] : []) });
      return;
    }
    if (route.request().method() === 'POST') {
      savedTriage = route.request().postDataJSON()[0];
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'triagem-qa' }) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/rpc/listar_agendamentos_com_triagem*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify(savedTriage ? [{ agendamento_id: appointmentId }] : []),
  }));
  await page.route('**/rest/v1/rpc/realizar_checkin*', async route => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    checkinCalls.push(payload);
    if (!queueRow) {
      appointment.status = 'aguardando';
      queueRow = {
        id: queueId, clinica_id: clinicId, agendamento_id: appointmentId,
        posicao: 1, horario_chegada: new Date().toISOString(), status: 'aguardando', prioridade: 'normal',
        cobranca_estado: 'pendente', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        agendamentos: appointment,
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        repetido: false, fila_id: queueId, status_agendamento: 'aguardando', status_anterior: 'confirmado', cobranca_estado: 'pendente',
      }) });
      return;
    }
    queueRow.prioridade = payload.p_prioridade;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ repetido: true, fila_id: queueId }) });
  });
  await page.route('**/rest/v1/rpc/confirmar_estado_cobranca_checkin*', async route => {
    if (queueRow) queueRow.cobranca_estado = 'gratuita';
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
  });
  await page.route('**/rest/v1/rpc/iniciar_atendimento_atomico*', async route => {
    startPayload = route.request().postDataJSON() as Record<string, unknown>;
    appointment.status = 'em_atendimento';
    if (queueRow) {
      queueRow.status = 'em_atendimento';
      queueRow.updated_at = new Date().toISOString();
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ repetido: false, status: 'em_atendimento' }) });
  });
  await page.route('**/rest/v1/rpc/finalizar_atendimento_atomico*', async route => {
    finalizationPayload = route.request().postDataJSON() as Record<string, unknown>;
    appointment.status = 'finalizado';
    if (queueRow) {
      queueRow.status = 'finalizado';
      queueRow.updated_at = new Date().toISOString();
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ status_agendamento: 'finalizado', cobranca_criada: false, repetido: false }]) });
  });
  await page.route('**/rest/v1/notification_queue*', route => route.fulfill({ status: 201, contentType: 'application/json', body: '[]' }));

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/recepcao');
  await page.getByRole('button', { name: 'Check-in' }).first().click();
  await expect(page.getByText('Atendimento sem cobrança. Paciente pronto para ser chamado.')).toBeVisible();
  expect(queueRow).toMatchObject({ agendamento_id: appointmentId, status: 'aguardando', cobranca_estado: 'gratuita' });

  await page.goto('/fila?tab=triagem');
  const pendingTriage = page.getByRole('region', { name: 'Pacientes aguardando triagem' });
  await expect(pendingTriage.getByText('Ana Souza')).toBeVisible();
  await pendingTriage.getByRole('button', { name: 'Triar Ana Souza' }).click();
  const form = page.locator('#main-content');
  await expect(form.getByRole('heading', { name: 'Nova triagem' })).toBeVisible();
  await expect(form.locator('#triagem-paciente')).toContainText('Ana Souza');
  await expect(form.locator('#triagem-agendamento')).toContainText('Ana Souza');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await form.getByLabel('Pressão Arterial *').fill('120/80');
  await form.getByRole('button', { name: /Urgente \(30 min\)/ }).click();
  await expect(form.getByRole('button', { name: /Urgente \(30 min\)/ })).toHaveAttribute('aria-pressed', 'true');
  await form.locator('#triagem-queixa').fill('Dor de cabeça há dois dias — dado sintético de QA');
  await page.screenshot({ path: testInfo.outputPath('reception-queue-triage-context-1280.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(form.getByRole('button', { name: /Urgente \(30 min\)/ })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: testInfo.outputPath('reception-queue-triage-context-390.png'), fullPage: true, animations: 'disabled' });
  const saveTriageButton = form.getByRole('button', { name: 'Registrar triagem' });
  await saveTriageButton.scrollIntoViewIfNeeded();
  await expect(saveTriageButton).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('reception-queue-triage-submit-390.png'), animations: 'disabled' });
  await saveTriageButton.click();

  await expect(page.getByText('Triagem registrada!')).toBeVisible();
  await expect(page).toHaveURL('/fila?tab=triagem');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(savedTriage).toMatchObject({
    paciente_id: patientId, agendamento_id: appointmentId, clinica_id: clinicId,
    pressao_arterial: '120/80', classificacao_risco: 'amarelo',
    queixa_principal: 'Dor de cabeça há dois dias — dado sintético de QA',
  });
  await page.clock.fastForward(5_000);
  await expect(page.getByText('Triagem registrada!')).toBeHidden();
  expect(checkinCalls).toEqual([
    { p_agendamento_id: appointmentId, p_prioridade: 'normal' },
    { p_agendamento_id: appointmentId, p_prioridade: 'preferencial' },
  ]);
  expect(queueRow).toMatchObject({ prioridade: 'preferencial', status: 'aguardando', cobranca_estado: 'gratuita' });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('tab', { name: 'Fila' }).click();
  await expect(page).toHaveURL('/fila');
  await expect.poll(() => exitEventsRequested).toBe(true);
  const queueMain = page.locator('#main-content');
  const queueCard = queueMain.getByTestId('fila-card').filter({ hasText: 'Ana Souza' });
  await expect(queueCard.getByText('Preferencial')).toBeVisible();
  await expect(queueCard.getByRole('button', { name: 'Iniciar' })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('reception-queue-ready-for-care-1280.png'), animations: 'disabled' });
  await queueCard.getByRole('button', { name: 'Iniciar' }).click();

  await expect(page).toHaveURL(new RegExp(`/prontuarios/atendimento\\?paciente=${patientId}.*agendamento=${appointmentId}`));
  const prontuarioWorkspace = page.locator('#main-content');
  await expect(prontuarioWorkspace.getByRole('heading', { name: 'Nova evolução' })).toBeVisible();
  await expect(prontuarioWorkspace.getByText('Ana Souza', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(startPayload).toEqual({ p_agendamento_id: appointmentId, p_fila_id: queueId });
  await page.screenshot({ path: testInfo.outputPath('reception-queue-clinical-handoff-1280.png'), animations: 'disabled' });

  await page.getByRole('link', { name: 'Fila e triagem', exact: true }).click();
  await expect(page).toHaveURL('/fila');
  const activeQueueCard = page.locator('#main-content').getByTestId('fila-card').filter({ hasText: 'Ana Souza' });
  await expect(activeQueueCard.getByText('Em Atendimento')).toBeVisible();
  await activeQueueCard.getByRole('button', { name: 'Finalizar' }).click();
  await expect(page).toHaveURL(new RegExp(`/atendimentos/${appointmentId}/finalizar\\?filaId=${queueId}&origem=fila$`));
  const finalizationMain = page.locator('#main-content');
  await expect(finalizationMain.getByRole('heading', { name: 'Finalizar atendimento' })).toBeVisible();
  await finalizationMain.getByText('30 dias', { exact: true }).click();
  await expect(finalizationMain.getByText(/Retorno previsto:/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('reception-queue-finalization-1280.png'), fullPage: true, animations: 'disabled' });
  await finalizationMain.getByRole('button', { name: 'Confirmar finalização' }).click();

  await expect(page).toHaveURL('/fila');
  expect(finalizationPayload).toMatchObject({
    p_agendamento_id: appointmentId,
    p_fila_id: queueId,
    p_agendar_retorno: true,
    p_dias_retorno: 30,
  });
  expect(queueRow).toMatchObject({ status: 'finalizado', cobranca_estado: 'gratuita' });
  expect(appointment).toMatchObject({ status: 'finalizado' });
  await page.clock.fastForward(8_000);
  await expect(page.getByText('Atendimento finalizado — Ana Souza')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('reception-queue-finalized-390.png'), fullPage: true, animations: 'disabled' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('exam cancellation and permanent deletion dialogs are clear and safely dismissible on desktop and mobile', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  await page.route('**/rest/v1/exames*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/1' },
      body: JSON.stringify([{
        id: '00000000-0000-4000-9000-000000000091',
        clinica_id: '00000000-0000-4000-8000-000000000002',
        paciente_id: '00000000-0000-4000-8000-000000000010',
        tipo_exame: 'Ultrassom abdominal QA',
        tipo_categorizado: 'Imagem',
        status: 'solicitado',
        data_solicitacao: new Date().toISOString().slice(0, 10),
        resultado: null,
        arquivo_resultado: null,
        pacientes: { nome: 'Ana Souza', nome_social: null, cpf: null, telefone: null, email: null },
        medicos: { nome: 'Dra. Marina Ribeiro', crm: '000000', especialidade: 'Clínica geral' },
      }]),
    });
  });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/exames');
    const main = page.locator('#main-content');
    await expect(main.getByRole('heading', { name: 'Solicitação de exames' })).toBeVisible();
    await expect(main.getByText('Ultrassom abdominal QA')).toBeVisible();
    await expect(main.getByText('Ana Souza').first()).toBeVisible();
    const todayIndicator = main.getByRole('button', { name: /Solicitados hoje/ });
    await expect(todayIndicator).toBeVisible();
    expect(await todayIndicator.locator('.text-2xl').evaluate(element => getComputedStyle(element).color)).toBe('rgb(20, 86, 192)');
    const waitingIndicator = main.getByRole('button', { name: /Aguardando resultado/ });
    await expect(waitingIndicator).toHaveAttribute('aria-pressed', 'false');
    expect(await waitingIndicator.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgb(20, 86, 192)');
    const clippedMetricText = await main.getByTestId('exam-status-kpis').locator('h3, p').evaluateAll(elements => elements
      .filter(element => getComputedStyle(element).textOverflow === 'ellipsis')
      .map(element => element.textContent?.trim()));
    expect(clippedMetricText, 'os indicadores devem mostrar rótulos e descrições completos').toEqual([]);
    if (viewport.width < 500) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath(`exames-destructive-actions-${viewport.width}.png`), fullPage: true, animations: 'disabled' });

    await main.getByRole('button', { name: 'Cancelar exame Ultrassom abdominal QA' }).click();
    const cancelDialog = page.getByRole('alertdialog');
    await expect(cancelDialog.getByRole('heading', { name: 'Cancelar solicitação de exame?' })).toBeVisible();
    await expect(cancelDialog).toContainText('O histórico permanecerá registrado.');
    await expect(cancelDialog.getByRole('button', { name: 'Manter exame' })).toBeVisible();
    const cancelAction = cancelDialog.getByRole('button', { name: 'Cancelar solicitação', exact: true });
    await expect(cancelAction).toHaveClass(/bg-destructive.*text-destructive-foreground/);
    expect(await cancelAction.evaluate(element => getComputedStyle(element).backgroundImage)).toBe('none');
    await page.keyboard.press('Escape');
    await expect(cancelDialog).toBeHidden();

    await main.getByRole('button', { name: 'Excluir exame Ultrassom abdominal QA' }).click();
    const deleteDialog = page.getByRole('alertdialog');
    await expect(deleteDialog.getByRole('heading', { name: 'Excluir solicitação de exame?' })).toBeVisible();
    await expect(deleteDialog).toContainText('Esta exclusão é permanente');
    await expect(deleteDialog.getByRole('button', { name: 'Manter exame' })).toBeVisible();
    const deleteAction = deleteDialog.getByRole('button', { name: 'Excluir exame', exact: true });
    await expect(deleteAction).toHaveClass(/bg-destructive.*text-destructive-foreground/);
    expect(await deleteAction.evaluate(element => getComputedStyle(element).backgroundImage)).toBe('none');
    await page.keyboard.press('Escape');
    await expect(deleteDialog).toBeHidden();
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
});

test('patient deletion dialog warns about linked history and points admins to LGPD on desktop', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/pacientes');
    const main = page.locator('#main-content');
    const patientRow = main.getByRole('row').filter({ hasText: 'Pessoa Exemplo QA' });
    await expect(patientRow).toBeVisible();
    await patientRow.getByRole('button', { name: 'Excluir Pessoa Exemplo QA' }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByRole('heading', { name: 'Confirmar exclusão' })).toBeVisible();
    await expect(dialog).toContainText('A exclusão só será permitida se esta ficha não tiver registros relacionados.');
    await expect(dialog).toContainText('o banco bloqueará a exclusão quando houver prontuário, atendimento, exame ou outro dado vinculado.');
    const lgpdLink = dialog.getByRole('link', { name: 'Abrir fluxo LGPD' });
    await expect(lgpdLink).toHaveAttribute('href', '/lgpd-pacientes');
    const deleteAction = dialog.getByRole('button', { name: 'Excluir ficha vazia' });
    await expect(deleteAction).toHaveClass(/bg-destructive/);
    await expect(deleteAction).toHaveClass(/text-destructive-foreground/);
    await expect(deleteAction).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`paciente-delete-dialog-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.filter(write => / DELETE \/rest\/v1\/pacientes(?:\?|$)/.test(write))).toEqual([]);
});

test('LGPD screen minimizes patient fields, exposes support, and makes the result cap searchable', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  const requestedColumns: string[] = [];
  let patientDeleteAttempts = 0;
  page.on('request', request => {
    const url = new URL(request.url());
    if (request.method() === 'POST' && url.pathname === '/rest/v1/rpc/buscar_pacientes_paginado') {
      requestedColumns.push(url.searchParams.get('select') ?? '');
    }
    if (request.method() === 'DELETE' && url.pathname === '/rest/v1/pacientes') patientDeleteAttempts += 1;
  });
  await page.route('**/rest/v1/rpc/buscar_pacientes_paginado*', async route => {
    const rows = Array.from({ length: 35 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
      nome: `Paciente QA ${String(index + 1).padStart(2, '0')}`,
      cpf: `000.000.000-${String(index).padStart(2, '0')}`,
      email: `paciente${index + 1}@example.test`,
    }));
    const params = route.request().postDataJSON();
    const matches = rows.filter(row => row.nome.toLowerCase().includes((params.p_termo ?? '').toLowerCase()));
    const start = params.p_offset ?? 0;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(matches.slice(start, start + params.p_limite)) });
  });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/lgpd-pacientes');
    const main = page.locator('#main-content');
    await expect(main.getByRole('heading', { name: 'Direitos do Titular (LGPD)' })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Solicitar análise ao suporte' })).toHaveAttribute('href', '/suporte');
    await expect(main.getByRole('textbox', { name: 'Buscar paciente por nome, CPF ou e-mail' })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Apagar' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(main.getByText('Há mais de 30 resultados. Refine a busca para localizar outro titular.')).toBeVisible();
    await expect(main.getByText('Paciente QA 30', { exact: true })).toBeVisible();
    await expect(main.getByText('Paciente QA 31', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`lgpd-search-cap-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
    const search = main.getByRole('textbox', { name: 'Buscar paciente por nome, CPF ou e-mail' });
    await search.fill('Paciente QA 35');
    await expect(main.getByText('Paciente QA 35', { exact: true })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Exportar' })).toHaveCount(1);
    await expect(main.getByText(/Há mais de 30 resultados/)).toHaveCount(0);
  }
  expect(requestedColumns.length).toBeGreaterThan(0);
  expect(requestedColumns.every(columns => columns === 'id,nome,cpf,email')).toBe(true);
  expect(patientDeleteAttempts).toBe(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('LGPD patient list empty state links to patient registration', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  await page.route('**/rest/v1/rpc/buscar_pacientes_paginado*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/lgpd-pacientes');
  const main = page.locator('#main-content');
  await expect(main.getByText('Nenhum paciente cadastrado ainda. Cadastre uma ficha antes de atender uma solicitação do titular.')).toBeVisible();
  await expect(main.getByRole('link', { name: 'Ir para Pacientes' })).toHaveAttribute('href', '/pacientes');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('LGPD export is audited before download and fails closed when audit insert fails', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, prontuarioPopulated: true });
  const auditWrites: Array<{ method: string; payload: Record<string, unknown> }> = [];
  const exportedPatientReads: string[] = [];
  const bulkPatientDataReads: string[] = [];
  const prescriptionFilters: string[] = [];
  const exportTableReads = new Set<string>();
  const exportSelects = new Map<string, string[]>();
  let auditMode: 'success' | 'failure' = 'success';
  const requestId = '00000000-0000-4000-8000-000000000090';
  const requestedAt = '2026-10-13T12:00:00.000Z';

  page.on('request', request => {
    const url = new URL(request.url());
    // The navbar independently loads its date-bounded agenda, outside this export.
    if (url.pathname === '/rest/v1/agendamentos' && url.searchParams.has('data')) return;
    if (request.method() === 'GET' && url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.split('/').pop() ?? '';
      exportTableReads.add(table);
      const selects = exportSelects.get(table) ?? [];
      selects.push(url.searchParams.get('select') ?? '');
      exportSelects.set(table, selects);
    }
    if (url.pathname === '/rest/v1/pacientes' && request.method() === 'GET') {
      exportedPatientReads.push(url.searchParams.get('select') ?? '');
    }
    if (request.method() === 'GET' && [
      'agendamentos', 'prontuarios', 'exames', 'triagens', 'atestados', 'encaminhamentos',
      'lancamentos', 'retornos', 'lista_espera', 'paciente_comorbidades', 'prescricoes',
      'anexos_prontuario', 'prontuario_adendos', 'audit_log', 'lgpd_consent_log',
    ].some(table => url.pathname === `/rest/v1/${table}`)) {
      bulkPatientDataReads.push(url.pathname);
    }
    if (request.method() === 'GET' && url.pathname === '/rest/v1/prescricoes') {
      prescriptionFilters.push(url.searchParams.toString());
    }
  });
  const syntheticExportRows: Record<string, unknown[]> = {
    agendamentos: [{ id: 'appointment-export-qa', paciente_id: '00000000-0000-4000-8000-000000000004', status: 'finalizado' }],
    lancamentos: [{ id: 'launch-export-qa', paciente_id: '00000000-0000-4000-8000-000000000004', valor: 125 }],
    lancamento_itens: [{ id: 'account-item-qa', lancamento_id: 'launch-export-qa', descricao: 'Consulta sintética' }],
    pagamentos: [{ id: 'payment-register-qa', lancamento_id: 'launch-export-qa', forma_pagamento: 'pix', valor: 125 }],
    fila_atendimento: [{ id: 'queue-export-qa', agendamento_id: 'appointment-export-qa', status: 'finalizado' }],
    consentimentos_lgpd: [{ id: 'consent-qa', paciente_id: '00000000-0000-4000-8000-000000000004', tipo_consentimento: 'tratamento_dados', aceito: true }],
    pedidos_laboratorio: [{ id: 'pedido-lab-qa', paciente_id: '00000000-0000-4000-8000-000000000004', status: 'solicitado' }],
    resultados_laboratorio: [{ id: 'resultado-lab-qa', paciente_id: '00000000-0000-4000-8000-000000000004', parametro: 'Hemoglobina', resultado: '13,8' }],
    whatsapp_conversations: [{ id: 'wa-conversation-qa', paciente_id: '00000000-0000-4000-8000-000000000004', remote_jid: '5511999999999@s.whatsapp.net', status: 'encerrado' }],
    whatsapp_messages: [{ id: 'wa-message-qa', conversation_id: 'wa-conversation-qa', direcao: 'entrada', tipo: 'texto', conteudo: 'Mensagem sintética sobre consulta' }],
    whatsapp_agent_actions: [{ id: 'wa-action-qa', conversation_id: 'wa-conversation-qa', tipo_acao: 'consulta_agenda', dados_entrada: { intent: 'schedule' } }],
    paciente_portal_tokens: [{ id: 'portal-token-qa', paciente_id: '00000000-0000-4000-8000-000000000004', ativo: true, expires_at: requestedAt }],
    pagamentos_mercadopago: [{ id: 'payment-qa', paciente_id: '00000000-0000-4000-8000-000000000004', valor: 125, status: 'aprovado' }],
  };
  let memedExportMode: 'success' | 'failure' = 'success';
  const memedExportCalls: Array<Record<string, unknown>> = [];
  await page.route('**/functions/v1/patient-lgpd-memed-export', async route => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    memedExportCalls.push(payload);
    if (memedExportMode === 'failure') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Falha sintética Memed' }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ memed_prescricoes: [{ id: 'memed-prescription-qa', paciente_id: payload.pacienteId, payload: { prescription: 'synthetic' } }] }),
    });
  });
  await page.route('**/rest/v1/*', async route => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop() ?? '';
    if (table === 'agendamentos' && url.searchParams.has('data')) return route.fallback();
    if (route.request().method() === 'GET' && syntheticExportRows[table]) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(syntheticExportRows[table]) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/lgpd_access_request_log*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST') {
      const payload = request.postDataJSON() as Record<string, unknown>;
      auditWrites.push({ method: 'POST', payload });
      if (auditMode === 'failure') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Falha sintética de auditoria' }) });
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: requestId, requested_at: requestedAt }),
      });
      return;
    }
    if (request.method() === 'PATCH') {
      auditWrites.push({ method: 'PATCH', payload: request.postDataJSON() as Record<string, unknown> });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: requestId,
          status: 'pending',
          fulfillment_date: null,
          responsavel_id: '00000000-0000-4000-8000-000000000001',
          evidencia: 'Pacote JSON preparado e download iniciado no navegador; escopo e entrega formal ao titular ainda precisam de conferência.',
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/lgpd-pacientes');
  const main = page.locator('#main-content');
  const patient = main.getByText('Pessoa Exemplo QA', { exact: true });
  await expect(patient).toBeVisible();
  // Failure path: audit registration fails; patient data export must stop before
  // any downloadable result can be produced.
  auditMode = 'failure';
  const noDownload = Promise.race([
    page.waitForEvent('download', { timeout: 1000 }).then(() => false).catch(() => true),
  ]);
  await main.getByRole('button', { name: 'Exportar' }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Escopo da exportação' });
  await expect(exportDialog).toBeVisible();
  await exportDialog.getByRole('button', { name: 'Gerar arquivo' }).click();
  expect(await noDownload).toBe(true);
  expect(exportedPatientReads).toEqual(['*']); // only the patient row lookup precedes audit registration
  expect(bulkPatientDataReads).toEqual([]);
  expect(auditWrites.some(write => write.method === 'POST')).toBe(true);

  // A new page uses the success audit stub, proving both the request record
  // and fulfilled state are written before the JSON download is emitted.
  auditMode = 'success';
  await page.goto('/lgpd-pacientes');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#main-content').getByRole('button', { name: 'Exportar' }).click();
  await page.getByRole('dialog', { name: 'Escopo da exportação' }).getByRole('button', { name: 'Gerar arquivo' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^lgpd-export-Pessoa_Exemplo_QA-/);
  const exportPath = testInfo.outputPath('lgpd-export.json');
  await download.saveAs(exportPath);
  const exportJson = JSON.parse(await readFile(exportPath, 'utf8')) as {
    prescricoes: Array<{ id: string }>;
    memed_prescricoes: Array<{ id: string; payload: Record<string, unknown> }>;
    consentimentos_lgpd: Array<{ id: string }>;
    pedidos_laboratorio: Array<{ id: string }>;
    resultados_laboratorio: Array<{ id: string }>;
    whatsapp_messages: Array<{ id: string }>;
    whatsapp_agent_actions: Array<{ id: string }>;
    paciente_portal_tokens: Array<Record<string, unknown>>;
    pagamentos_mercadopago: Array<{ id: string }>;
    lancamento_itens: Array<{ id: string }>;
    pagamentos: Array<{ id: string }>;
    fila_atendimento: Array<{ id: string }>;
  };
  expect(exportJson.prescricoes.some(prescription => prescription.id === '00000000-0000-4000-9000-000000000111')).toBe(true);
  expect(exportJson.memed_prescricoes.some(prescription => prescription.id === 'memed-prescription-qa' && prescription.payload.prescription === 'synthetic')).toBe(true);
  expect(exportJson.consentimentos_lgpd.some(record => record.id === 'consent-qa')).toBe(true);
  expect(exportJson.pedidos_laboratorio.some(record => record.id === 'pedido-lab-qa')).toBe(true);
  expect(exportJson.resultados_laboratorio.some(record => record.id === 'resultado-lab-qa')).toBe(true);
  expect(exportJson.whatsapp_messages.some(record => record.id === 'wa-message-qa')).toBe(true);
  expect(exportJson.whatsapp_agent_actions.some(record => record.id === 'wa-action-qa')).toBe(true);
  expect(exportJson.pagamentos_mercadopago.some(record => record.id === 'payment-qa')).toBe(true);
  expect(exportJson.lancamento_itens.some(record => record.id === 'account-item-qa')).toBe(true);
  expect(exportJson.pagamentos.some(record => record.id === 'payment-register-qa')).toBe(true);
  expect(exportJson.fila_atendimento.some(record => record.id === 'queue-export-qa')).toBe(true);
  expect(exportJson.paciente_portal_tokens[0]).not.toHaveProperty('token');
  for (const table of [
    'consentimentos_lgpd', 'pedidos_laboratorio', 'coletas_laboratorio', 'resultados_laboratorio',
    'prontuario_diagnosticos', 'prontuario_assinaturas', 'prontuario_acessos', 'guias_externas',
    'whatsapp_conversations', 'pagamentos_mercadopago', 'assinaturas_mercadopago', 'interoperability_exports',
    'pagamentos', 'fila_atendimento', 'lancamento_itens',
  ]) expect(exportTableReads.has(table)).toBe(true);
  expect(exportSelects.get('paciente_portal_tokens')?.[0]).not.toContain('token');
  expect(exportSelects.get('pagamentos_mercadopago')?.[0]).not.toMatch(/checkout_url|qr_code|notificacao_webhook|detalhes_pagamento/);
  expect(prescriptionFilters.some(filters => filters.includes('paciente_id.eq.00000000-0000-4000-8000-000000000004'))).toBe(true);
  await expect.poll(() => auditWrites.filter(write => write.method === 'POST').length).toBe(2);
  expect(auditWrites.some(write => write.method === 'POST' && write.payload.paciente_id === '00000000-0000-4000-8000-000000000004'))
    .toBe(true);
  const preparationUpdate = auditWrites.find(write => write.method === 'PATCH')?.payload;
  expect(preparationUpdate?.status).toBeUndefined();
  expect(preparationUpdate?.evidencia).toMatch(/escopo e entrega formal ao titular ainda precisam de conferência/);
  expect(exportedPatientReads.length).toBeGreaterThan(0);
  expect(memedExportCalls.some(call => call.pacienteId === '00000000-0000-4000-8000-000000000004')).toBe(true);

  // A Memed backend failure must also prevent a partial download.
  memedExportMode = 'failure';
  await page.goto('/lgpd-pacientes');
  const failedMemedDownload = Promise.race([
    page.waitForEvent('download', { timeout: 1000 }).then(() => false).catch(() => true),
  ]);
  await page.locator('#main-content').getByRole('button', { name: 'Exportar' }).click();
  await page.getByRole('dialog', { name: 'Escopo da exportação' }).getByRole('button', { name: 'Gerar arquivo' }).click();
  expect(await failedMemedDownload).toBe(true);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('laboratory worklist shows populated samples and supports status filtering on desktop and mobile', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, labPopulated: true });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/laboratorio');
    const main = page.locator('#main-content');
    await main.evaluate(element => { element.scrollTop = 0; });
    await expect(main.getByRole('heading', { name: 'Laboratório', exact: true })).toBeVisible();
    await expect(main.getByText('QA-UR-001', { exact: true })).toBeVisible();
    await expect(main.getByText('QA-UR-002', { exact: true })).toBeVisible();
    await expect(main.getByText('QA-UR-003', { exact: true })).toBeVisible();
    await expect(main.getByRole('tabpanel', { name: 'Worklist' }).getByText('Ana Souza', { exact: true })).toBeVisible();
    await expect(main.getByText('Urgente', { exact: true })).toBeVisible();
    await expect(main.getByRole('tabpanel', { name: 'Worklist' }).getByText('Urgente', { exact: true }).first()).toHaveClass(/bg-warning\/10/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (viewport.width < 768) {
      const tabsFit = await main.getByRole('tablist', { name: 'Seções do laboratório' }).evaluate(element => element.scrollWidth <= element.clientWidth);
      expect(tabsFit, 'as seções do laboratório devem estar visíveis sem rolagem horizontal no celular').toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath(`laboratorio-worklist-${viewport.width}.png`), animations: 'disabled' });

    await main.getByRole('tab', { name: /Pipeline/ }).click();
    await expect(main.getByTestId('lab-pipeline-kpis')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`laboratorio-pipeline-${viewport.width}.png`), animations: 'disabled' });
    await main.getByRole('tab', { name: /Worklist/ }).click();

    const statusFilter = main.getByTestId('lab-worklist-filters').getByRole('button', { name: 'Pendente', exact: true });
    await statusFilter.click();
    await expect(main.getByText('QA-UR-001', { exact: true })).toBeVisible();
    await expect(main.getByText('QA-UR-002', { exact: true })).toHaveCount(0);
    await expect(main.getByText('QA-UR-003', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
});

test('collection map keeps sample identity and actions usable on desktop and mobile', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, labPopulated: true });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/mapa-coleta');
    const main = page.locator('#main-content');
    await main.evaluate(element => { element.scrollTop = 0; });
    await expect(main.getByRole('heading', { name: 'Mapa de Coleta', exact: true })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Situação agora' })).toBeVisible();
    await expect(main.getByText('QA-UR-001', { exact: true }).first()).toBeVisible();
    await expect(main.getByRole('button', { name: 'Coletar agora' })).toBeVisible();
    const situationColumns = await main.locator('section[aria-label="Situação das coletas"] .grid').first()
      .evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(situationColumns).toBe(viewport.width >= 1536 ? 6 : viewport.width >= 768 ? 3 : 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`mapa-coleta-top-${viewport.width}.png`), animations: 'disabled' });

    const pendingRow = main.getByRole('row').filter({ hasText: 'QA-UR-001' });
    await pendingRow.scrollIntoViewIfNeeded();
    await expect(pendingRow.getByRole('button', { name: /Cancelar coleta QA-UR-001/ })).toBeVisible();
    await expect(pendingRow.getByText('Ana Souza').locator('xpath=..')).toHaveClass(/text-warning-foreground/);
    await page.screenshot({ path: testInfo.outputPath(`mapa-coleta-amostra-${viewport.width}.png`), animations: 'disabled' });
    await pendingRow.getByRole('button', { name: 'Ver detalhes da coleta QA-UR-001' }).click();
    await expect(page.getByRole('heading', { name: 'Detalhes da coleta', exact: true })).toBeVisible();
    await expect(page.getByText(/Amostra QA-UR-001 ·/)).toBeVisible();
    await page.getByRole('link', { name: 'Voltar ao mapa de coleta', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('lab reports keep critical results clear and block release before technical validation', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  const coletaId = '00000000-0000-4000-9000-000000000071';
  const coleta = {
    id: coletaId,
    clinica_id: '00000000-0000-4000-8000-000000000002',
    codigo_amostra: 'QA-LAUDO-001',
    status: 'em_analise',
    created_at: '2026-10-29T12:00:00.000Z',
    data_coleta: '2026-10-29T12:15:00.000Z',
    urgente: true,
    tipo_amostra: 'sangue',
    tubo: 'EDTA (Roxo)',
    pacientes: {
      nome: 'Pessoa Exemplo QA', nome_social: null, cpf: '000.000.000-00',
      telefone: '(00) 00000-0000', email: 'paciente.qa@example.test',
      data_nascimento: '1990-05-14', sexo: 'nao_informado',
    },
    medicos: { nome: 'Dra. Marina Ribeiro', crm: '000000' },
    resultados_laboratorio: [{
      id: '00000000-0000-4000-9000-000000000081',
      parametro: 'Hemoglobina', resultado: '13,8', unidade: 'g/dL', critico: true,
      numero_versao: 1, valor_referencia_min: 12, valor_referencia_max: 16,
      valor_referencia_texto: null, liberado: false, data_liberacao: null,
      validado_por: null, data_validacao: null, liberado_por: null,
      metodo: 'Automatizado', equipamento: 'Analisador sintético',
      exames: { tipo_exame: 'Hemograma', laboratorios: { nome: 'Laboratório interno' } },
      confirmacoes: [],
    }],
  };
  await page.route('**/rest/v1/coletas_laboratorio**', async route => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const requestUrl = new URL(route.request().url());
    const detalhe = requestUrl.searchParams.get('id') === `eq.${coletaId}`;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/1' },
      body: JSON.stringify(detalhe ? coleta : [coleta]),
    });
  });

  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/laudos-lab');
    const main = page.locator('#main-content');
    const pageHeading = main.getByRole('heading', { name: 'Laudos Laboratoriais', exact: true });
    await expect(pageHeading).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await main.evaluate(element => { element.scrollTop = 0; });
    await expect(pageHeading).toBeInViewport();
    await expect(main.getByRole('heading', { name: 'Críticos', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(main.locator('[class*="bg-gradient"], [class*="#"]')).toHaveCount(0);
    const reportIndicators = main.getByRole('group', { name: 'Indicadores de laudos' });
    const pendingIndicator = reportIndicators.getByRole('button', { name: /Pendentes/ });
    const totalIndicator = reportIndicators.getByRole('button', { name: /Total/ });
    await expect(pendingIndicator).toHaveAttribute('aria-pressed', 'false');
    await expect(pendingIndicator).not.toHaveClass(/bg-primary/);
    await expect(totalIndicator).toHaveAttribute('aria-pressed', 'true');
    await pendingIndicator.click();
    await expect(pendingIndicator).toHaveAttribute('aria-pressed', 'true');
    await expect(pendingIndicator).toHaveClass(/bg-primary/);
    await totalIndicator.click();
    await expect(totalIndicator).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: testInfo.outputPath(`laudos-lista-${viewport.width}.png`), animations: 'disabled' });

    const reportRow = main.getByRole('row').filter({ hasText: 'QA-LAUDO-001' });
    await reportRow.scrollIntoViewIfNeeded();
    await expect(reportRow.getByRole('button', { name: 'Ver Laudo' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`laudos-linha-${viewport.width}.png`), animations: 'disabled' });
    await reportRow.getByRole('button', { name: 'Ver Laudo' }).click();
    const dialog = page.getByRole('main');
    await expect(dialog.getByRole('heading', { name: /Laudo — QA-LAUDO-001/ })).toBeVisible();
    if (viewport.width < 768) {
      await expect(dialog.getByText('Pessoa Exemplo QA', { exact: true })).toBeVisible();
    }
    await expect(dialog.getByText('Hemoglobina', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Resultado crítico aguardando ciência e conduta.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Liberar', exact: true })).toBeDisabled();
    await expect(dialog.locator('[class*="bg-gradient"], [class*="#"]')).toHaveCount(0);
    const documentedConduct = dialog.getByRole('textbox', { name: 'Conduta documentada pelo profissional responsável' });
    const acknowledgeButton = dialog.getByRole('button', { name: 'Confirmar ciência' });
    await expect(acknowledgeButton).toBeDisabled();
    await documentedConduct.fill('Conduta médica documentada para revisão sintética.');
    await expect(acknowledgeButton).toBeEnabled();
    await documentedConduct.fill('');
    await expect(acknowledgeButton).toBeDisabled();
    const badgeGroupFits = await dialog.getByTestId('laudo-result-badges').evaluate(element => element.scrollWidth <= element.clientWidth);
    expect(badgeGroupFits, 'os estados do resultado precisam caber no detalhe mobile').toBe(true);
    if (viewport.width < 768) {
      const titleBottom = await dialog.getByTestId('laudo-result-title').evaluate(element => element.getBoundingClientRect().bottom);
      const badgesTop = await dialog.getByTestId('laudo-result-badges').evaluate(element => element.getBoundingClientRect().top);
      expect(badgesTop, 'os estados devem ficar abaixo do parâmetro no detalhe mobile').toBeGreaterThanOrEqual(titleBottom - 1);
    }
    await page.screenshot({ path: testInfo.outputPath(`laudos-detalhe-critico-${viewport.width}.png`), animations: 'disabled' });
    await page.getByRole('link', { name: 'Voltar aos laudos' }).click();
    await expect(page).toHaveURL(/\/laudos-lab$/);
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/laudos-lab?coleta=${coletaId}`);
  await expect(page.getByRole('main').getByRole('heading', { name: /Laudo — QA-LAUDO-001/ })).toBeVisible();
  await expect(page).toHaveURL(`/laudos-lab/${coletaId}`);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('lab reports show a useful empty state and recover after a temporary load error', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  let failUntilRetry = true;
  await page.route('**/rest/v1/coletas_laboratorio**', async route => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    if (failUntilRetry) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'synthetic temporary failure' }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/laudos-lab');
  const errorState = page.getByRole('heading', { name: 'Não foi possível carregar os laudos' });
  await expect(errorState).toBeVisible();
  const retryButton = page.getByRole('button', { name: 'Tentar novamente' });
  await expect(retryButton).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('laudos-erro-carregamento-390.png'), animations: 'disabled' });

  failUntilRetry = false;
  await retryButton.click();
  const emptyHeading = page.getByText('Ainda não há laudos registrados', { exact: true });
  await expect(emptyHeading).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ir para Laboratório' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Laudos Laboratoriais', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await emptyHeading.scrollIntoViewIfNeeded();
  await expect(emptyHeading).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('laudos-vazio-390.png'), animations: 'disabled' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('nursing can view critical lab results but cannot document clinical acknowledgement', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role: 'enfermagem' });
  const coletaId = '00000000-0000-4000-9000-000000000091';
  const coleta = {
    id: coletaId,
    clinica_id: '00000000-0000-4000-8000-000000000002',
    codigo_amostra: 'QA-LAUDO-ENF-001',
    status: 'em_analise',
    created_at: '2026-10-29T12:00:00.000Z',
    data_coleta: '2026-10-29T12:15:00.000Z',
    urgente: true,
    tipo_amostra: 'sangue',
    tubo: 'EDTA',
    pacientes: { nome: 'Pessoa Exemplo QA', nome_social: null, cpf: '000.000.000-00', telefone: null, email: null, data_nascimento: '1990-05-14', sexo: 'nao_informado' },
    medicos: { nome: 'Dra. Marina Ribeiro', crm: '000000' },
    resultados_laboratorio: [{
      id: '00000000-0000-4000-9000-000000000092',
      parametro: 'Hemoglobina', resultado: '13,8', unidade: 'g/dL', critico: true,
      numero_versao: 1, valor_referencia_min: 12, valor_referencia_max: 16,
      valor_referencia_texto: null, liberado: false, data_liberacao: null,
      validado_por: null, data_validacao: null, liberado_por: null,
      metodo: 'Automatizado', equipamento: 'Analisador sintético', confirmacoes: [],
      exames: { tipo_exame: 'Hemograma', laboratorios: { nome: 'Laboratório interno' } },
    }],
  };
  await page.route('**/rest/v1/coletas_laboratorio**', async route => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const requestUrl = new URL(route.request().url());
    const detalhe = requestUrl.searchParams.get('id') === `eq.${coletaId}`;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/1' },
      body: JSON.stringify(detalhe ? coleta : [coleta]),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/laudos-lab?coleta=${coletaId}`);
  const dialog = page.getByRole('main');
  await expect(dialog.getByRole('heading', { name: /Laudo — QA-LAUDO-ENF-001/ })).toBeVisible();
  await expect(dialog.getByText('Resultado crítico aguardando ciência e conduta.')).toBeVisible();
  await expect(dialog.getByText('Somente médico ou administrador da clínica pode registrar ciência e conduta.')).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Conduta documentada pelo profissional responsável' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Confirmar ciência' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Liberar', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('laudos-critico-enfermagem-top-390.png'), animations: 'disabled' });
  const permissionNote = dialog.getByText('Somente médico ou administrador da clínica pode registrar ciência e conduta.');
  await permissionNote.scrollIntoViewIfNeeded();
  await expect(permissionNote).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('laudos-critico-enfermagem-390.png'), animations: 'disabled' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('patient search placeholder fits the clinical record sidebar at desktop widths', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/prontuarios');
    const input = page.getByRole('textbox', { name: 'Buscar paciente por nome, CPF, telefone ou e-mail' });
    await expect(input).toHaveAttribute('placeholder', 'Nome, CPF ou telefone');
    const placeholderFits = await input.evaluate(element => {
      const style = getComputedStyle(element);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return false;
      context.font = style.font;
      const available = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return context.measureText(element.placeholder).width <= available;
    });
    expect(placeholderFits).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`prontuario-busca-${viewport.width}.png`), animations: 'disabled' });
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('clinical record displays the selected patient history without overflow on desktop', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, prontuarioPopulated: true });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/prontuarios?paciente=00000000-0000-4000-8000-000000000004');
    const main = page.locator('#main-content');
    await expect(main.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
    await expect(main.getByRole('heading', { name: 'Prontuários', exact: true })).toBeVisible();
    await expect(main.getByText('Pessoa Exemplo QA', { exact: true }).last()).toBeVisible();
    await expect(main.getByText('Cefaleia recorrente há três dias', { exact: true })).toBeVisible();
    await expect(main.getByText('Consulta de acompanhamento', { exact: true })).toBeVisible();
    await expect(main.getByText('Alergia sinalizada na ficha', { exact: true })).toBeVisible();
    await expect(main.getByText('Contexto', { exact: false })).toBeVisible();
    await expect(main.getByText('Alergias', { exact: true })).toHaveCount(0);

    await main.getByRole('button', { name: /Abrir evolução de .*Cefaleia recorrente/ }).click();
    const recordDialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /Prontuário.*Pessoa Exemplo QA/ }) });
    await expect(recordDialog).toBeVisible();
    await expect(recordDialog.getByRole('textbox', { name: 'Queixa principal' })).toHaveValue('Cefaleia recorrente há três dias');
    await recordDialog.getByRole('tab', { name: /Prescri/ }).click();
    await expect(recordDialog.getByRole('textbox', { name: 'Medicamento 1: nome' })).toHaveValue('Paracetamol 750 mg');
    await page.keyboard.press('Escape');
    await expect(recordDialog).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('employee empty and search states provide a consistent next action on desktop', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/equipe?aba=funcionarios');
    const main = page.locator('#main-content');
    test.setTimeout(60_000);
    await expect(main.getByRole('heading', { name: 'Funcionários', exact: true })).toBeVisible({ timeout: 30_000 });
    const emptyState = main.getByRole('status').filter({ hasText: 'Nenhum funcionário cadastrado' });
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText('definir permissões e enviar convites');
    await expect(emptyState.getByRole('button', { name: 'Cadastrar funcionário', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`equipe-funcionarios-vazia-${viewport.width}.png`), animations: 'disabled' });

    const search = main.getByPlaceholder('Buscar por nome ou e-mail...');
    await search.fill('sem resultado qa');
    const noResults = main.getByRole('status').filter({ hasText: 'Nenhum funcionário corresponde aos filtros' });
    await expect(noResults).toBeVisible();
    await expect(noResults.getByRole('button', { name: 'Limpar filtros' })).toBeVisible();
    await noResults.getByRole('button', { name: 'Limpar filtros' }).click();
    await expect(emptyState).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('employee roster distinguishes active and inactive staff and filters by name on desktop', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, employeesPopulated: true });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/equipe?aba=funcionarios');
    const main = page.locator('#main-content');
    const activeRow = main.getByRole('row').filter({ hasText: 'Mariana QA' });
    const inactiveRow = main.getByRole('row').filter({ hasText: 'Rafael QA' });
    await expect(activeRow).toBeVisible();
    await expect(activeRow).toContainText('Ativo');
    await expect(activeRow).toContainText('Recepcionista');
    await expect(inactiveRow).toBeVisible();
    await expect(inactiveRow).toContainText('Inativo');
    await expect(inactiveRow).toContainText('CRM');
    const linkedAccount = inactiveRow.getByRole('status', { name: 'Conta vinculada' });
    await linkedAccount.focus();
    await expect(linkedAccount).toBeFocused();
    await expect(main.getByRole('tooltip').filter({ hasText: 'Conta vinculada' })).toBeVisible();

    await main.getByPlaceholder('Buscar por nome ou e-mail...').fill('Rafael');
    await expect(inactiveRow).toBeVisible();
    await expect(activeRow).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
});

test('doctor specialty filter stays readable at desktop widths', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/medicos');
    const main = page.locator('#main-content');
    const value = main.getByTestId('filter-especialidade-value');
    await expect(value).toHaveText('Todas especialidades');
    const dimensions = await value.evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`corpo-clinico-filtro-especialidade-${viewport.width}.png`), animations: 'disabled' });
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
test(`captures key screens through internal scrolling at ${viewport.width}px`, async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });

    await page.setViewportSize(viewport);
    for (const [name, path] of KEY_SCREENS) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      const main = page.locator('#main-content');
      await expect(main).toBeVisible();
      await expect(main.locator('h1').first()).toBeVisible({ timeout: 30_000 });
      if (path === '/prontuarios') {
        await expect(main.getByRole('heading', { name: 'Prontuários', exact: true })).toBeVisible();
        await expect(main.getByText('Escolha um paciente para começar', { exact: true })).toBeVisible();
        await expect(main.getByPlaceholder('Nome, CPF ou telefone')).toBeVisible();
      }
      if (path === '/medicos') {
        await expect(main.getByRole('heading', { name: 'Corpo Clínico' })).toBeVisible();
        await expect(main.getByRole('button', { name: 'Novo Médico' })).toBeVisible();
        await expect(main.getByPlaceholder('Buscar por nome, CRM, especialidade ou e-mail...')).toBeVisible();
        await expect(main.getByText('Ativos', { exact: true })).toBeVisible();
        await expect(main.getByText('Especialidades', { exact: true })).toBeVisible();
        const filtroEspecialidade = main.getByRole('combobox', { name: 'Filtrar médicos por especialidade' });
        const valorEspecialidade = main.getByTestId('filter-especialidade-value');
        await expect(valorEspecialidade).toHaveText('Todas especialidades');
        const larguraTextoEspecialidade = await valorEspecialidade.evaluate(element => ({
          texto: element.scrollWidth,
          disponivel: element.clientWidth,
        }));
        expect(larguraTextoEspecialidade.texto).toBeLessThanOrEqual(larguraTextoEspecialidade.disponivel);
        await expect(filtroEspecialidade).toBeVisible();
      }
      if (path === '/atestados') {
        await expect(main.getByRole('heading', { name: 'Atestados e Documentos' })).toBeVisible();
        await expect(main.getByText('Assinatura manual', { exact: true })).toBeVisible();
        await expect(main.getByRole('alert')).toContainText('Não há médicos ativos para emitir atestados');
        const issueActions = main.getByRole('button', { name: 'Novo Atestado', exact: true });
        await expect(issueActions).toHaveCount(2);
        await expect(issueActions.nth(0)).toBeDisabled();
        await expect(issueActions.nth(1)).toBeDisabled();
        await expect(main.getByRole('textbox', { name: 'Buscar atestados por nome, CPF ou telefone' })).toBeVisible();
        await expect(main.getByText('Nenhum atestado encontrado')).toBeVisible();
      }
      if (path === '/triagem') {
        await expect(main.getByRole('heading', { name: 'Triagem', exact: true })).toBeVisible();
        await expect(main.getByRole('textbox', { name: 'Buscar triagem por paciente' })).toBeVisible();
        await expect(main.getByText('Protocolo Manchester')).toBeVisible();
      }
      if (path === '/retornos') {
        await expect(main.getByRole('heading', { name: 'Controle de Retornos' })).toBeVisible();
        await expect(main.getByRole('textbox', { name: /Buscar retornos por paciente/ })).toBeVisible();
        await expect(main.getByRole('combobox', { name: 'Filtrar retornos por status' })).toBeVisible();
      }
      if (path === '/exames') {
        await expect(main.getByRole('heading', { name: 'Ainda não há solicitações de exames' })).toBeVisible();
        await expect(main.getByRole('button', { name: 'Nova guia de exames', exact: true })).toBeVisible();
        const columns = await main.getByTestId('exam-status-kpis').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
        expect(columns).toBe(5);
      }
      if (path === '/convenios') {
        await expect(main.getByRole('heading', { name: 'Convênios', exact: true })).toBeVisible();
        await expect(main.getByRole('button', { name: 'Novo Convênio' })).toBeVisible();
      }
      if (path === '/gestao-fluxo?tab=espera') {
        await expect(main.getByRole('heading', { name: 'Lista de Espera' })).toBeVisible();
        await expect(main.getByRole('button', { name: 'Adicionar à Lista' }).first()).toBeVisible();
      }
      if (path === '/cobranca-inadimplentes') {
        await expect(main.getByRole('heading', { name: 'Cobrança de inadimplentes' })).toBeVisible();
        await expect(main.getByRole('button', { name: 'Abrir contas a receber' })).toBeVisible();
      }
      if (path === '/fila') {
        await expect(main.getByRole('heading', { name: 'Fila vazia' })).toBeVisible();
        await expect(main.locator('header').getByRole('button', { name: 'Adicionar à fila', exact: true })).toBeVisible();
        await expect(main.getByRole('status').getByRole('button', { name: 'Adicionar à fila', exact: true })).toBeVisible();
      }
      if (path === '/recepcao?tab=caixa') {
        await expect(main.getByRole('heading', { name: 'Caixa e fluxo de caixa', exact: true })).toBeVisible();
        await expect(main.getByText('Caixa não aberto hoje', { exact: true })).toBeVisible();
      }
      if (path === '/contas?tab=receber') {
        await expect(main.getByRole('heading', { name: 'Receita por Categoria' })).toBeVisible();
        await expect(main.getByRole('status').getByText('Nenhuma receita ativa nas contas filtradas')).toBeVisible();
        await expect(main.getByRole('status').getByText('Nenhum recebimento nas contas filtradas')).toBeVisible();
        await expect(main.getByText('Registre a baixa de uma conta ou ajuste os filtros acima.')).toBeVisible();
      }
      if (path === '/fluxo-caixa') {
        await expect(main.getByRole('heading', { name: 'Fluxo de Caixa' })).toBeVisible();
        const emptyCharts = main.getByRole('status').filter({ hasText: 'Nenhuma movimentação registrada neste mês' });
        await expect(emptyCharts).toHaveCount(1);
        await expect(emptyCharts.first()).toContainText('A evolução diária, o saldo acumulado e as categorias aparecerão quando houver entradas, saídas, suprimentos ou sangrias.');
        await expect(main.getByRole('heading', { name: 'Evolução Diária' })).toHaveCount(0);
        await expect(main.getByRole('heading', { name: 'Saldo Acumulado' })).toHaveCount(0);
        await expect(main.getByRole('heading', { name: 'Por Categoria' })).toHaveCount(0);
        const month = main.getByText(/de \d{4}/).first();
        await expect(month).toBeVisible();
        await main.getByRole('button', { name: 'Próximo mês' }).click();
        await expect(month).not.toHaveText(/outubro de 2026/i);
        await main.getByRole('button', { name: 'Mês anterior' }).click();
        await expect(month).toHaveText(/outubro de 2026/i);
      }
      if (path === '/financeiro') {
        await expect(main.getByRole('heading', { name: 'Painel Financeiro' })).toBeVisible();
        await main.getByRole('button', { name: 'Próximo mês' }).click();
        await main.getByRole('button', { name: 'Mês anterior' }).click();
        await expect(main.getByText(/outubro 2026/i).first()).toBeVisible();
      }
      if (path === '/analytics') {
        await expect(main.getByRole('heading', { name: 'Ainda não há dados neste período' })).toBeVisible();
      }
      if (path === '/agenda') {
        const search = main.getByRole('textbox', { name: 'Buscar paciente, CPF ou telefone' });
        await expect(search).toBeVisible();
        if (viewport.width === 1280) {
          const box = await search.boundingBox();
          expect(box?.width ?? 0).toBeGreaterThanOrEqual(240);
        }
        await main.getByRole('button', { name: 'Visualização semanal' }).click();
        const weekly = main.getByRole('region', { name: 'Agenda semanal, deslize horizontal para ver os dias' });
        await expect(weekly).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`agenda-weekly-${viewport.width}.png`), animations: 'disabled' });
        await main.getByRole('button', { name: 'Visualização mensal' }).click();
        const monthly = main.getByRole('region', { name: 'Agenda mensal, deslize horizontal para ver a grade' });
        await expect(monthly).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`agenda-monthly-${viewport.width}.png`), animations: 'disabled' });
        await main.getByRole('button', { name: 'Visualização diária' }).click();
      }
      if (path === '/pacientes') {
        const patientRow = main.getByRole('row').filter({ hasText: 'Pessoa Exemplo QA' });
        const cells = patientRow.getByRole('cell');
        await expect(patientRow).toBeVisible();
        await expect(cells.nth(1)).toHaveCSS('white-space', 'nowrap');
        await expect(cells.nth(4)).toHaveCSS('white-space', 'nowrap');
        await expect(cells.nth(4)).toContainText('36 anos');
        await expect(cells.nth(5).getByRole('button', { name: 'Ver detalhes de Pessoa Exemplo QA' })).toBeVisible();
      }
      if (path === '/recepcao') {
        await expect(main.getByRole('heading', { name: 'Painel de Recepção' })).toBeVisible();
        const caixaKpi = main.getByRole('button', { name: /Recebido/ });
        const explicacaoCaixa = caixaKpi.getByText(/Pagamentos menos estornos de hoje/);
        await expect(explicacaoCaixa).toBeVisible();
        await expect(explicacaoCaixa).toHaveCSS('-webkit-line-clamp', 'none');
        const descricaoRecepcao = await main.getByText(/Fluxo completo do paciente/).textContent();
        const dataRecepcao = descricaoRecepcao?.split(' · ')[0] ?? '';
        expect(dataRecepcao).toBe(dataRecepcao.toLocaleLowerCase('pt-BR'));
        await expect(main.getByText('Sem adicional em aberto', { exact: true })).toBeVisible();
        const emptyReception = main.getByRole('status');
        await expect(emptyReception.getByRole('heading', { name: 'Nenhum paciente agendado para hoje' })).toBeVisible();
        await expect(emptyReception.getByRole('button')).toHaveCount(0);
        const createWalkIn = main.getByRole('button', { name: 'Encaixe sem agendamento' });
        await expect(createWalkIn).toBeVisible();
        await createWalkIn.click();
        await expect(page.getByRole('dialog').getByRole('heading', { name: 'Encaixe sem agendamento' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).not.toBeVisible();
        await expect(createWalkIn).toBeFocused();
      }
      if (path === '/financeiro') {
        const operationalMargin = main.getByText('Margem operacional', { exact: true }).locator('xpath=../..');
        await expect(operationalMargin).toContainText('—');
        await expect(main.getByText('0,0%', { exact: true })).toHaveCount(0);
      }
      if (path === '/laboratorio') {
        const chatButton = page.getByRole('button', { name: /Abrir chat interno/ });
        await expect(chatButton).toBeVisible();
        await expect(chatButton.locator('svg')).toBeVisible();
        await expect(chatButton.locator('svg')).toHaveCSS('opacity', '1');
        await expect(main.getByRole('heading', { name: 'Laboratório', exact: true })).toBeVisible();
        await expect(main.locator('header').getByRole('button', { name: 'Nova coleta', exact: true })).toBeVisible();
        await expect(main.getByText(/Nenhuma coleta/).first()).toBeVisible();
        await expect(main.getByRole('button', { name: /Ver todos os períodos|Nova coleta|Carregar mais registros/ }).first()).toBeVisible();
        await expect(main.getByTestId('lab-worklist-filters')).toBeVisible();
        await main.getByRole('tab', { name: /Pipeline/ }).click();
        await expect(main.getByTestId('lab-pipeline-kpis')).toBeVisible();
        await expect(main.getByText('Nenhuma amostra no fluxo hoje', { exact: true })).toBeVisible();
        await expect(main.getByRole('button', { name: 'Registrar coleta', exact: true })).toBeVisible();
        await expect(main.getByText('Visão Kanban do fluxo laboratorial de hoje')).not.toBeVisible();
        const columns = await main.getByTestId('lab-pipeline-kpis').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
        expect(columns).toBe(6);
        const kpis = main.getByTestId('lab-pipeline-kpis');
        const worklistTab = main.getByRole('tab', { name: /Worklist/ });
        const pendingKpi = kpis.getByRole('button', { name: /Pendente/ });
        await pendingKpi.focus();
        await pendingKpi.press('Enter');
        await expect(worklistTab).toHaveAttribute('data-state', 'active');
        await expect(worklistTab).toBeFocused();
        await expect(main.getByTestId('lab-worklist-filters').getByRole('button', { name: 'Pendente', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await main.getByRole('tab', { name: /Pipeline/ }).click();
        await main.getByTestId('lab-pipeline-kpis').getByRole('button', { name: /Pendente/ }).click();
        await expect(main.getByRole('tab', { name: /Worklist/ })).toHaveAttribute('data-state', 'active');
      }
      if (path === '/tarefas') {
        await expect(main.getByRole('heading', { name: 'Ainda não há tarefas cadastradas' })).toBeVisible();
        await expect(main.getByRole('button', { name: 'Nova tarefa', exact: true })).toBeVisible();
      }
      if (path === '/equipe?aba=funcionarios') {
        await expect(main.getByRole('heading', { name: 'Funcionários', exact: true })).toBeVisible();
        await expect(main.getByRole('button', { name: 'Convidar por e-mail' })).toBeVisible();
        await expect(main.getByRole('button', { name: 'Personalizar perfis' })).toBeVisible();
        const addEmployee = main.getByRole('button', { name: 'Novo Funcionário' });
        await expect(addEmployee).toBeVisible();
        await addEmployee.click();
        await expect(page.getByRole('dialog').getByRole('heading', { name: 'Novo Funcionário' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).not.toBeVisible();
      }
      if (path === '/gestao-fluxo') {
        await expect(main.getByRole('heading', { name: 'Salas e Leitos', exact: true })).toBeVisible();
        await expect(main.getByRole('button', { name: 'Nova Sala / Leito', exact: true })).toHaveCount(1);
        const addRoom = main.getByRole('button', { name: 'Nova Sala / Leito', exact: true }).first();
        await expect(addRoom).toBeVisible();
        await addRoom.click();
        await expect(page.getByRole('heading', { name: 'Nova Sala', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Voltar às salas e leitos' }).click();
        await expect(page.getByRole('dialog')).not.toBeVisible();
      }
      if (path === '/precos-servicos?tab=tipos') {
        await expect(main.getByRole('heading', { name: 'Tipos & Preços de Consulta', exact: true })).toBeVisible();
        const addType = main.getByRole('button', { name: 'Novo Tipo', exact: false });
        await expect(addType).toHaveCount(1);
        await expect(addType).toBeVisible();
        await addType.click();
        await expect(page.getByRole('heading', { name: 'Novo Tipo de Consulta', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Voltar aos tipos de consulta' }).click();
        await expect(page.getByRole('dialog')).not.toBeVisible();
      }

      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width, `${path} overflowed at ${viewport.width}px`).toBeLessThanOrEqual(viewport.width + 1);
      const scroll = await main.evaluate(element => ({
        clientHeight: element.clientHeight,
        maxScrollTop: Math.max(0, element.scrollHeight - element.clientHeight),
      }));
      const positions = [0];
      for (let top = scroll.clientHeight; top < scroll.maxScrollTop; top += scroll.clientHeight) {
        positions.push(top);
      }
      if (scroll.maxScrollTop > 0 && positions.at(-1) !== scroll.maxScrollTop) positions.push(scroll.maxScrollTop);

      for (const [segment, top] of positions.entries()) {
        await main.evaluate((element, scrollTop) => { element.scrollTop = scrollTop; }, top);
        await page.screenshot({
          path: testInfo.outputPath(segment === 0
            ? `${name}-${viewport.width}.png`
            : `${name}-${viewport.width}-scroll-${segment + 1}.png`),
          fullPage: false,
          animations: 'disabled',
        });
      }
      if (path === '/laboratorio') {
        await main.getByRole('tab', { name: /Pipeline/ }).click();
        await expect(main.getByTestId('lab-pipeline-kpis')).toBeVisible();
        await page.screenshot({
          path: testInfo.outputPath(`laboratorio-pipeline-${viewport.width}.png`),
          fullPage: false,
          animations: 'disabled',
        });
      }
      if (path === '/gestao-fluxo') {
        await main.getByRole('tab', { name: 'Lista de Espera' }).click();
        await expect(main.getByRole('heading', { name: 'Lista de Espera' })).toBeVisible();
        await expect(main.getByText('Nenhum paciente na lista de espera')).toBeVisible();
        await expect(main.getByRole('button', { name: 'Adicionar à Lista', exact: true })).toHaveCount(1);
        await page.screenshot({
          path: testInfo.outputPath(`espera-lista-${viewport.width}.png`),
          fullPage: false,
          animations: 'disabled',
        });
      }
      await main.evaluate(element => { element.scrollTop = 0; });
    }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
}

test('room workspace preserves occupancy safety and readable status filters', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false, role: 'recepcao' });
  const roomRows = [
    {
      id: '00000000-0000-4000-9000-000000000201', clinica_id: '00000000-0000-4000-8000-000000000002',
      nome: 'Consultório A', tipo: 'consultorio', capacidade: 1, status: 'disponivel', equipamentos: ['Maca'],
      medico_responsavel: null, setor: 'Clínica geral', andar: 'Térreo', horario_inicio: '07:00:00', horario_fim: '19:00:00',
      cor: '#1456C0', updated_at: new Date().toISOString(),
    },
    {
      id: '00000000-0000-4000-9000-000000000202', clinica_id: '00000000-0000-4000-8000-000000000002',
      nome: 'Consultório B', tipo: 'consultorio', capacidade: 1, status: 'ocupado', equipamentos: [],
      medico_responsavel: null, setor: 'Clínica geral', andar: 'Térreo', horario_inicio: '07:00:00', horario_fim: '19:00:00',
      cor: '#0B2346', updated_at: new Date().toISOString(),
    },
    {
      id: '00000000-0000-4000-9000-000000000203', clinica_id: '00000000-0000-4000-8000-000000000002',
      nome: 'Sala de Exames', tipo: 'exame', capacidade: 2, status: 'disponivel', equipamentos: ['Ultrassom'],
      medico_responsavel: null, setor: 'Imagem', andar: '1º andar', horario_inicio: '07:00:00', horario_fim: '19:00:00',
      cor: '#8b5cf6', updated_at: new Date().toISOString(),
    },
  ];
  const roomQueue = [
    {
      id: '00000000-0000-4000-9000-000000000211', sala_id: roomRows[1].id, status: 'em_atendimento', agendamento_id: 'appointment-room-1',
      agendamentos: { id: 'appointment-room-1', data: new Date().toISOString().slice(0, 10), pacientes: { id: 'patient-room-1', nome: 'Ana Souza' }, medicos: { id: 'doctor-room-1', nome: 'Marina Ribeiro', crm: '000001', especialidade: 'Clínica geral' } },
    },
    {
      id: '00000000-0000-4000-9000-000000000212', sala_id: roomRows[2].id, status: 'chamado', agendamento_id: 'appointment-room-2',
      agendamentos: { id: 'appointment-room-2', data: new Date().toISOString().slice(0, 10), pacientes: { id: 'patient-room-2', nome: 'Bruno Almeida' }, medicos: { id: 'doctor-room-2', nome: 'Marina Ribeiro', crm: '000001', especialidade: 'Clínica geral' } },
    },
  ];
  let occupancyUnavailable = false;
  let roomLoadReleased = false;
  let releaseRoomLoad: (() => void) | undefined;
  const roomLoadGate = new Promise<void>(resolve => { releaseRoomLoad = resolve; });
  await page.route('**/rest/v1/salas*', route => route.request().method() === 'GET'
    ? (async () => {
      if (!roomLoadReleased) await roomLoadGate;
      const recordId = new URL(route.request().url()).searchParams.get('id');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(recordId ? roomRows.filter(room => `eq.${room.id}` === recordId) : roomRows) });
    })()
    : route.fallback());
  await page.route('**/rest/v1/fila_atendimento*', route => {
    if (route.request().method() !== 'GET') return route.fallback();
    return occupancyUnavailable
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'synthetic occupancy read failure' }) })
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(roomQueue) });
  });

  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/gestao-fluxo?origem=qa');
    const main = page.locator('#main-content');
    if (viewport.width === 1280) {
      await main.getByRole('tab', { name: 'Salas' }).waitFor();
      const loadingWorkspace = main.getByRole('status', { name: 'Carregando salas' });
      await expect(loadingWorkspace).toBeVisible();
      await expect(loadingWorkspace).toContainText('Carregando salas…');
      await expect(loadingWorkspace.locator('.animate-pulse').first()).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('room-workspace-loading-1280.png'), animations: 'disabled' });
      roomLoadReleased = true;
      releaseRoomLoad?.();
    }
    const statuses = main.getByRole('group', { name: 'Situação das salas' });
    const occupiedLabel = statuses.getByRole('heading', { name: 'Em atendimento' });
    await expect(occupiedLabel).toBeVisible();
    expect(await occupiedLabel.evaluate(element => element.scrollWidth <= element.clientWidth), 'o filtro operacional não deve truncar seu rótulo').toBe(true);
    await expect(statuses.getByText('com paciente agora')).toBeVisible();

    const occupiedRoom = main.getByTestId('room-card-00000000-0000-4000-9000-000000000202');
    const reservedRoom = main.getByTestId('room-card-00000000-0000-4000-9000-000000000203');
    await expect(occupiedRoom).toContainText('Ana Souza');
    await expect(occupiedRoom).toContainText('Em atendimento');
    await expect(occupiedRoom.getByRole('link', { name: 'Ver Consultório B na fila de atendimento' })).toBeVisible();
    await expect(occupiedRoom.getByRole('button', { name: 'Liberar' })).toHaveCount(0);
    await expect(reservedRoom).toContainText('Bruno Almeida');
    await expect(reservedRoom).toContainText('Reservada');
    if (viewport.width === 1280) {
      await main.getByRole('button', { name: 'Nova Sala / Leito' }).click();
      const colorPicker = page.getByRole('group', { name: 'Cor de Identificação' });
      await expect(colorPicker.getByRole('button')).toHaveCount(4);
      await expect(colorPicker.getByRole('button', { name: /roxo/i })).toHaveCount(0);
      await expect(colorPicker.getByRole('button', { name: 'Selecionar cor Azul primário' })).toHaveAttribute('aria-pressed', 'true');
      const cyan = colorPicker.getByRole('button', { name: 'Selecionar cor Ciano' });
      await cyan.click();
      await expect(cyan).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: 'Voltar às salas e leitos' }).click();
      await page.getByRole('button', { name: 'Descartar e sair' }).click();

      await main.getByTestId('room-card-00000000-0000-4000-9000-000000000203').getByRole('button', { name: 'Editar sala Sala de Exames' }).click();
      const savedColorPicker = page.getByRole('group', { name: 'Cor de Identificação' });
      await expect(savedColorPicker.getByText('Cor salva')).toBeVisible();
      await expect(savedColorPicker.getByRole('button')).toHaveCount(4);
      await page.getByRole('button', { name: 'Voltar às salas e leitos' }).click();
    }
    if (viewport.width < 500) {
      const search = main.getByRole('textbox', { name: 'Buscar salas, leitos ou equipamentos' });
      const navigation = page.getByRole('navigation', { name: 'Navegação principal' });
      const [searchBounds, navigationBounds] = await Promise.all([search.boundingBox(), navigation.boundingBox()]);
      expect(searchBounds).not.toBeNull();
      expect(navigationBounds).not.toBeNull();
      expect(searchBounds!.y + searchBounds!.height).toBeLessThanOrEqual(navigationBounds!.y);
    }
    await page.screenshot({ path: testInfo.outputPath(`room-workspace-${viewport.width}.png`), animations: 'disabled' });

    await main.getByRole('tab', { name: 'Lista de Espera' }).click();
    await expect(page).toHaveURL(/origem=qa.*tab=espera|tab=espera.*origem=qa/);
    await expect(main.getByText('Nenhum paciente na lista de espera', { exact: true })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Adicionar à Lista', exact: true })).toHaveCount(1);
    if (viewport.width < 500) {
      const waitingSummary = main.getByRole('group', { name: 'Resumo da lista de espera' });
      for (const label of ['aguardando resposta', 'prontos para agendar']) {
        const caption = waitingSummary.getByText(label, { exact: true });
        expect(await caption.evaluate(element => element.scrollWidth <= element.clientWidth), `o resumo não deve truncar “${label}”`).toBe(true);
      }
    }
    await page.screenshot({ path: testInfo.outputPath(`room-waitlist-${viewport.width}.png`), animations: 'disabled' });
    await main.getByRole('tab', { name: 'Salas' }).click();
    await expect(page).toHaveURL(/origem=qa(?:&|$)/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  const main = page.locator('#main-content');
  occupancyUnavailable = true;
  await main.getByRole('button', { name: 'Atualizar salas' }).click();
  const occupancyError = main.getByRole('alert').filter({ hasText: 'Não foi possível confirmar a ocupação das salas' });
  await expect(occupancyError).toBeVisible();
  await expect(page.getByText('Não conseguimos carregar estas informações agora. Tente novamente em instantes.')).toHaveCount(0);
  await expect(main.getByTestId('room-card-00000000-0000-4000-9000-000000000202')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('room-workspace-occupancy-error.png'), animations: 'disabled' });
  occupancyUnavailable = false;
  await occupancyError.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(main.getByTestId('room-card-00000000-0000-4000-9000-000000000202')).toBeVisible();

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('room workspace remains restricted to roles allowed by the route', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false, role: 'financeiro' });
  await page.goto('/gestao-fluxo');
  await expect(page.getByRole('heading', { name: 'Acesso Negado' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Salas e Leitos', exact: true })).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('retornos over 30 days keep a clear warning without a heavy side stripe', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, retornosPopulated: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/retornos');

  const main = page.locator('#main-content');
  const overdueRow = main.getByRole('row').filter({ hasText: 'Pessoa Exemplo QA' });
  await expect(overdueRow).toBeVisible();
  await expect(overdueRow).toContainText(/4\d dia\(s\) de atraso/);
  await expect(overdueRow).toHaveClass(/bg-destructive\/10/);
  await expect(overdueRow).toHaveCSS('border-left-width', '0px');
  await expect(overdueRow).toHaveCSS('opacity', '1');
  const overdueKpi = main.getByTestId('return-kpi-atrasado');
  const overdueValue = main.getByTestId('return-kpi-value-atrasado');
  await expect(overdueValue).toHaveText('1');
  await expect(overdueValue).toHaveClass(/text-destructive/);
  await expect(overdueKpi).toHaveAttribute('aria-pressed', 'false');
  const pendingKpi = main.getByTestId('return-kpi-pendente');
  await expect(main.getByTestId('return-kpi-value-pendente')).toHaveText('0');
  await expect(main.getByTestId('return-kpi-value-pendente')).toHaveClass(/text-muted-foreground/);
  await pendingKpi.focus();
  await pendingKpi.press('Enter');
  await expect(pendingKpi).toHaveAttribute('aria-pressed', 'true');
  await overdueKpi.click();
  await expect(overdueKpi).toHaveAttribute('aria-pressed', 'true');
  await expect(overdueRow).toBeVisible();
  const fullReason = 'Retorno para reavaliar a resposta ao tratamento inicial e a persistência da dor, revisar os efeitos relatados pela pessoa e definir os próximos passos do acompanhamento clínico.';
  const reason = overdueRow.locator('td').nth(3).locator('span');
  await expect(reason).toHaveText(fullReason);
  await expect(reason).toHaveAttribute('title', fullReason);
  await expect(reason).toHaveClass(/line-clamp-2/);
  for (const width of [768, 1280, 1440]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width === 1280) {
      const floatingChat = page.getByRole('button', { name: /Abrir chat interno/ });
      const contactAction = overdueRow.getByRole('link', { name: 'Contatar via WhatsApp' });
      const chatBox = await floatingChat.boundingBox();
      const contactBox = await contactAction.boundingBox();
      expect(chatBox).not.toBeNull();
      expect(contactBox).not.toBeNull();
      const overlaps = contactBox!.x < chatBox!.x + chatBox!.width && contactBox!.x + contactBox!.width > chatBox!.x && contactBox!.y < chatBox!.y + chatBox!.height && contactBox!.y + contactBox!.height > chatBox!.y;
      expect(overlaps).toBe(false);
    }
    await page.screenshot({ path: testInfo.outputPath(`retornos-overdue-${width}.png`), animations: 'disabled' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('#main-content').getByRole('heading', { name: 'Controle de Retornos' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('retornos-overdue-mobile-after.png'), animations: 'disabled' });
  await page.locator('#main-content').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.screenshot({ path: testInfo.outputPath('retornos-list-mobile-after.png'), animations: 'disabled' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.every(write => write.includes(' POST /rest/v1/rpc/'))).toBe(true);
});

test('return control shows loading until an empty result is confirmed', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>(resolve => { releaseResponse = resolve; });
  await page.route('**/rest/v1/retornos**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await responseGate;
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/0' }, body: '[]' });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/retornos');
  const main = page.locator('#main-content');
  await expect(main.locator('.animate-pulse').first()).toBeVisible();
  releaseResponse();
  await expect(main.getByText('Ainda não há retornos cadastrados')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('retornos-empty-desktop-after.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await main.getByRole('heading', { name: 'Controle de Retornos' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('retornos-empty-mobile-after.png'), fullPage: true });
  await main.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.screenshot({ path: testInfo.outputPath('retornos-empty-mobile-end-after.png'), fullPage: true });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('médico vê primeiro seus próprios retornos e pode ampliar o escopo', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'medico', retornosPopulated: true });
  await page.goto('/retornos');
  const main = page.locator('#main-content');
  const ownReturns = main.getByRole('switch', { name: 'Mostrar só meus retornos' });
  await expect(ownReturns).toBeVisible();
  await expect(ownReturns).toBeChecked();
  await expect(main.getByRole('table').getByText('Pessoa Exemplo QA', { exact: true })).toBeVisible();
  await ownReturns.uncheck();
  await expect(ownReturns).not.toBeChecked();
  await expect(main.getByRole('table').getByText('Pessoa Exemplo QA', { exact: true })).toBeVisible();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('triage role can open the dedicated clinical form page', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role: 'enfermagem' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/triagem');

  const main = page.locator('#main-content');
  await expect(main.getByRole('heading', { name: 'Triagem', exact: true })).toBeVisible();
  const newTriage = main.getByRole('button', { name: 'Nova Triagem' });
  await expect(newTriage).toBeVisible();
  await newTriage.click();

  await expect(page).toHaveURL('/triagem/nova?origem=triagem');
  await expect(main.getByRole('heading', { name: 'Nova triagem' })).toBeVisible();
  await expect(main.getByText('Classifique o risco e registre os sinais vitais do paciente.')).toBeVisible();
  await expect(main.locator('#triagem-paciente')).toBeVisible();
  await expect(main.locator('#triagem-agendamento')).toBeVisible();
  await expect(main.locator('#triagem-queixa')).toBeVisible();
  await expect(main.getByRole('button', { name: 'Registrar triagem' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await main.locator('#triagem-queixa').fill('Rascunho clínico sintético.');
  await main.getByRole('link', { name: 'Voltar à fila' }).click();
  const leaveGuard = page.getByRole('alertdialog');
  await expect(leaveGuard.getByRole('heading', { name: 'Sair sem salvar?' })).toBeVisible();
  await leaveGuard.getByRole('button', { name: 'Continuar nesta página' }).click();
  await expect(main.locator('#triagem-queixa')).toHaveValue('Rascunho clínico sintético.');

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.every(write => write.includes(' POST /rest/v1/rpc/'))).toBe(true);
});

test('queue check-in opens its own page and keeps the check-in validation visible', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role: 'recepcao', queuePopulated: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/fila');

  const main = page.locator('#main-content');
  await expect(main.getByRole('heading', { name: 'Fila de Atendimento' })).toBeVisible();
  await main.getByRole('button', { name: 'Adicionar à fila' }).click();

  await expect(page).toHaveURL('/fila/adicionar');
  await expect(main.getByRole('heading', { name: 'Adicionar à fila' })).toBeVisible();
  await expect(main.getByLabel('Agendamento')).toBeVisible();
  await expect(main.getByLabel('Prioridade')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('fila-checkin-page-desktop.png'), fullPage: true, animations: 'disabled' });
  await expect(main.getByRole('button', { name: 'Adicionar paciente à fila' })).toBeDisabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await main.getByLabel('Agendamento').click();
  await page.getByRole('option', { name: /Diego Santos.*09:30/ }).click();
  await expect(main.getByRole('list', { name: 'Validação do check-in' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Adicionar paciente à fila' })).toBeEnabled();

  await main.getByRole('button', { name: 'Voltar para a fila' }).click();
  const discardGuard = page.getByRole('alertdialog');
  await expect(discardGuard.getByRole('heading', { name: 'Sair sem salvar?' })).toBeVisible();
  await discardGuard.getByRole('button', { name: 'Descartar e sair' }).click();
  await expect(page).toHaveURL('/fila');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('doctor can complete check-in from the dedicated queue page', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role: 'medico', queuePopulated: true });
  let checkinPayload: Record<string, unknown> | undefined;
  await page.route('**/rest/v1/rpc/realizar_checkin*', async route => {
    checkinPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ fila_id: 'synthetic-checkin', status_anterior: 'confirmado' }) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/fila/adicionar');

  const main = page.locator('#main-content');
  await expect(main.getByRole('heading', { name: 'Adicionar à fila' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('fila-checkin-page-mobile.png'), fullPage: true, animations: 'disabled' });
  await main.getByLabel('Agendamento').click();
  await page.getByRole('option', { name: /Diego Santos.*09:30/ }).click();
  await main.getByLabel('Prioridade').click();
  await page.getByRole('option', { name: 'Urgente' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await main.evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath('fila-checkin-page-mobile-selected.png'), fullPage: true, animations: 'disabled' });
  await main.getByRole('button', { name: 'Adicionar paciente à fila' }).click();

  await expect(page).toHaveURL('/fila');
  await expect(page.getByText('Paciente adicionado à fila!')).toBeVisible();
  expect(checkinPayload).toMatchObject({ p_agendamento_id: '00000000-0000-4000-9000-000000000013', p_prioridade: 'urgente' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('reception walk-in check-in opens a dedicated protected form', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role: 'recepcao', receptionPopulated: true });
  await page.route('**/rest/v1/tipos_consulta*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ id: 'synthetic-consulta', nome: 'Consulta geral', valor_particular: 180, duracao_minutos: 30, ativo: true }]),
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/recepcao');

  const main = page.locator('#main-content');
  await expect(main.getByRole('heading', { name: 'Painel de Recepção' })).toBeVisible();
  await main.getByRole('button', { name: 'Encaixe sem agendamento' }).click();
  await expect(page).toHaveURL('/recepcao/encaixe');
  await expect(main.getByRole('heading', { name: 'Encaixe sem agendamento' })).toBeVisible();
  await expect(main.getByLabel('Paciente')).toBeVisible();
  await expect(main.getByRole('combobox', { name: 'Médico' })).toBeVisible();
  await expect(main.getByRole('combobox', { name: 'Tipo de consulta' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Criar e fazer check-in' })).toBeDisabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('recepcao-walk-in-page-mobile.png'), fullPage: true, animations: 'disabled' });

  await main.getByLabel('Paciente').click();
  await page.getByPlaceholder('Buscar paciente...').fill('Pessoa Exemplo');
  await page.getByRole('option', { name: /Pessoa Exemplo QA/ }).click();
  await main.getByRole('button', { name: 'Voltar para a recepção' }).click();
  const discardGuard = page.getByRole('alertdialog');
  await expect(discardGuard.getByRole('heading', { name: 'Sair sem salvar?' })).toBeVisible();
  await discardGuard.getByRole('button', { name: 'Descartar e sair' }).click();
  await expect(page).toHaveURL('/recepcao');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('reception completes walk-in creation and check-in without a modal', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role: 'recepcao', receptionPopulated: true });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  let appointmentPayload: Record<string, unknown> | undefined;
  let checkinPayload: Record<string, unknown> | undefined;

  await page.route('**/rest/v1/tipos_consulta*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ id: 'synthetic-consulta', nome: 'Consulta geral', valor_particular: 180, duracao_minutos: 30, ativo: true }]),
  }));
  await page.route('**/rest/v1/agendamentos*', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST') {
      appointmentPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'synthetic-walk-in', clinica_id: '00000000-0000-4000-8000-000000000002', paciente_id: '00000000-0000-4000-8000-000000000004', medico_id: '00000000-0000-4000-8000-000000000003', tipo: 'Consulta geral', data: today, hora_inicio: '12:00:00', hora_fim: '12:30:00', status: 'agendado' }),
      });
      return;
    }
    if (route.request().method() === 'GET' && url.searchParams.get('select') === 'id,hora_inicio,hora_fim,status') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.fallback();
  });
  await page.route('**/rest/v1/rpc/realizar_checkin*', async route => {
    checkinPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ fila_id: 'synthetic-fila' }) });
  });
  await page.route('**/rest/v1/rpc/criar_cobranca_checkin_atomica*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify('created') }));
  await page.route('**/rest/v1/rpc/confirmar_estado_cobranca_checkin*', route => route.fulfill({ status: 200, contentType: 'application/json', body: 'true' }));

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/recepcao/encaixe');
  const main = page.locator('#main-content');
  await expect(main.getByRole('heading', { name: 'Encaixe sem agendamento' })).toBeVisible();
  await main.getByLabel('Paciente').click();
  await page.getByPlaceholder('Buscar paciente...').fill('Pessoa Exemplo');
  await page.getByRole('option', { name: /Pessoa Exemplo QA/ }).click();
  await main.getByRole('combobox', { name: 'Médico' }).click();
  await page.getByRole('option', { name: 'Dra. Marina Ribeiro' }).click();
  await main.getByRole('combobox', { name: 'Tipo de consulta' }).click();
  await page.getByRole('option', { name: /Consulta geral/ }).click();
  await expect(main.getByRole('button', { name: 'Criar e fazer check-in' })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('recepcao-walk-in-page-desktop-ready.png'), fullPage: true, animations: 'disabled' });
  await main.getByRole('button', { name: 'Criar e fazer check-in' }).click();

  await expect(page).toHaveURL('/recepcao');
  await expect(page.getByText('Check-in realizado!')).toBeVisible();
  expect(appointmentPayload).toMatchObject({ paciente_id: '00000000-0000-4000-8000-000000000004', medico_id: '00000000-0000-4000-8000-000000000003', tipo: 'Consulta geral', data: today, status: 'agendado' });
  expect(checkinPayload).toMatchObject({ p_agendamento_id: 'synthetic-walk-in', p_prioridade: 'normal' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('Manchester risk choices keep readable contrast when selected', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role: 'enfermagem' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/fila?tab=triagem');
  await page.getByRole('button', { name: 'Nova Triagem' }).click();

  const main = page.locator('#main-content');
  await expect(page).toHaveURL('/triagem/nova?origem=triagem');
  const riskGroup = main.getByRole('group', { name: /Classificação de risco/ });
  const choices = [
    /Emergência.*Imediato/,
    /Muito Urgente.*10 min/,
    /Urgente.*30 min/,
    /Pouco Urgente.*120 min/,
    /Não Urgente.*240 min/,
  ];
  for (const name of choices) {
    const choice = riskGroup.getByRole('button', { name });
    await choice.click();
    await expect(choice).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(250);
    const contrast = await choice.evaluate(element => {
      const parse = (value: string) => value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
      const luminance = (value: string) => parse(value)
        .map(channel => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
      const style = getComputedStyle(element);
      const [lighter, darker] = [luminance(style.backgroundColor), luminance(style.color)].sort((a, b) => b - a);
      return {
        ratio: (lighter + 0.05) / (darker + 0.05),
        background: style.backgroundColor,
        foreground: style.color,
        className: (element as HTMLElement).className,
      };
    });
    expect(contrast.ratio, `a escolha ${String(name)}: ${JSON.stringify(contrast)}`).toBeGreaterThanOrEqual(4.5);
    if (String(name).includes('Muito Urgente')) {
      await page.screenshot({ path: testInfo.outputPath('triage-risk-orange-selected-desktop.png'), animations: 'disabled' });
    }
  }
  await page.screenshot({ path: testInfo.outputPath('triage-risk-selected-desktop.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('triage-risk-selected-mobile.png'), animations: 'disabled' });
  await main.getByRole('link', { name: 'Voltar à fila' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Descartar e sair' }).click();
  await expect(page).toHaveURL('/fila?tab=triagem');
});

test('triage workspace keeps the checked-in queue actionable at mobile widths', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, {
    platformAdmin: false,
    role: 'enfermagem',
    queuePopulated: true,
    queueTriagePending: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/fila?tab=triagem');

  const main = page.locator('#main-content');
  const pendingQueue = main.getByRole('region', { name: 'Pacientes aguardando triagem' });
  await expect(pendingQueue).toBeVisible();
  await expect(pendingQueue).toContainText('Diego Santos');
  await expect(pendingQueue.getByRole('button', { name: /^Triar / })).toHaveCount(4);
  await expect(pendingQueue.getByRole('button', { name: 'Triar Diego Santos' })).toBeVisible();
  await expect(main.getByText('Próximo a triar')).toHaveCount(0);

  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const action = pendingQueue.getByRole('button', { name: 'Triar Diego Santos' });
    await expect(action).toBeVisible();
    const bounds = await action.boundingBox();
    expect(bounds && bounds.x + bounds.width <= viewport.width, `ação fora da tela em ${viewport.width}px: ${JSON.stringify(bounds)}`).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`triage-queue-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
    if (viewport.width <= 390) {
      const firstAction = pendingQueue.getByRole('button', { name: /^Triar / }).first();
      const navigation = page.getByRole('navigation', { name: 'Navegação principal' });
      const [firstActionBounds, navigationBounds] = await Promise.all([firstAction.boundingBox(), navigation.boundingBox()]);
      expect(firstActionBounds && navigationBounds && firstActionBounds.y + firstActionBounds.height <= navigationBounds.y).toBe(true);
    }
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
});

test('desktop keyboard navigation moves focus to the destination content', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');

  const main = page.locator('#main-content');
  await page.getByRole('link', { name: 'Cadastro e histórico' }).click();
  await expect(page).toHaveURL(/\/pacientes$/);
  await expect(main).toBeFocused();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('reception first fold keeps a filled synthetic queue visible at desktop widths', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, receptionPopulated: true, receptionOverdue: true });

  for (const viewport of [{ width: 768, height: 1024 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1536, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/recepcao');

    const main = page.locator('#main-content');
    if (viewport.width >= 1024) {
      const agendaBar = page.getByRole('region', { name: 'Agenda de hoje' });
      const currentAgendaLabel = agendaBar.locator('a').first().locator('p').first();
      const currentAgendaMetrics = await currentAgendaLabel.evaluate(element => ({
        text: element.textContent,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(currentAgendaMetrics.scrollWidth <= currentAgendaMetrics.clientWidth, JSON.stringify(currentAgendaMetrics)).toBe(true);
    }
    await expect(main.locator('h1').first()).toBeVisible();
    await expect(main.getByText('Ana Souza', { exact: true })).toBeVisible();
    await expect(main.getByText('Gabriela Lima', { exact: true })).toBeVisible();
    await expect(main.getByText(/^Atrasado desde \d{2}:\d{2}$/, { exact: true })).toBeVisible();
    const summary = main.getByTestId('reception-operational-summary');
    const summaryColumns = await summary.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(summaryColumns).toBe(viewport.width >= 1536 ? 7 : 4);
    const thirdPatient = main.getByText('Carla Oliveira', { exact: true });
    await expect(thirdPatient).toBeVisible();
    const thirdPatientBox = await thirdPatient.boundingBox();
    expect(thirdPatientBox).not.toBeNull();
    await page.screenshot({ path: testInfo.outputPath(`recepcao-fila-primeira-dobra-${viewport.width}.png`), animations: 'disabled' });
    expect(thirdPatientBox!.y + thirdPatientBox!.height).toBeLessThanOrEqual(viewport.height);
    if (viewport.width >= 1024) {
      const chat = page.getByRole('button', { name: /Abrir chat interno/ });
      const triagemActions = main.getByRole('button', { name: /Abrir triagem de / });
      const [chatBox, triageBoxes] = await Promise.all([
        chat.boundingBox(),
        triagemActions.evaluateAll(elements => elements.map(element => {
          const box = element.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        })),
      ]);
      expect(chatBox).not.toBeNull();
      expect(triageBoxes.length).toBe(0);
      const overlappingActions = triageBoxes.filter(box =>
        chatBox!.x < box.x + box.width
        && chatBox!.x + chatBox!.width > box.x
        && chatBox!.y < box.y + box.height
        && chatBox!.y + chatBox!.height > box.y,
      );
      expect(overlappingActions, 'o atalho fixo do chat não deve cobrir nenhuma ação de triagem visível').toEqual([]);
      if (viewport.width < 1400) expect(chatBox!.y).toBeLessThan(160);
    }
    await page.screenshot({ path: testInfo.outputPath(`recepcao-fila-preenchida-${viewport.width}.png`), fullPage: false, animations: 'disabled' });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/recepcao');
  const mobileMain = page.locator('#main-content');
  await expect(mobileMain.getByRole('heading', { name: 'Painel de Recepção' })).toBeVisible();
  const mobileSummary = mobileMain.getByTestId('reception-operational-summary');
  const mobileColumns = await mobileSummary.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(mobileColumns).toBe(2);
  const firstAppointmentCard = mobileMain.getByTestId('reception-appointment-card').first();
  const firstPatient = firstAppointmentCard.getByText('Ana Souza', { exact: true });
  const firstCheckin = firstAppointmentCard.getByRole('button', { name: 'Check-in' });
  const mobileNavigation = page.getByRole('navigation', { name: /Navega/ });
  await expect(firstPatient).toBeVisible();
  await expect(firstCheckin).toBeVisible();
  const [firstPatientBounds, firstCheckinBounds, mobileNavigationBounds] = await Promise.all([
    firstPatient.boundingBox(), firstCheckin.boundingBox(), mobileNavigation.boundingBox(),
  ]);
  expect(firstPatientBounds).not.toBeNull();
  expect(firstCheckinBounds).not.toBeNull();
  expect(mobileNavigationBounds).not.toBeNull();
  expect(firstPatientBounds!.y + firstPatientBounds!.height).toBeLessThanOrEqual(844);
  expect(firstCheckinBounds!.y + firstCheckinBounds!.height).toBeLessThanOrEqual(mobileNavigationBounds!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('recepcao-fila-preenchida-390.png'), animations: 'disabled' });

  const receptionSearch = mobileMain.getByRole('textbox', { name: 'Buscar paciente ou médico na recepção' });
  await page.keyboard.press('/');
  await expect(receptionSearch).toBeFocused();
  await receptionSearch.fill('sem resultado');
  await expect(mobileMain.getByRole('status')).toContainText('Nenhum paciente encontrado');
  await receptionSearch.press('Escape');
  await expect(receptionSearch).toHaveValue('');
  await expect(firstPatient).toBeVisible();

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('reception recovers from an agenda read error without exposing check-in prematurely', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'recepcao', receptionPopulated: true });
  let failTodayQuery = true;
  await page.route('**/rest/v1/agendamentos**', route => {
    const requestUrl = new URL(route.request().url());
    const bounds = requestUrl.searchParams.getAll('data');
    const from = bounds.find(value => value.startsWith('gte.'))?.slice(4);
    const through = bounds.find(value => value.startsWith('lte.'))?.slice(4);
    if (from && from === through && failTodayQuery) {
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'temporary failure' }) });
    }
    return route.fallback();
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/recepcao');
  const main = page.locator('#main-content');
  const agendaError = main.getByRole('alert');
  await expect(agendaError).toContainText('A agenda de hoje não carregou. Tente novamente.');
  const errorMessage = 'Não conseguimos carregar estas informações agora. Tente novamente em instantes.';
  await expect(page.getByText(errorMessage, { exact: true })).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Check-in', exact: true })).toHaveCount(0);
  const retryButton = agendaError.getByRole('button', { name: 'Tentar novamente' });
  const mobileNavigation = page.getByRole('navigation', { name: /Navega/ });
  const [retryBounds, mobileNavigationBounds] = await Promise.all([retryButton.boundingBox(), mobileNavigation.boundingBox()]);
  expect(retryBounds).not.toBeNull();
  expect(mobileNavigationBounds).not.toBeNull();
  expect(retryBounds!.y + retryBounds!.height).toBeLessThanOrEqual(mobileNavigationBounds!.y);
  await page.screenshot({ path: testInfo.outputPath('recepcao-erro-agenda-mobile.png'), animations: 'disabled' });
  failTodayQuery = false;
  await main.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(main.getByText('Ana Souza', { exact: true }).first()).toBeVisible();
  await expect(main.getByRole('button', { name: 'Check-in', exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('reception empty state offers an action to register a walk-in', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'recepcao' });
  await page.route('**/rest/v1/agendamentos**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/recepcao');

  const main = page.locator('#main-content');
  const emptyState = main.getByRole('status');
  await expect(emptyState).toContainText('Nenhum paciente agendado para hoje');
  await expect(main.getByRole('button', { name: 'Encaixe sem agendamento' })).toBeVisible();
  await expect(emptyState.getByRole('button')).toHaveCount(0);
  await expect(main.getByTestId('reception-appointment-card')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('recepcao-agenda-vazia-mobile.png'), animations: 'disabled' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('finance does not report a zero margin when there is no revenue at desktop widths', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/financeiro?tab=dre');
    const main = page.locator('#main-content');
    await expect(main.getByRole('tab', { name: 'DRE' })).toHaveAttribute('aria-selected', 'true');
    await expect(main.getByText('Resultado Operacional', { exact: true })).toBeVisible();
    await expect(main.getByText('Sem receita para calcular a margem no período.', { exact: true })).toBeVisible();
    await expect(main.getByText('0,0%', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`finance-no-revenue-${viewport.width}.png`), animations: 'disabled' });
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('finance reconciles populated received revenue with its synthetic payment ledger on desktop', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, accountsPopulated: true });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/financeiro');

    const main = page.locator('#main-content');
    await expect(main.getByRole('heading', { name: 'Painel Financeiro' })).toBeVisible();
    const revenueCard = main.getByText('Entradas recebidas', { exact: true }).first().locator('xpath=../..');
    await expect(revenueCard).toContainText(/R\$\s*720/);
    await expect(main.getByText('Sem receita para calcular no perÃ­odo', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`finance-populated-${viewport.width}.png`), animations: 'disabled' });
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('analytics displays populated synthetic activity without backend writes', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, analyticsPopulated: true });
  for (const viewport of [{ width: 1280, height: 800 }, { width: 768, height: 960 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/analytics');
    const main = page.locator('#main-content');
    await expect(main.getByRole('heading', { name: 'Indicadores da cl\u00ednica' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Resumo do per\u00edodo' })).toBeVisible();
    await expect(main.getByText('Total Agendamentos', { exact: true })).toBeVisible();
    await expect(main.getByText('67%', { exact: true })).toBeVisible();
    await expect(main.getByTestId('analytics-kpi')).toHaveCount(8);
    await expect(main.getByRole('button', { name: 'Ver atendimento' })).toHaveCount(1);
    await expect(main.getByRole('button', { name: 'Ver financeiro' })).toHaveCount(1);
    await expect(main.getByRole('heading', { name: 'Agendamentos por Dia' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const tabsFit = await main.getByRole('tablist').evaluate(element => element.scrollWidth <= element.clientWidth);
    expect(tabsFit, `as abas precisam caber em ${viewport.width} px`).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`analytics-summary-${viewport.width}.png`), fullPage: false, animations: 'disabled' });
  }
  const main = page.locator('#main-content');
  await page.setViewportSize({ width: 1280, height: 800 });
  const goFinance = main.getByRole('button', { name: 'Ver financeiro' });
  await goFinance.focus();
  await expect(goFinance).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(main.getByRole('tab', { name: 'Financeiro' })).toHaveAttribute('data-state', 'active');
  const goAttendance = main.getByRole('button', { name: 'Ver atendimento' });
  await goAttendance.focus();
  await page.keyboard.press('Space');
  await expect(main.getByRole('tab', { name: 'Atendimento' })).toHaveAttribute('data-state', 'active');
  const statusTitle = main.getByRole('heading', { name: 'Status dos Agendamentos' });
  await statusTitle.evaluate(element => element.scrollIntoView({ block: 'center' }));
  await expect(statusTitle).toBeVisible();
  const statusBars = statusTitle.locator('xpath=../..').locator('.recharts-bar-rectangle path');
  await expect(statusBars).toHaveCount(3);
  const barGeometry = await statusBars.evaluateAll(elements => elements.map(element => ({
    path: element.getAttribute('d'),
    fill: getComputedStyle(element).fill,
    width: element.getBoundingClientRect().width,
  })));
  expect(barGeometry.every(bar => bar.path && bar.width > 0 && bar.fill !== 'none'), JSON.stringify(barGeometry)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('analytics-status-bars-1280.png'), animations: 'disabled' });
  await main.getByRole('tab', { name: 'Produtividade' }).click();
  await expect(main.getByText('Dra. Marina Ribeiro', { exact: true }).first()).toBeVisible();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('analytics explains when there are no appointments in the selected period', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, analyticsPopulated: true, accountsPopulated: true });
  await page.route('**/rest/v1/agendamentos*', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/0' }, body: '[]',
  }));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/analytics');
  const main = page.locator('#main-content');
  await expect(main.getByRole('heading', { name: 'Resumo do per\u00edodo' })).toBeVisible();
  await expect(main.getByText('Nenhum agendamento no per\u00edodo selecionado.')).toBeVisible();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('analytics tabs show their data or a clear empty state on desktop and mobile', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, {
    platformAdmin: false, analyticsPopulated: true, accountsPopulated: true,
  });
  const tabs = [
    { name: 'Atendimento', heading: 'Agendamentos por Dia' },
    { name: 'Produtividade', text: 'Dra. Marina Ribeiro' },
    { name: 'Financeiro', heading: 'Fluxo de Caixa' },
    { name: 'Triagem', empty: 'Nenhuma triagem registrada no per\u00edodo selecionado.' },
    { name: 'Satisfa\u00e7\u00e3o', empty: 'Nenhuma avalia\u00e7\u00e3o no per\u00edodo.' },
  ];

  for (const viewport of [{ width: 1280, height: 800 }, { width: 768, height: 960 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/analytics');
    const main = page.locator('#main-content');
    await expect(main.getByRole('heading', { name: 'Resumo do per\u00edodo' }), synthetic.requests.join('\\n')).toBeVisible();

    for (const tab of tabs) {
      await main.getByRole('tab', { name: tab.name }).click();
      if (tab.heading) await expect(main.getByRole('heading', { name: tab.heading })).toBeVisible();
      if (tab.text) await expect(main.getByText(tab.text, { exact: true }).first()).toBeVisible();
      if (tab.empty) await expect(main.getByText(tab.empty, { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const tabContent = main.locator('[role="tabpanel"]:visible').first();
      await page.screenshot({
        path: testInfo.outputPath(`analytics-${tab.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${viewport.width}.png`),
        fullPage: false,
        animations: 'disabled',
      });
      await expect(tabContent).toBeVisible();
    }
  }
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('analytics recovers from a failed query when the user retries', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, analyticsPopulated: true });
  let failAppointments = true;
  let interceptedAppointmentRequests = 0;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/rest/v1/agendamentos') {
      interceptedAppointmentRequests += 1;
    } else {
      await route.fallback();
      return;
    }
    if (failAppointments) {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'synthetic unavailable' }) });
      return;
    }
    await route.fallback();
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/analytics');
  await expect.poll(() => interceptedAppointmentRequests).toBeGreaterThan(0);
  const alert = page.locator('#main-content').getByRole('alert');
  await expect(alert.getByRole('heading', { name: 'N\u00e3o foi poss\u00edvel carregar os indicadores' })).toBeVisible();
  await expect(alert.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  failAppointments = false;
  await alert.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('heading', { name: 'Resumo do per\u00edodo' })).toBeVisible();
  await expect(page.locator('#main-content').getByRole('alert')).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('desktop semantic color pairs meet WCAG AA in normal and high contrast themes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const results = await page.evaluate(() => {
    const pairs = [
      ['text-foreground', 'bg-background'],
      ['text-muted-foreground', 'bg-background'],
      ['text-primary-foreground', 'bg-primary'],
      ['text-success-foreground', 'bg-success'],
      ['text-destructive-foreground', 'bg-destructive'],
      ['text-warning-foreground', 'bg-warning'],
      ['text-card-foreground', 'bg-card'],
      ['text-warning-foreground', 'bg-warning/10'],
      ['text-info', 'bg-info/10'],
      ['text-[#153A68]', 'bg-info/10'],
      ['text-[#14532D]', 'bg-success/10'],
      ['text-primary', 'bg-primary/10'],
      ['text-muted-foreground', 'bg-muted'],
    ];
    const luminance = (cssColor: string, compositeOnWhite = false) => {
      const srgb = cssColor.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)%?)?\)$/);
      const functional = cssColor.match(/^rgba?\(([^)]+)\)$/);
      const values = srgb
        ? srgb.slice(1, 4).map(Number)
        : functional?.[1].replace(/\s*\/\s*|,/g, ' ').trim().split(/\s+/).slice(0, 3).map(value => Number.parseFloat(value) / 255)
          ?? [0, 0, 0];
      const rawAlpha = srgb?.[4] ?? functional?.[1].replace(/,/g, ' ').trim().split(/\s+/)[3];
      const alpha = rawAlpha === undefined ? 1 : Number.parseFloat(rawAlpha) / (rawAlpha.includes('%') ? 100 : 1);
      const linear = values.map((value) => {
        const channel = compositeOnWhite ? value * alpha + 1 - alpha : value;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const reports = [] as { theme: string; pair: string; ratio: number }[];
    for (const theme of ['normal', 'high']) {
      document.documentElement.dataset.contrast = theme;
      for (const [textClass, surfaceClass] of pairs) {
        const sample = document.createElement('span');
        sample.className = `${textClass} ${surfaceClass}`;
        sample.textContent = 'Amostra de contraste';
        sample.style.cssText = 'position:fixed;left:-10000px;top:0';
        document.body.append(sample);
        const style = getComputedStyle(sample);
        const foreground = luminance(style.color);
        // State surfaces using /10 opacity sit on white table/card surfaces.
        const background = luminance(style.backgroundColor, true);
        reports.push({ theme, pair: `${textClass} sobre ${surfaceClass}`, ratio: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05) });
        sample.remove();
      }
    }
    document.documentElement.dataset.contrast = 'normal';
    return reports;
  });

  expect(results.filter(({ ratio }) => ratio < 4.5), JSON.stringify(results, null, 2)).toEqual([]);
});

test('accounts receivable and payable use the same title and action hierarchy', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);

    await page.goto('/contas?tab=receber');
    await expect(page.getByRole('heading', { level: 1, name: 'Contas a Receber', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nova Receita' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exportar' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`contas-receber-${viewport.width}.png`), fullPage: true, animations: 'disabled' });

    await page.goto('/contas?tab=pagar');
    await expect(page.getByRole('heading', { level: 1, name: 'Contas a Pagar', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nova Conta' }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`contas-pagar-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
  }

  expect(synthetic.writes.filter((write) => !write.includes('/rpc/'))).toEqual([]);
});

test('cashier page header and navigation fit desktop browser widths', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
  const cashierTabs = ['Caixa Hoje', 'Histórico', 'Contas a Receber', 'Contas a Pagar', 'Fluxo de Caixa', 'Tabela de Preços', 'Tipos de Consulta', 'Relatórios'];

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/recepcao?tab=caixa');
    const main = page.locator('#main-content');
    await expect(main.getByRole('heading', { level: 1, name: 'Caixa e fluxo de caixa', exact: true })).toBeVisible({ timeout: 30_000 });
    for (const label of cashierTabs) {
      await expect(main.getByRole('tab', { name: label, exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`caixa-diario-header-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
  }

  expect(synthetic.writes.filter((write) => !write.includes('/rpc/'))).toEqual([]);
});

test('populated financial accounts show status, balance and row actions on desktop', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, accountsPopulated: true });
  const longRevenue = 'Procedimento ambulatorial de complexidade intermediária com descrição longa para revisar truncamento e leitura da lista';
  const longExpense = 'Manutenção preventiva dos equipamentos de diagnóstico e climatização da unidade principal';

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);

    await page.goto('/contas?tab=receber');
    const revenueDescription = page.locator('#main-content p[title]').filter({ hasText: longRevenue }).first();
    await expect(revenueDescription).toBeVisible({ timeout: 15_000 });
    await expect(revenueDescription).toHaveAttribute('title', longRevenue);
    const categoryAxisTicks = await page.locator('.recharts-xAxis .recharts-cartesian-axis-tick-value').allTextContents();
    expect(categoryAxisTicks.length).toBeGreaterThan(1);
    expect(new Set(categoryAxisTicks).size).toBe(categoryAxisTicks.length);
    await expect(page.getByText('Pessoa Exemplo QA').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Receber saldo' }).first()).toBeVisible();
    await expect(page.getByText('Consulta de retorno já recebida')).toBeVisible();
    await expect(page.locator('#main-content').getByText('Atrasado · parcial', { exact: true }).first()).toHaveClass(/text-destructive/);
    const pendingRevenueRow = page.locator('#main-content').getByText('Exame diagnóstico aguardando pagamento', { exact: true });
    await expect(pendingRevenueRow).toBeVisible();
    const pendingRevenueRowContainer = pendingRevenueRow.locator('xpath=ancestor::tr[1]');
    await expect(pendingRevenueRowContainer.locator('td').nth(4)).toContainText('Pendente');
    await expect(pendingRevenueRowContainer.locator('td').nth(4).locator('div')).toHaveClass(/text-warning-foreground/);
    await expect(pendingRevenueRowContainer.getByText('Exame / Diagnóstico', { exact: true })).toBeVisible();
    await pendingRevenueRowContainer.getByRole('button', { name: /Mais ações da conta de/ }).click();
    await page.getByRole('menuitem', { name: 'Cancelar', exact: true }).click();
    const cancelDialog = page.getByRole('dialog');
    const confirmCancel = cancelDialog.getByRole('button', { name: 'Confirmar cancelamento' });
    await expect(confirmCancel).toHaveClass(/bg-destructive/);
    const cancelStyle = await confirmCancel.evaluate(element => {
      const style = getComputedStyle(element);
      return { image: style.backgroundImage, color: style.backgroundColor };
    });
    expect(cancelStyle.image).toBe('none');
    expect(cancelStyle.color).not.toBe('rgba(0, 0, 0, 0)');
    await page.keyboard.press('Escape');
    await expect(cancelDialog).toBeHidden();
    await revenueDescription.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`contas-receber-populated-${viewport.width}.png`), animations: 'disabled' });
    await page.getByRole('button', { name: 'Receber saldo' }).first().click();
    const receiveDialog = page.getByRole('dialog');
    await expect(receiveDialog).toContainText('Registre o recebimento com o caixa do dia aberto.');
    await page.keyboard.press('Escape');
    await expect(receiveDialog).toBeHidden();

    await page.goto('/contas?tab=pagar');
    const overduePartialRow = page.getByRole('row').filter({ hasText: longExpense });
    await expect(overduePartialRow).toContainText('Atrasado · parcial');
    const longDescription = overduePartialRow.getByText(longExpense, { exact: true });
    expect(await longDescription.evaluate(element => getComputedStyle(element).webkitLineClamp)).toBe('2');
    await expect(overduePartialRow.getByRole('button', { name: /Pagar saldo/ })).toBeVisible();
    const pendingRow = page.getByRole('row').filter({ hasText: 'Licença mensal do prontuário externo' });
    await expect(pendingRow).toContainText('Pendente');
    await expect(pendingRow.getByText('Pendente', { exact: true })).toHaveClass(/text-warning-foreground/);
    await expect(pendingRow.getByRole('button', { name: /^Pagar$/ })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Material de escritório quitado' })).toContainText('Pago');
    await overduePartialRow.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`contas-pagar-populated-${viewport.width}.png`), animations: 'disabled' });
    await overduePartialRow.getByRole('button', { name: /Pagar saldo/ }).click();
    const paymentDialog = page.getByRole('dialog');
    await expect(paymentDialog).toContainText('Confirmar Pagamento');
    await expect(paymentDialog).toContainText('Registre o pagamento desta conta.');
    await page.keyboard.press('Escape');
    await expect(paymentDialog).toBeHidden();
  }

  const pointReads = synthetic.writes.filter((write) => write.includes('/functions/v1/mercadopago-point'));
  expect(pointReads.length).toBeGreaterThan(0);
  expect(pointReads.every((write) => / action=(list_terminals|list_orders)$/.test(write))).toBe(true);
  expect(synthetic.writes.filter((write) => !write.includes('/rpc/') && !pointReads.includes(write))).toEqual([]);
});

test('productivity metrics respect high-contrast tokens at desktop widths', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, highContrast: true });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/indicadores');
    await expect(page.getByRole('heading', { name: 'Indicadores de produtividade' })).toBeVisible();
    await expect(page.getByText('Tarefas concluídas', { exact: true })).toBeVisible();
    await expect(page.getByText('Atendimentos concluídos', { exact: true })).toBeVisible();
    await expect(page.getByText('Coletas concluídas', { exact: true })).toBeVisible();
    await expect(page.getByText('Pagamentos recebidos', { exact: true })).toBeVisible();
    await expect(page.getByText('Valor recebido', { exact: true })).toBeVisible();
    await expect(page.getByText('Atendimentos registrados', { exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const cards = page.locator('#main-content section[aria-label="Indicadores do período"] > div[class*="bg-card"]');
    await expect(cards).toHaveCount(6);
    for (const card of await cards.all()) {
      await expect(card).toHaveClass(/border-border/);
      await expect(card).toHaveClass(/bg-card/);
    }
    await page.screenshot({ path: testInfo.outputPath(`indicadores-produtividade-high-contrast-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.every(write => write.includes('/rpc/'))).toBe(true);
});

test('reception payment is a dedicated page and confirms through the idempotent RPC', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role: 'recepcao', accountsPopulated: true });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const lancamentoId = '00000000-0000-4000-9000-000000000041';
  let paymentPayload: Record<string, unknown> | undefined;

  await page.route('**/rest/v1/lancamentos*', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    if (url.searchParams.get('id') !== `eq.${lancamentoId}`) return route.fallback();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
      id: lancamentoId, clinica_id: '00000000-0000-4000-8000-000000000002', tipo: 'receita', categoria: 'procedimento',
      descricao: 'Procedimento ambulatorial QA', paciente_id: '00000000-0000-4000-8000-000000000004', valor: 850,
      valor_pago: 300, desconto: 0, acrescimo: 0, status: 'parcial', agendamento_id: null,
    }]) });
  });
  await page.route('**/rest/v1/caixa_diario*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'synthetic-cash', aberto: true, data: today }]),
  }));
  await page.route('**/rest/v1/rpc/registrar_pagamento*', async route => {
    paymentPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ repetido: false }) });
  });
  await page.route('**/functions/v1/payment-receipt*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ emailStatus: 'sent' }),
  }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/recepcao/pagamentos/${lancamentoId}`);
  const main = page.locator('#main-content');
  await expect(main.getByRole('heading', { name: 'Receber pagamento' })).toBeVisible();
  await expect(main.getByText('Pessoa Exemplo QA', { exact: true })).toBeVisible();
  await expect(main.getByText('R$ 550,00')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('recepcao-payment-page-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('recepcao-payment-page-desktop.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });

  await main.getByRole('button', { name: 'PIX' }).click();
  const confirmPayment = main.getByRole('button', { name: 'Confirmar pagamento' });
  await confirmPayment.scrollIntoViewIfNeeded();
  const mobileNavigation = page.getByRole('navigation', { name: 'Navegação principal' });
  if (await mobileNavigation.isVisible()) {
    const [buttonBounds, navBounds] = await Promise.all([confirmPayment.boundingBox(), mobileNavigation.boundingBox()]);
    expect(!!buttonBounds && !!navBounds && buttonBounds.y + buttonBounds.height <= navBounds.y, 'o botão de recebimento deve ficar acima da navegação fixa no celular').toBe(true);
  }
  await confirmPayment.click();
  await expect(page).toHaveURL('/recepcao');
  await expect(page.getByText(/Pagamento de.*550,00 confirmado!/)).toBeVisible();
  expect(paymentPayload).toMatchObject({ p_lancamento_id: lancamentoId, p_desconto: 0, p_acrescimo: 0 });
  expect(paymentPayload?.p_chave_idempotencia).toEqual(expect.any(String));
  expect(paymentPayload?.p_pagamentos).toEqual([{ forma_pagamento: 'pix', valor: 550 }]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('appointment completion uses its own page and keeps return scheduling atomic', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role: 'recepcao', queuePopulated: true });
  const appointmentId = '00000000-0000-4000-9000-000000000012';
  const filaId = '00000000-0000-4000-9000-000000000062';
  let finalizationPayload: Record<string, unknown> | undefined;
  let notificationPayload: Record<string, unknown> | undefined;

  await page.route('**/rest/v1/agendamentos*', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    if (url.searchParams.get('id') !== `eq.${appointmentId}`) return route.fallback();
    expect(url.searchParams.get('clinica_id')).toBe('eq.00000000-0000-4000-8000-000000000002');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
      id: appointmentId, clinica_id: '00000000-0000-4000-8000-000000000002',
      paciente_id: '00000000-0000-4000-8000-000000000004', medico_id: '00000000-0000-4000-8000-000000000003',
      data: '2026-10-29', hora_inicio: '09:00', hora_fim: '09:30',
      pacientes: { nome: 'Pessoa Exemplo QA', nome_social: null, convenio_id: null },
      medicos: { nome: 'Dra. Exemplo QA' },
      tipo: 'Consulta', observacoes: null, status: 'em_atendimento',
    }]) });
  });
  await page.route('**/rest/v1/fila_atendimento*', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    if (url.searchParams.get('id') !== `eq.${filaId}`) return route.fallback();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
      id: filaId, clinica_id: '00000000-0000-4000-8000-000000000002', agendamento_id: appointmentId, status: 'em_atendimento',
    }]) });
  });
  await page.route('**/rest/v1/rpc/finalizar_atendimento_atomico*', async route => {
    finalizationPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ status_agendamento: 'finalizado', cobranca_criada: false, repetido: false }]) });
  });
  await page.route('**/rest/v1/notification_queue*', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    notificationPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/atendimentos/${appointmentId}/finalizar?filaId=${filaId}&origem=fila`);
  const main = page.locator('#main-content');
  await expect(main.getByRole('heading', { name: 'Finalizar atendimento' })).toBeVisible();
  await expect(main.getByText(appointmentId, { exact: true })).toHaveCount(0);
  await expect(main.getByText('Pessoa Exemplo QA', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await main.evaluate(element => element.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('appointment-finalize-page-mobile-top.png'), animations: 'disabled' });
  await main.getByText('30 dias', { exact: true }).click();
  await expect(main.getByText(/Retorno em/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('appointment-finalize-page-mobile-selection.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 768, height: 1024 });
  await main.evaluate(element => element.scrollTo(0, element.scrollHeight));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const tabletNavigation = page.getByRole('navigation', { name: 'Navegação principal' });
  if (await tabletNavigation.isVisible()) {
    const [buttonBounds, navBounds] = await Promise.all([
      main.getByRole('button', { name: 'Confirmar finalização' }).boundingBox(),
      tabletNavigation.boundingBox(),
    ]);
    expect(!!buttonBounds && !!navBounds && buttonBounds.y + buttonBounds.height <= navBounds.y).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('appointment-finalize-page-tablet.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await main.evaluate(element => element.scrollTo(0, 0));
  await expect(main.getByText(/Retorno previsto:/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('appointment-finalize-page-desktop.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  const submit = main.getByRole('button', { name: 'Confirmar finalização' });
  await submit.scrollIntoViewIfNeeded();
  const mobileNavigation = page.getByRole('navigation', { name: 'Navegação principal' });
  if (await mobileNavigation.isVisible()) {
    const [buttonBounds, navBounds] = await Promise.all([submit.boundingBox(), mobileNavigation.boundingBox()]);
    expect(!!buttonBounds && !!navBounds && buttonBounds.y + buttonBounds.height <= navBounds.y).toBe(true);
  }
  await submit.click();
  await expect(page).toHaveURL('/fila');
  expect(finalizationPayload).toMatchObject({
    p_agendamento_id: appointmentId, p_fila_id: filaId, p_agendar_retorno: true, p_dias_retorno: 30,
  });
  expect(notificationPayload).toMatchObject({ tipo: 'email', destinatario_id: '00000000-0000-4000-8000-000000000004' });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('old open appointments can be completed without a queue entry or same-day notification', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, role: 'recepcao', queuePopulated: false });
  const appointmentId = '00000000-0000-4000-9000-000000000013';
  let finalizationPayload: Record<string, unknown> | undefined;
  let notificationQueued = false;

  await page.route('**/rest/v1/agendamentos*', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    if (url.searchParams.get('id') !== `eq.${appointmentId}`) return route.fallback();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
      id: appointmentId, clinica_id: '00000000-0000-4000-8000-000000000002',
      paciente_id: '00000000-0000-4000-8000-000000000004', medico_id: '00000000-0000-4000-8000-000000000003',
      data: '2026-10-01', hora_inicio: '10:00', hora_fim: '10:30',
      pacientes: { nome: 'Pessoa Exemplo QA', nome_social: null, convenio_id: null },
      medicos: { nome: 'Dra. Exemplo QA' },
      tipo: 'Consulta', observacoes: null, status: 'em_atendimento',
    }]) });
  });
  await page.route('**/rest/v1/fila_atendimento*', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    if (url.searchParams.get('agendamento_id') !== `eq.${appointmentId}`) return route.fallback();
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/rest/v1/rpc/finalizar_atendimento_atomico*', async route => {
    finalizationPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ status_agendamento: 'finalizado', cobranca_criada: false, repetido: false }]) });
  });
  await page.route('**/rest/v1/notification_queue*', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    notificationQueued = true;
    await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  });

  await page.goto(`/atendimentos/${appointmentId}/finalizar?origem=atendimentos-abertos`);
  const main = page.locator('#main-content');
  await expect(main.getByRole('heading', { name: 'Finalizar atendimento' })).toBeVisible();
  await main.getByText('Sem retorno', { exact: true }).click();
  await expect(main.getByText('Nenhum retorno será criado para este atendimento.')).toBeVisible();
  await main.getByRole('button', { name: 'Confirmar finalização' }).click();
  await expect(page).toHaveURL('/recepcao');
  expect(finalizationPayload).toMatchObject({
    p_agendamento_id: appointmentId, p_fila_id: null, p_agendar_retorno: false, p_dias_retorno: null,
  });
  expect(notificationQueued).toBe(false);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
