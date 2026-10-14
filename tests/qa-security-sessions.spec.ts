import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('sessão autenticada visível envia heartbeat mínimo ao RPC da própria conta', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  const payloads: Record<string, unknown>[] = [];
  const sessionRows = [
    {
      session_id: 'current-session-id-hidden',
      created_at: '2026-10-14T07:30:00.000Z',
      last_activity_at: '2026-10-14T08:00:00.000Z',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
      is_current: true,
      ip: '192.0.2.1',
    },
    {
      session_id: 'other-session-id-hidden',
      created_at: '2026-10-13T07:30:00.000Z',
      last_activity_at: '2026-10-14T07:45:00.000Z',
      user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Version/17.0 Safari/605.1.15',
      is_current: false,
      ip: '198.51.100.4',
    },
  ];

  page.on('request', (request) => {
    if (request.url().includes('/rest/v1/rpc/touch_my_account_session')) {
      payloads.push(request.postDataJSON() as Record<string, unknown>);
    }
  });

  await page.route('http://127.0.0.1:54321/rest/v1/rpc/list_my_account_sessions', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionRows) });
  });

  await page.goto('/configuracoes?tab=seguranca');
  await expect.poll(() => payloads.length).toBeGreaterThan(0);
  const panel = page.getByRole('region', { name: 'Sessões desta conta' });
  await expect(panel.getByText('Este dispositivo')).toBeVisible();
  await expect(panel.getByText('Outro dispositivo')).toBeVisible();
  await expect(panel.getByText('Edge · Windows')).toBeVisible();
  await expect(panel.getByText('Safari · macOS')).toBeVisible();
  await expect(panel.getByText('current-session-id-hidden')).toHaveCount(0);
  await expect(panel.getByText(/192\.0\.2\.1|198\.51\.100\.4/)).toHaveCount(0);

  expect(payloads[0]).toEqual({ p_user_agent: expect.any(String) });
  expect(payloads[0]).not.toHaveProperty('user_id');
  expect(payloads[0]).not.toHaveProperty('session_id');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
