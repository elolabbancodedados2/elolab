import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const pair = {
  paciente_a: '00000000-0000-4000-8000-000000000141',
  nome_a: 'Ana Lima QA',
  nascimento_a: '1985-05-12',
  telefone_final_a: null,
  paciente_b: '00000000-0000-4000-8000-000000000142',
  nome_b: 'Ana Lima QA',
  nascimento_b: '1985-05-12',
  telefone_final_b: null,
  pontuacao: 100,
  motivos: ['cpf'],
};

test('patient list opens duplicate review and preserves the return destination', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await page.route('**/rest/v1/rpc/listar_duplicidades_pacientes*', route => route.fulfill({ json: [] }));
  await page.goto('/pacientes');
  await expect(page.getByRole('heading', { name: 'Pacientes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Revisar duplicidades' }).click();
  await expect(page).toHaveURL(/\/pacientes\/duplicidades$/);
  await page.getByRole('link', { name: 'Voltar a pacientes' }).click();
  await expect(page).toHaveURL(/\/pacientes$/);
});

for (const width of [1440, 390]) {
  test(`patient duplicate review uses page and dedicated confirmation at ${width}px`, async ({ page }, info) => {
    const synthetic = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
    await page.setViewportSize({ width, height: 900 });
    let mergeWrites = 0;

    await page.route('**/rest/v1/rpc/listar_duplicidades_pacientes*', route => route.fulfill({ json: [pair] }));
    await page.route('**/rest/v1/pacientes*', async route => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [
        { id: pair.paciente_a, nome: pair.nome_a, cpf: '11111111111', created_at: '2024-01-01T00:00:00Z' },
        { id: pair.paciente_b, nome: pair.nome_b, cpf: '22222222222', created_at: '2024-02-01T00:00:00Z' },
      ] });
    });
    await page.route('**/rest/v1/rpc/mesclar_pacientes*', async route => {
      mergeWrites += 1;
      expect(route.request().postDataJSON()).toMatchObject({
        p_origem: pair.paciente_b,
        p_destino: pair.paciente_a,
        p_motivo: 'Mesmo cadastro confirmado pela recepção.',
      });
      return route.fulfill({ json: { mesclagem_id: '00000000-0000-4000-9000-000000000145', agendamentos_movidos: 1, lista_espera_movida: 0 } });
    });

    await page.goto('/pacientes/duplicidades');
    await expect(page.getByRole('heading', { name: 'Revisar cadastros duplicados' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`patient-duplicates-list-${width}.png`), fullPage: true });

    await page.locator('#main-content').getByRole('button', { name: 'Revisar' }).click();
    await expect(page.getByText('Ficha que permanece ativa')).toBeVisible();
    await page.getByLabel('Motivo da mesclagem').fill('Mesmo cadastro confirmado pela recepção.');
    const mergeButton = page.getByRole('button', { name: 'Mesclar cadastros' });
    await mergeButton.scrollIntoViewIfNeeded();
    const mergeButtonBox = await mergeButton.boundingBox();
    const mobileNavigationTop = width <= 640 ? await page.evaluate(() => {
      const nav = [...document.querySelectorAll('nav')]
        .filter(element => getComputedStyle(element).position === 'fixed')
        .map(element => element.getBoundingClientRect())
        .find(rect => rect.bottom >= innerHeight - 2);
      return nav?.top ?? innerHeight;
    }) : Infinity;
    expect(mergeButtonBox).not.toBeNull();
    expect(mergeButtonBox!.y + mergeButtonBox!.height).toBeLessThanOrEqual(mobileNavigationTop);
    await page.screenshot({ path: info.outputPath(`patient-duplicates-review-${width}.png`) });
    await mergeButton.click();
    const confirmation = page.getByRole('alertdialog');
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toHaveCSS('opacity', '1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`patient-duplicates-confirm-${width}.png`) });
    expect(mergeWrites).toBe(0);
    await page.getByRole('button', { name: 'Confirmar mesclagem' }).click();
    await expect(page.getByText('Cadastros mesclados')).toBeVisible();
    expect(mergeWrites).toBe(1);
    expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  });
}
