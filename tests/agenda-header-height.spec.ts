import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('doctor headers contain occupancy and free-slot action without clipping', async ({ page }, info) => {
  await page.clock.install({ time: new Date('2026-10-29T08:00:00-03:00') });
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  const doctors = ['Alex', 'Marina', 'Joana'].map((name, index) => ({
    id: `00000000-0000-4000-8000-00000000000${index + 3}`,
    nome: `Dr(a). ${name} Profissional QA`, especialidade: 'Clínica geral',
    crm: `00000${index}`, ativo: true, clinica_id: synthetic.clinicId,
  }));
  await page.route('**/rest/v1/medicos*', route => route.fulfill({ json: doctors }));
  await page.route('**/rest/v1/medico_disponibilidade*', route => route.fulfill({ json: doctors.map(doctor => ({
    medico_id: doctor.id, hora_inicio: '08:00:00', hora_fim: '18:00:00',
  })) }));
  for (const width of [1920, 1440, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/agenda?data=2026-10-29&view=daily');
    const strip = page.getByTestId('agenda-doctor-header-strip');
    await expect(strip.getByRole('progressbar')).toHaveCount(3);
    await strip.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`agenda-header-${width}.png`) });
    for (const header of await strip.getByTestId('agenda-doctor-header').all()) {
      const action = header.getByRole('button', { name: /Criar consulta na próxima vaga livre/ });
      await expect(action).toBeVisible();
      const headerBox = await header.boundingBox();
      const actionBox = await action.boundingBox();
      expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(headerBox!.y + headerBox!.height);
      expect(await header.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
    }
    expect(await strip.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
    const grid = page.getByTestId('agenda-day-grid');
    await grid.evaluate(element => { element.scrollLeft = 300; element.dispatchEvent(new Event('scroll')); });
    expect(await strip.evaluate(element => element.scrollLeft)).toBe(await grid.evaluate(element => element.scrollLeft));
  }
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(page.getByTestId('agenda-doctor-header-strip')).toBeHidden();
  await expect(page.getByText('Nenhuma consulta neste dia', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
