import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const clinicId = '00000000-0000-4000-8000-0000000000c1';
const requesterId = '00000000-0000-4000-8000-0000000000a1';
const ticketId = '00000000-0000-4000-a000-000000000001';
const ticket = {
  id: ticketId,
  clinica_id: clinicId,
  solicitante_id: requesterId,
  categoria: 'duvida',
  titulo: 'Acesso ao prontuário de demonstração',
  descricao: 'Chamado sintético para revisar suporte da plataforma.',
  prioridade: 'normal',
  status: 'aberto',
  sla_limite: '2099-01-01T00:00:00Z',
  primeira_resposta_em: null,
  created_at: '2026-01-02T00:00:00Z',
};

test('platform support status keyboard and internal note work without losing focus', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: true });
  const writes: Array<{ kind: string; body: Record<string, unknown> }> = [];
  const messages: Array<Record<string, unknown>> = [{
    id: 'public-message-1', ticket_id: ticketId, autor_id: requesterId, interno: false,
    mensagem: 'Mensagem pública sintética.', created_at: '2026-01-01T00:00:00Z',
  }];

  await page.route('http://127.0.0.1:54321/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/rest/v1/support_tickets' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ticket]) });
      return;
    }
    if (url.pathname === '/rest/v1/support_tickets' && request.method() === 'PATCH') {
      writes.push({ kind: 'status', body: request.postDataJSON() as Record<string, unknown> });
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: ticketId }) });
      return;
    }
    if (url.pathname === '/rest/v1/support_ticket_messages' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(messages) });
      return;
    }
    if (url.pathname === '/rest/v1/support_ticket_messages' && request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      writes.push({ kind: 'message', body });
      const id = `internal-message-${messages.length}`;
      messages.push({ ...body, id, autor_nome: 'Admin QA', created_at: '2026-01-03T00:00:00Z' });
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id }) });
      return;
    }
    if (url.pathname === '/rest/v1/clinicas' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: clinicId, nome: 'Clínica QA sintética' }]) });
      return;
    }
    if (url.pathname === '/rest/v1/profiles' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: requesterId, nome: 'Solicitante QA', email: 'qa@elolab.test' }]) });
      return;
    }
    await route.fallback();
  });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/admin/suporte');
    await page.getByRole('button', { name: /Acesso ao prontuário de demonstração/ }).click();

    const status = page.getByRole('combobox', { name: ticket.titulo });
    await status.focus();
    await page.keyboard.press('Enter');
    const resolved = page.getByRole('option', { name: 'Resolvido' });
    await expect(resolved).toBeVisible();
    await resolved.focus();
    await page.keyboard.press('Enter');
    await expect(status).toBeEnabled();
    await expect.poll(() => writes.filter((write) => write.kind === 'status').length).toBe(viewport.width === 1440 ? 1 : 2);
    await expect(status).toBeEnabled();
    await expect(status).toBeFocused();

    const noteToggle = page.getByRole('checkbox', { name: /Nota interna, visível somente à plataforma/ });
    await expect(noteToggle).toBeVisible();
    await noteToggle.check();
    await page.getByRole('textbox', { name: 'Responder' }).fill(`Nota interna sintética ${viewport.width}`);
    await page.getByRole('button', { name: 'Adicionar nota interna' }).click();
    await expect.poll(() => writes.filter((write) => write.kind === 'message').length).toBe(viewport.width === 1440 ? 1 : 2);
    const savedNote = writes.filter((write) => write.kind === 'message').at(-1)?.body;
    expect(savedNote).toMatchObject({ ticket_id: ticketId, interno: true, mensagem: `Nota interna sintética ${viewport.width}` });
    await expect(page.getByText('Nota interna · só plataforma').last()).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Nota interna, visível somente à plataforma/ })).not.toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`suporte-plataforma-${viewport.width}.png`), animations: 'disabled' });
  }

  expect(writes.map((write) => write.kind)).toEqual(['status', 'message', 'status', 'message']);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

// Novo funcionário, novo médico e perfis viraram páginas próprias; a edição
// concorrente e a página de perfis já são cobertas em employee-pages.spec.ts e
// doctor-pages.spec.ts. Aqui fica o que só este fluxo cobre: o botão de vínculo
// sem função e a prévia de acesso no formulário de novo funcionário.
test('team list opens the new employee page with a live access preview on desktop', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false, employeesPopulated: true, employeeWithoutRoles: true, manageDoctors: true });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/equipe?aba=funcionarios');
  const main = page.locator('#main-content');
  await expect(page.getByText('Bruno QA sem permissao')).toBeVisible();
  await expect(page.getByRole('button', { name: /Defina uma fun/ })).toBeDisabled();
  await main.getByRole('button', { name: 'Novo Funcionário' }).click();
  await expect(page).toHaveURL('/equipe/funcionarios/novo');
  await expect(main.getByRole('heading', { level: 1, name: 'Novo Funcionário' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(main.getByLabel('Nome completo *')).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Permissões de Acesso' })).toBeVisible();
  const accessPreview = main.getByRole('region', { name: 'Prévia de acesso' });
  await expect(accessPreview).toContainText('Selecione um papel');
  await main.getByRole('checkbox', { name: 'Recepção' }).click();
  await expect(accessPreview).toContainText('Agenda');
  await expect(accessPreview).not.toContainText('Contas a receber e a pagar');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const nonRpcWrites = synthetic.writes.filter((write) => !write.includes('/rpc/'));
  expect(nonRpcWrites.every((write) => write.endsWith('PATCH /rest/v1/profiles'))).toBe(true);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('equipe-novo-funcionario-1280.png'), animations: 'disabled' });
});

test('pending invite confirmation can be cancelled without changing the invitation', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  const cancelWrites: string[] = [];
  const invite = {
    id: '00000000-0000-4000-8000-0000000000f1',
    clinica_id: '00000000-0000-4000-8000-000000000002',
    email: 'convite.qa@elolab.test',
    nome: 'Convite QA',
    roles: ['recepcao'],
    token: 'synthetic-invite-token',
    created_at: '2026-01-01T12:00:00Z',
    expires_at: '2099-01-01T12:00:00Z',
    accepted_at: null,
  };
  let inviteFixtureRequests = 0;

  await page.route(/\/rest\/v1\/(convites_funcionario|employee_invitations)(\?.*)?$/, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    inviteFixtureRequests += 1;
    if (pathname === '/rest/v1/convites_funcionario' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/1' }, body: JSON.stringify([invite]) });
      return;
    }
    if (pathname === '/rest/v1/employee_invitations' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' });
      return;
    }
    if (request.method() !== 'GET' && request.method() !== 'HEAD') {
      cancelWrites.push(`${request.method()} ${request.url()}`);
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fallback();
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/equipe?aba=convites');
  await expect.poll(() => inviteFixtureRequests).toBeGreaterThan(0);
  const cancelInvite = page.getByRole('button', { name: `Cancelar convite para ${invite.email}` });
  await expect(cancelInvite).toBeVisible();
  await cancelInvite.click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toContainText(invite.email);
  await expect(confirmation).toContainText('deixa de funcionar imediatamente');
  await confirmation.getByRole('button', { name: 'Voltar' }).click();
  await expect(confirmation).toBeHidden();
  await expect(cancelInvite).toBeFocused();
  expect(cancelWrites).toEqual([]);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
