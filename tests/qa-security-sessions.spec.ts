import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('sessão autenticada visível envia heartbeat mínimo ao RPC da própria conta', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  const payloads: Record<string, unknown>[] = [];

  page.on('request', (request) => {
    if (request.url().includes('/rest/v1/rpc/touch_my_account_session')) {
      payloads.push(request.postDataJSON() as Record<string, unknown>);
    }
  });

  await page.goto('/configuracoes?aba=seguranca');
  await expect.poll(() => payloads.length).toBeGreaterThan(0);

  expect(payloads[0]).toEqual({ p_user_agent: expect.any(String) });
  expect(payloads[0]).not.toHaveProperty('user_id');
  expect(payloads[0]).not.toHaveProperty('session_id');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
