import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const clinicId = '00000000-0000-4000-8000-0000000000c1';
const requesterId = '00000000-0000-4000-8000-0000000000a1';
const tickets = [
  {
    id: '00000000-0000-4000-a000-000000000001',
    clinica_id: clinicId,
    solicitante_id: requesterId,
    categoria: 'duvida',
    titulo: 'Conversa longa de suporte',
    descricao: 'Histórico sintético com várias mensagens para validar a área de resposta.',
    prioridade: 'normal',
    status: 'aberto',
    sla_limite: '2099-01-01T00:00:00Z',
    primeira_resposta_em: null,
    created_at: '2026-01-02T00:00:00Z',
  },
  {
    id: '00000000-0000-4000-a000-000000000002',
    clinica_id: clinicId,
    solicitante_id: requesterId,
    categoria: 'duvida',
    titulo: 'Acesso ao portal do paciente',
    descricao: 'Dúvida sintética sobre o acesso.',
    prioridade: 'normal',
    status: 'aberto',
    sla_limite: '2099-01-01T00:00:00Z',
    primeira_resposta_em: null,
    created_at: '2026-01-01T00:00:00Z',
  },
];

const messages = Array.from({ length: 30 }, (_, index) => ({
  id: `message-${String(index + 1).padStart(2, '0')}`,
  ticket_id: tickets[0].id,
  autor_id: requesterId,
  interno: false,
  mensagem: `Mensagem sintética ${index + 1}: atualização detalhada do chamado para validar a rolagem da conversa.`,
  created_at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
}));

test('support keeps recent messages and reply drafts usable on desktop', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: true });
  const statusWrites: string[] = [];

  await page.route('http://127.0.0.1:54321/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname === '/rest/v1/support_tickets') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': `0-${tickets.length - 1}/${tickets.length}` },
        body: JSON.stringify(tickets),
      });
      return;
    }
    if (request.method() === 'PATCH' && url.pathname === '/rest/v1/support_tickets') {
      statusWrites.push(url.searchParams.get('id') || 'missing-id');
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: tickets[0].id }) });
      return;
    }
    if (request.method() === 'GET' && url.pathname === '/rest/v1/clinicas') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: clinicId, nome: 'Clínica QA sintética' }]) });
      return;
    }
    if (request.method() === 'GET' && url.pathname === '/rest/v1/profiles') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: requesterId, nome: 'Pessoa solicitante', email: 'qa@elolab.test' }]) });
      return;
    }
    if (request.method() === 'GET' && url.pathname === '/rest/v1/support_ticket_messages') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(messages) });
      return;
    }
    await route.fallback();
  });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/admin/suporte');
    const conversationTicket = page.getByRole('button', { name: /Conversa longa de suporte/ });
    await expect(conversationTicket).toBeVisible();
    await conversationTicket.click();
    const reply = page.getByRole('textbox', { name: 'Responder' });
    await expect(reply).toBeVisible();
    const latestMessage = page.getByText('Mensagem sintética 30:', { exact: false });
    await expect(latestMessage).toHaveCount(1);

    const geometry = await latestMessage.evaluate((messageElement) => {
      const replyElement = document.querySelector('#support-reply');
      if (!replyElement) throw new Error('Campo de resposta ausente');
      const detailCard = replyElement.closest('[class*="lg:sticky"]');
      const viewport = detailCard?.querySelector('[aria-live="polite"]') as HTMLElement | null;
      if (!viewport) throw new Error('Área de mensagens do chamado ausente');
      const replyBox = replyElement.getBoundingClientRect();
      const latestMessageBox = messageElement.getBoundingClientRect();
      const conversationBox = viewport.getBoundingClientRect();
      return {
        replyBottom: Math.round(replyBox.bottom),
        viewportHeight: window.innerHeight,
        conversationScrollTop: viewport.scrollTop,
        conversationScrollHeight: viewport.scrollHeight,
        conversationClientHeight: viewport.clientHeight,
        latestMessageVisible: latestMessageBox.top >= conversationBox.top && latestMessageBox.bottom <= conversationBox.bottom,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    const replyActionBottom = await page.getByRole('button', { name: 'Enviar resposta' }).evaluate((element) => Math.round(element.getBoundingClientRect().bottom));
    expect(geometry.replyBottom).toBeLessThanOrEqual(viewport.height);
    expect(replyActionBottom).toBeLessThanOrEqual(viewport.height);
    expect(geometry.conversationScrollTop + geometry.conversationClientHeight).toBeGreaterThanOrEqual(geometry.conversationScrollHeight - 2);
    expect(geometry.conversationScrollHeight).toBeGreaterThan(geometry.conversationClientHeight);
    expect(geometry.latestMessageVisible).toBe(true);
    expect(geometry.horizontalOverflow).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`support-conversation-${viewport.width}.png`), fullPage: true, animations: 'disabled' });

    if (viewport.width === 1440) {
      const statusControl = page.getByRole('combobox', { name: `Status do chamado ${tickets[0].titulo}` });
      await statusControl.focus();
      await page.keyboard.press('Enter');
      const nextStatus = page.getByRole('option', { name: 'Em atendimento' });
      await expect(nextStatus).toBeVisible();
      await nextStatus.focus();
      await page.keyboard.press('Enter');
      await expect.poll(() => statusWrites.length).toBe(1);
      await expect(statusControl).toBeFocused();
    }

    await reply.fill('Rascunho para o primeiro chamado');
    await page.getByRole('button', { name: /Acesso ao portal do paciente/ }).click();
    await expect(reply).toHaveValue('');
    await reply.fill('Rascunho para o segundo chamado');
    await conversationTicket.click();
    await expect(reply).toHaveValue('Rascunho para o primeiro chamado');
    await page.getByRole('button', { name: /Acesso ao portal do paciente/ }).click();
    await expect(reply).toHaveValue('Rascunho para o segundo chamado');
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(statusWrites).toEqual([`eq.${tickets[0].id}`]);
  expect(synthetic.writes.filter((write) => !write.includes('/rpc/'))).toEqual([]);
});

test('clinic support requests only public messages', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  let internalFilter: string | null = null;
  const internalNote = {
    id: 'internal-note',
    ticket_id: tickets[0].id,
    autor_id: requesterId,
    interno: true,
    mensagem: 'Nota interna QA que não pode chegar ao navegador da clínica.',
    created_at: '2026-01-01T00:30:00Z',
  };

  await page.route('http://127.0.0.1:54321/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname === '/rest/v1/support_tickets') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([tickets[0]]) });
      return;
    }
    if (request.method() === 'GET' && url.pathname === '/rest/v1/support_ticket_messages') {
      internalFilter = url.searchParams.get('interno');
      const returnedMessages = internalFilter === 'eq.false'
        ? messages
        : [...messages, internalNote];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(returnedMessages) });
      return;
    }
    await route.fallback();
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/suporte');
  await page.getByRole('button', { name: /Conversa longa de suporte/ }).click();
  await expect(page.getByRole('textbox', { name: 'Responder' })).toBeVisible();
  await expect(page.getByText(internalNote.mensagem, { exact: true })).toHaveCount(0);
  expect(internalFilter).toBe('eq.false');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(synthetic.writes.every((write) => write.includes('/rpc/'))).toBe(true);
});
