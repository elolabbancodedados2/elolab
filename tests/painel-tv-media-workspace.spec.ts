import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('gerencia as mídias do painel TV em uma página própria', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  const media = [
    { id: 'media-1', tipo: 'imagem', nome: 'Orientações de atendimento.png', url: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2280%22 viewBox=%220 0 120 80%22%3E%3Crect width=%22120%22 height=%2280%22 fill=%22%23eaf2ff%22/%3E%3Cpath d=%22M20 60 48 30l18 18 14-14 20 26Z%22 fill=%22%231456c0%22/%3E%3C/svg%3E', duracao_exibicao: 10, ordem: 0, ativo: true },
    { id: 'media-2', tipo: 'video', nome: 'Campanha de vacinação.mp4', url: 'https://media.invalid/campanha.mp4', duracao_exibicao: 10, ordem: 1, ativo: false },
  ];
  const writes: Array<{ method: string; url: string; body: unknown }> = [];
  await page.route('http://127.0.0.1:54321/rest/v1/tv_panel_media*', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(media) });
      return;
    }
    writes.push({ method: route.request().method(), url: route.request().url(), body: route.request().postDataJSON() });
    media[1].ativo = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'media-2' }) });
  });

  await page.goto('/painel-tv/midias');
  await expect(page.getByRole('heading', { name: 'Mídias do Painel TV' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Orientações de atendimento.png')).toBeVisible();
  await expect(page.getByText('Campanha de vacinação.mp4')).toBeVisible();

  await page.getByRole('switch', { name: 'Exibir Campanha de vacinação.mp4 no painel' }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].method).toBe('PATCH');
  expect(new URL(writes[0].url).searchParams.get('id')).toBe('eq.media-2');
  expect(new URL(writes[0].url).searchParams.get('clinica_id')).toBe(`eq.${synthetic.clinicId}`);
  expect(writes[0].body).toEqual({ ativo: true });
  await expect(page.getByText('Ativa', { exact: true })).toBeVisible();

  await page.screenshot({ path: 'test-results/painel-tv-midias-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Mídias do Painel TV' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Voltar ao painel' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Voltar ao painel' })).toBeInViewport();
  await page.screenshot({ path: 'test-results/painel-tv-midias-mobile.png', fullPage: true });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
