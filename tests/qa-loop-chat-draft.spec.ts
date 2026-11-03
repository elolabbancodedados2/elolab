import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

for (const width of [1280, 390]) {
  for (const surface of width === 390 ? ['pagina'] : ['pagina', 'painel']) {
    test(`chat ${surface} preserva o próximo rascunho durante envio em ${width}px`, async ({ page }, info) => {
      const synthetic = await installSyntheticClinic(page, { platformAdmin: false });
      await page.routeWebSocket('ws://127.0.0.1:54321/**', () => {});
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
      await page.route('**/rest/v1/platform_admins*', route => route.fulfill({ json: null }));
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error' && !message.text().includes('net::ERR_BLOCKED_BY_CLIENT')) errors.push(message.text());
      });
      page.on('requestfailed', request => {
        if (!['net::ERR_BLOCKED_BY_CLIENT', 'net::ERR_ABORTED'].includes(request.failure()?.errorText ?? '')) errors.push(request.url());
      });
      page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      const colleague = { id: '00000000-0000-4000-8000-000000000090', nome: 'Marina Equipe QA', email: 'marina@example.test', avatar: null, ultimo_acesso: null };
      const conversation = { id: '00000000-0000-4000-8000-000000000091', participante_1_id: synthetic.userId, participante_2_id: colleague.id, clinica_id: synthetic.clinicId, ultima_mensagem_em: null, preview: null };
      await page.route('**/rest/v1/profiles*', async route => {
        if (new URL(route.request().url()).searchParams.get('id')?.startsWith('neq.')) await route.fulfill({ json: [colleague] });
        else await route.fallback();
      });
      await page.route('**/rest/v1/chat_conversations*', route => route.fulfill({
        json: route.request().headers().accept?.includes('object') ? conversation : [conversation],
      }));
      let release!: () => void;
      const pending = new Promise<void>(resolve => { release = resolve; });
      const sent: Array<Record<string, unknown>> = [];
      await page.route('**/rest/v1/chat_messages*', async route => {
        if (route.request().method() !== 'POST') {
          await route.fulfill({ json: [] });
          return;
        }
        const body = route.request().postDataJSON();
        sent.push(body);
        await pending;
        await route.fulfill({ json: { ...body, id: `message-${sent.length}`, created_at: new Date().toISOString(), lida_em: null } });
      });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(surface === 'pagina' ? '/chat' : '/dashboard');
      if (surface === 'painel') await page.getByRole('button', { name: /^Abrir chat interno/ }).click();
      await page.getByRole('button', { name: /Marina Equipe QA/ }).click();
      const input = page.getByRole('textbox', { name: 'Mensagem', exact: true });
      await input.fill('Primeira mensagem');
      await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
      await expect.poll(() => sent.length).toBe(1);
      try {
        await input.fill('Próxima mensagem ainda não enviada');
        await page.getByRole('button', { name: 'Marcar como urgente', exact: true }).click();
      } finally {
        release();
      }
      await expect(page.getByRole('button', { name: 'Enviar mensagem', exact: true })).toBeEnabled();
      await expect(input).toHaveValue('Próxima mensagem ainda não enviada');
      await expect(page.getByRole('button', { name: 'Remover urgência', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
      await expect(input).toHaveValue('');
      expect(sent.map(message => message.texto)).toEqual(['Primeira mensagem', 'Próxima mensagem ainda não enviada']);
      expect(sent.map(message => message.urgente)).toEqual([false, true]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`chat-${surface}-${width}.png`), fullPage: true });
      expect(errors).toEqual([]);
      expect(synthetic.assertAllWritesAreMocked()).toBe(true);
    });
  }
}
