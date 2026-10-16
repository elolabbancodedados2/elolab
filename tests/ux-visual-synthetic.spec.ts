import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('Auth desktop preserves readable login and signup states without horizontal overflow', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, authenticated: false });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/auth');

    const accessSwitch = page.getByRole('group', { name: 'Modo de acesso' });
    await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
    await expect(page.getByText('Para a rotina da sua clínica')).toBeVisible();
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
    return { backgroundImage: style.backgroundImage, borderStyle: style.borderStyle };
  }));
  expect(visualTones[0]?.backgroundImage).not.toBe('none');
  expect(visualTones[1]?.backgroundImage).toBe('none');
  expect(visualTones[1]?.borderStyle).toBe('solid');
  expect(visualTones[2]?.backgroundImage).toBe('none');
  expect(visualTones[2]?.borderStyle).toBe('solid');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('dashboard-role-actions-1280.png'), fullPage: true });

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.every(write => write.includes(' POST /rest/v1/rpc/'))).toBe(true);
});

const operationalDashboardCases = [
  { role: 'recepcao', title: 'Seu turno na recepção', hrefs: ['/recepcao', '/agenda', '/fila'] },
  { role: 'enfermagem', title: 'Cuidados e laboratório', hrefs: ['/triagem', '/mapa-coleta', '/laboratorio'] },
  { role: 'financeiro', title: 'Rotina financeira', hrefs: ['/financeiro', '/contas', '/cobranca-inadimplentes'] },
] as const;

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
      newRecord.evaluate(element => ({ image: getComputedStyle(element).backgroundImage })),
      myAgenda.evaluate(element => ({ image: getComputedStyle(element).backgroundImage, border: getComputedStyle(element).borderStyle })),
    ]);
    expect(primaryStyle.image).not.toBe('none');
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
    const card = main.getByRole('button', { name: /Consulta de Ana Souza, 08:00/ }).first();
    await expect(card).toBeVisible();
    await expect(card.getByText('Ana Souza')).toBeVisible();
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
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Editar consulta' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`agenda-semantic-status-${viewport.width}.png`), animations: 'disabled' });
  }
  expect(duplicateKeyWarnings).toEqual([]);
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
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
  expect(disabledStyle.background).toBe('rgb(243, 245, 247)');
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
  expect(disabledStyles.map(style => style.background)).toEqual(['rgb(243, 245, 247)', 'rgb(243, 245, 247)']);
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
  await expect(page.getByRole('combobox', { name: 'Filtrar contas pelo mês de vencimento' })).toBeVisible();
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

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/fila');
    const main = page.locator('#main-content');
    await expect(main.getByRole('heading', { name: 'Fila de Atendimento' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Jornada dos atendimentos' })).toBeVisible();
    await expect(main.locator('#fila-etapa-aguardando')).toContainText('2');
    await expect(main.locator('#fila-etapa-triagem')).toContainText('1');
    await expect(main.locator('#fila-etapa-atendimento')).toContainText('1');
    await expect(main.locator('#fila-etapa-finalizado')).toContainText('1');
    await expect(main.getByText(/1 acima de 30 min/)).toBeVisible();
    await expect(main.getByRole('button', { name: 'Registrar próxima triagem' })).toBeVisible();
    await expect(main.getByText('Ana Souza', { exact: true }).first()).toBeVisible();
    await expect(main.getByText('Bruno Almeida', { exact: true }).first()).toBeVisible();
    await expect(main.getByText('Carla Oliveira', { exact: true }).first()).toBeVisible();
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
  await expect(main.getByRole('tab', { name: 'Triagem' })).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('exam cancellation and permanent deletion dialogs are clear and safely dismissible on desktop', async ({ page }, testInfo) => {
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

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/exames');
    const main = page.locator('#main-content');
    await expect(main.getByRole('heading', { name: 'Solicitação de exames' })).toBeVisible();
    await expect(main.getByText('Ultrassom abdominal QA')).toBeVisible();
    await expect(main.getByText('Ana Souza').first()).toBeVisible();
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
    if (url.pathname === '/rest/v1/pacientes' && request.method() === 'GET' && url.searchParams.get('select') === '*') {
      exportedPatientReads.push(url.searchParams.toString());
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
  expect(await noDownload).toBe(true);
  expect(exportedPatientReads).toHaveLength(1); // only the patient row lookup precedes audit registration
  expect(bulkPatientDataReads).toEqual([]);
  expect(auditWrites.some(write => write.method === 'POST')).toBe(true);

  // A new page uses the success audit stub, proving both the request record
  // and fulfilled state are written before the JSON download is emitted.
  auditMode = 'success';
  await page.goto('/lgpd-pacientes');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#main-content').getByRole('button', { name: 'Exportar' }).click();
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
  expect(await failedMemedDownload).toBe(true);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('laboratory worklist shows populated samples and supports status filtering on desktop', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, labPopulated: true });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/laboratorio');
    const main = page.locator('#main-content');
    await expect(main.getByRole('heading', { name: 'Laboratório', exact: true })).toBeVisible();
    await expect(main.getByText('QA-UR-001', { exact: true })).toBeVisible();
    await expect(main.getByText('QA-UR-002', { exact: true })).toBeVisible();
    await expect(main.getByText('QA-UR-003', { exact: true })).toBeVisible();
    await expect(main.getByText('Ana Souza', { exact: true })).toBeVisible();
    await expect(main.getByText('Urgente', { exact: true })).toBeVisible();

    const statusFilter = main.getByTestId('lab-worklist-filters').getByRole('combobox').first();
    await statusFilter.click();
    await page.getByRole('option', { name: 'Pendente', exact: true }).click();
    await expect(main.getByText('QA-UR-001', { exact: true })).toBeVisible();
    await expect(main.getByText('QA-UR-002', { exact: true })).toHaveCount(0);
    await expect(main.getByText('QA-UR-003', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.filter(write => !write.includes('/rpc/'))).toEqual([]);
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
    await expect(main.getByRole('heading', { name: 'Prontuário Eletrônico' })).toBeVisible();
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
    const emptyState = main.getByRole('status').filter({ hasText: 'Nenhum funcionário cadastrado' });
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText('definir permissões e enviar convites');
    await expect(emptyState.getByRole('button', { name: 'Cadastrar funcionário', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`equipe-funcionarios-vazia-${viewport.width}.png`), animations: 'disabled' });

    const search = main.getByPlaceholder('Buscar por nome ou e-mail...');
    await search.fill('sem resultado qa');
    const noResults = main.getByRole('status').filter({ hasText: 'Nenhum funcionário encontrado' });
    await expect(noResults).toBeVisible();
    await expect(noResults.getByRole('button', { name: 'Limpar busca' })).toBeVisible();
    await noResults.getByRole('button', { name: 'Limpar busca' }).click();
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
      await expect(main.locator('h1').first()).toBeVisible();
      if (path === '/prontuarios') {
        await expect(main.getByRole('heading', { name: 'Prontuário Eletrônico' })).toBeVisible();
        await expect(main.getByText('Acesso clínico', { exact: true })).toBeVisible();
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
        await expect(main.getByRole('button', { name: 'Adicionar à Lista' })).toBeVisible();
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
        await expect(main.getByRole('heading', { name: 'Caixa Diário', exact: true })).toBeVisible();
        await expect(main.getByText(/Caixa (Aberto|Fechado)/)).toBeVisible();
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
        await expect(emptyCharts).toHaveCount(2);
        await expect(emptyCharts.first()).toContainText('A evolução diária aparecerá aqui');
        await expect(emptyCharts.nth(1)).toContainText('O saldo acumulado aparecerá aqui');
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
        await expect(main.getByText(/outubro 2026/i)).toBeVisible();
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
        const createWalkIn = emptyReception.getByRole('button', { name: 'Criar encaixe' });
        await createWalkIn.click();
        await expect(page.getByRole('dialog').getByRole('heading', { name: 'Encaixe sem agendamento' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).not.toBeVisible();
        await expect(createWalkIn).toBeFocused();
      }
      if (path === '/financeiro') {
        await expect(main.getByText('Margem de lucro', { exact: true })).toBeVisible();
        await expect(main.getByText('Sem receita para calcular no período', { exact: true })).toBeVisible();
        await expect(main.getByText('—', { exact: true })).toBeVisible();
      }
      if (path === '/laboratorio') {
        const chatButton = page.getByRole('button', { name: /Abrir chat interno/ });
        await expect(chatButton).toBeVisible();
        await expect(chatButton.locator('svg')).toBeVisible();
        await expect(chatButton.locator('svg')).toHaveCSS('opacity', '1');
        await expect(main.getByRole('heading', { name: 'Laboratório', exact: true })).toBeVisible();
        await expect(main.locator('header').getByRole('button', { name: 'Nova coleta', exact: true })).toBeVisible();
        await expect(main.getByRole('heading', { name: /Nenhuma coleta/ })).toBeVisible();
        await expect(main.getByRole('status').getByRole('button', { name: /Ver todos os períodos|Nova coleta|Carregar mais registros/ })).toBeVisible();
        await expect(main.getByTestId('lab-worklist-filters')).toBeVisible();
        await main.getByRole('tab', { name: /Pipeline/ }).click();
        await expect(main.getByTestId('lab-pipeline-kpis')).toBeVisible();
        await expect(main.getByRole('heading', { name: 'Nenhuma amostra no fluxo hoje' })).toBeVisible();
        await expect(main.getByRole('status').getByRole('button', { name: 'Registrar coleta' })).toBeVisible();
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
        await expect(main.getByTestId('lab-worklist-filters').getByRole('combobox').first()).toHaveText('Pendente');
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
        const addRoom = main.getByRole('button', { name: 'Nova Sala / Leito', exact: true }).first();
        await expect(addRoom).toBeVisible();
        await addRoom.click();
        await expect(page.getByRole('dialog').getByRole('heading', { name: 'Nova Sala' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).not.toBeVisible();
      }
      if (path === '/precos-servicos?tab=tipos') {
        await expect(main.getByRole('heading', { name: 'Tipos & Preços de Consulta', exact: true })).toBeVisible();
        const addType = main.getByRole('button', { name: 'Novo Tipo', exact: false });
        await expect(addType).toBeVisible();
        await addType.click();
        await expect(page.getByRole('dialog').getByRole('heading', { name: 'Novo Tipo de Consulta' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).not.toBeVisible();
      }

      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width, `${path} overflowed at ${viewport.width}px`).toBeLessThanOrEqual(viewport.width + 1);
      const scroll = await main.evaluate(element => ({
        clientHeight: element.clientHeight,
        maxScrollTop: Math.max(0, element.scrollHeight - element.clientHeight),
      }));
      if (path === '/laboratorio') expect(scroll.maxScrollTop).toBe(0);
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
  const fullReason = 'Retorno para reavaliar a resposta ao tratamento inicial e a persistência da dor, revisar os efeitos relatados pela pessoa e definir os próximos passos do acompanhamento clínico.';
  const reason = overdueRow.locator('td').nth(3).locator('span');
  await expect(reason).toHaveText(fullReason);
  await expect(reason).toHaveAttribute('title', fullReason);
  await expect(reason).toHaveClass(/line-clamp-2/);
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`retornos-overdue-${width}.png`), animations: 'disabled' });
  }
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.every(write => write.includes(' POST /rest/v1/rpc/'))).toBe(true);
});

test('triage role can open the clinical form with its key vital fields', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, role: 'enfermagem' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/triagem');

  const main = page.locator('#main-content');
  await expect(main.getByRole('heading', { name: 'Triagem', exact: true })).toBeVisible();
  const newTriage = main.getByRole('button', { name: 'Nova Triagem' });
  await expect(newTriage).toBeVisible();
  await newTriage.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Registrar Triagem' })).toBeVisible();
  await expect(dialog.getByText('Classifique o risco e registre os sinais vitais do paciente.')).toBeVisible();
  await expect(dialog.locator('#triagem-paciente')).toBeVisible();
  await expect(dialog.locator('#triagem-agendamento')).toBeVisible();
  await expect(dialog.locator('#triagem-queixa')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Registrar Triagem' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.every(write => write.includes(' POST /rest/v1/rpc/'))).toBe(true);
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

  for (const viewport of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/recepcao');

    const main = page.locator('#main-content');
    await expect(main.locator('h1').first()).toBeVisible();
    await expect(main.getByText('Ana Souza', { exact: true })).toBeVisible();
    await expect(main.getByText('Gabriela Lima', { exact: true })).toBeVisible();
    await expect(main.getByText(/^Atrasado desde \d{2}:\d{2}$/, { exact: true })).toBeVisible();
    const thirdPatient = main.getByText('Carla Oliveira', { exact: true });
    await expect(thirdPatient).toBeVisible();
    const thirdPatientBox = await thirdPatient.boundingBox();
    expect(thirdPatientBox).not.toBeNull();
    expect(thirdPatientBox!.y + thirdPatientBox!.height).toBeLessThanOrEqual(viewport.height);
    const chat = page.getByRole('button', { name: /Abrir chat interno/ });
    const triagem = main.getByRole('button', { name: 'Triagem', exact: true }).first();
    const [chatBox, triagemBox] = await Promise.all([chat.boundingBox(), triagem.boundingBox()]);
    expect(chatBox).not.toBeNull();
    expect(triagemBox).not.toBeNull();
    const overlapsTriagem = chatBox!.x < triagemBox!.x + triagemBox!.width
      && chatBox!.x + chatBox!.width > triagemBox!.x
      && chatBox!.y < triagemBox!.y + triagemBox!.height
      && chatBox!.y + chatBox!.height > triagemBox!.y;
    expect(overlapsTriagem, 'o atalho fixo do chat não deve cobrir a ação de triagem').toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`recepcao-fila-preenchida-${viewport.width}.png`), fullPage: false, animations: 'disabled' });
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('finance does not report a zero margin when there is no revenue at desktop widths', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/financeiro');
    const main = page.locator('#main-content');
    await expect(main.getByText(/Margem de lucro/i)).toBeVisible();
    await expect(main.getByText('Sem receita para calcular no período', { exact: true })).toBeVisible();
    await expect(main.getByText('—', { exact: true })).toBeVisible();
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
    const revenueCard = main.getByText('Receita Recebida', { exact: true }).locator('xpath=../..');
    await expect(revenueCard).toContainText(/R\$\s*720/);
    await expect(main.getByText('Sem receita para calcular no perÃ­odo', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`finance-populated-${viewport.width}.png`), animations: 'disabled' });
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('analytics displays populated synthetic activity without backend writes', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, analyticsPopulated: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/analytics');

  const main = page.locator('#main-content');
  await expect(main.getByRole('heading', { name: 'Indicadores da clínica' })).toBeVisible();
  await expect(main.getByText('Total Agendamentos', { exact: true })).toBeVisible();
  await expect(main.getByText('67%', { exact: true })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Agendamentos por Dia' })).toBeVisible();
  const kpiHeights = await main.getByTestId('analytics-kpi').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
  expect(Math.max(...kpiHeights) - Math.min(...kpiHeights)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('analytics-populated-1280.png'), fullPage: false, animations: 'disabled' });

  await main.getByRole('tab', { name: 'Produtividade' }).click();
  await expect(main.getByText('Dra. Marina Ribeiro', { exact: true }).first()).toBeVisible();
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

test('admin page headers use the shared semantic color tokens on desktop', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, ultraPlan: true });
  const pages = [
    { path: '/configuracoes', title: 'Configurações', name: 'configuracoes' },
    { path: '/acesso-assistido', title: 'Acesso assistido', name: 'acesso-assistido' },
    { path: '/agente-ia', title: 'Agente de IA - WhatsApp', name: 'agente-ia' },
    { path: '/automacoes', title: 'Automações', name: 'automacoes' },
  ];

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);

    for (const target of pages) {
      await page.goto(target.path);
      await expect(page.getByRole('heading', { level: 1, name: target.title })).toBeVisible();

      const semanticSurface = page.locator('[class*="from-background"][class*="via-card"][class*="to-accent"]').first();
      await expect(semanticSurface).toBeVisible();
      const classes = await semanticSurface.getAttribute('class');
      expect(classes).toContain('border-border');
      expect(classes).not.toContain('[#');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${target.name}-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
    }
  }

  expect(synthetic.writes.filter((write) => !write.includes('/rpc/'))).toEqual([]);
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
    await expect(main.getByRole('heading', { level: 1, name: 'Caixa Diário', exact: true })).toBeVisible();
    for (const label of cashierTabs) {
      await expect(main.getByRole('tab', { name: label, exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`caixa-diario-header-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
  }

  expect(synthetic.writes.filter((write) => !write.includes('/rpc/'))).toEqual([]);
});

test('populated financial accounts show status, balance and row actions on desktop', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { platformAdmin: false, accountsPopulated: true });
  const longRevenue = 'Procedimento ambulatorial de complexidade intermediária com descrição longa para revisar truncamento e leitura da lista';
  const longExpense = 'Manutenção preventiva dos equipamentos de diagnóstico e climatização da unidade principal';

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);

    await page.goto('/contas?tab=receber');
    const revenueDescription = page.getByText(longRevenue, { exact: true });
    await expect(revenueDescription).toBeVisible();
    await expect(revenueDescription).toHaveAttribute('title', longRevenue);
    const categoryAxisTicks = await page.locator('.recharts-xAxis .recharts-cartesian-axis-tick-value').allTextContents();
    expect(categoryAxisTicks.length).toBeGreaterThan(1);
    expect(new Set(categoryAxisTicks).size).toBe(categoryAxisTicks.length);
    await expect(page.getByText('Pessoa Exemplo QA')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Receber saldo' })).toBeVisible();
    await expect(page.getByText('Consulta de retorno já recebida')).toBeVisible();
    await expect(page.locator('#main-content').getByText('Atrasado · parcial', { exact: true })).toHaveClass(/text-destructive/);
    const pendingRevenueRow = page.locator('#main-content').getByText('Exame diagnóstico aguardando pagamento', { exact: true });
    await expect(pendingRevenueRow).toBeVisible();
    await expect(page.locator('#main-content').getByText('Pendente', { exact: true })).toHaveClass(/text-warning-foreground/);
    await expect(page.locator('#main-content').getByText('Exame / Diagnóstico', { exact: true })).toHaveClass(/text-warning-foreground/);
    const pendingRevenueCard = pendingRevenueRow.locator('xpath=ancestor::div[contains(@class, "rounded-2xl")][1]');
    await pendingRevenueCard.getByRole('button', { name: 'Mais ações da conta' }).click();
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
    await page.getByRole('button', { name: 'Receber saldo' }).click();
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
