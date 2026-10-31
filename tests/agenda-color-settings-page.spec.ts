import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('esquema de cores da agenda tem página própria e preserva retorno à visão atual', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL) });
  const writes: Array<Record<string, unknown>> = [];
  await page.route('**/rest/v1/configuracoes_clinica*', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/agenda?data=2026-10-30&view=weekly', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Mais opções da agenda' }).click();
  await page.getByRole('menuitem', { name: /Esquema de cores/ }).click();
  await expect(page).toHaveURL('/agenda/configurar-cores');
  await expect(page.getByRole('heading', { name: 'Personalizar cores da agenda' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('agenda-color-settings-desktop.png'), fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('agenda-color-settings-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.locator('#main-content').evaluate(element => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }));
  const [saveButtonBox, mobileNavigationBox] = await Promise.all([
    page.getByRole('button', { name: 'Salvar cores' }).boundingBox(),
    page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox(),
  ]);
  expect(saveButtonBox && mobileNavigationBox && saveButtonBox.y + saveButtonBox.height <= mobileNavigationBox.y).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('agenda-color-settings-mobile-actions.png'), animations: 'disabled' });

  const navyForScheduled = page.getByRole('button', { name: 'Usar Azul-marinho para Agendado' });
  await navyForScheduled.click();
  await expect(navyForScheduled).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Salvar cores' }).click();
  await expect(page.getByRole('status')).toContainText('Esquema de cores salvo');
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    chave: 'agenda_color_scheme',
    user_id: synthetic.userId,
    valor: { criterion: 'status', map: { agendado: 'hsl(var(--brand-dark))' } },
  });

  await page.getByRole('button', { name: 'Voltar à agenda' }).click();
  await expect(page).toHaveURL('/agenda?data=2026-10-30&view=weekly');
  await page.getByRole('button', { name: 'Mais opções da agenda' }).click();
  await page.getByRole('menuitem', { name: /Definir visão atual como padrão/ }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1]).toMatchObject({
    chave: 'agenda_default_view',
    user_id: synthetic.userId,
    valor: { view: 'weekly' },
  });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('esquema de cores mantém escolhas em caso de falha e protege saída sem salvar', async ({ page }, testInfo) => {
  await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL) });
  let attempts = 0;
  await page.route('**/rest/v1/configuracoes_clinica*', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Falha sintética de gravação' }) });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/agenda', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Mais opções da agenda' }).click();
  await page.getByRole('menuitem', { name: /Esquema de cores/ }).click();
  await page.getByRole('button', { name: 'Usar Azul-marinho para Agendado' }).click();
  await page.getByRole('button', { name: 'Salvar cores' }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível salvar');
  await expect(page.getByRole('button', { name: 'Usar Azul-marinho para Agendado' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Voltar à agenda' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Sair sem salvar' }).click();
  // Sem data na URL a agenda abre no dia de hoje.
  await expect(page).toHaveURL(/\/agenda\?data=\d{4}-\d{2}-\d{2}&view=daily$/);
  expect(attempts).toBe(1);
});
