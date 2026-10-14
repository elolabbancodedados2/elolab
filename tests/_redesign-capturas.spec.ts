// TEMPORÁRIO: captura todas as telas da clínica com a clínica sintética para revisar o redesign.
// Não faz parte da suíte. Pode ser apagado.
import { test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';
import { PROTECTED_ROUTES } from './helpers/protectedRoutes';

test.use({ serviceWorkers: 'block' });
test.setTimeout(30 * 60 * 1000);

const OUT = process.env.REDESIGN_SHOTS_DIR || 'redesign-shots';
const rotas = (process.env.REDESIGN_ROTAS?.split(',') ?? PROTECTED_ROUTES.filter(r => !r.startsWith('/admin') && r !== '/painel-admin'));

test('captura telas', async ({ page }) => {
  await installSyntheticClinic(page, { platformAdmin: false, appOrigin: 'http://127.0.0.1:4199' });
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const rota of rotas) {
    try {
      await page.goto(rota, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await page.waitForTimeout(1200);
      const nome = rota.replace(/^\//, '').replace(/[/?=&]/g, '_') || 'raiz';
      await page.screenshot({ path: `${OUT}/${nome}.png` });
    } catch (error) {
      console.log('falhou', rota, String(error).slice(0, 200));
    }
  }
});
