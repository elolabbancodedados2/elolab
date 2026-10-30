import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

const patientId = '00000000-0000-4000-8000-000000000004';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

test('FHIR export uses a protected page without putting clinical content in the URL', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'admin' });
  await page.route('**/functions/v1/fhir-export*', route => {
    expect(route.request().postDataJSON()).toEqual({ paciente_id: patientId });
    return route.fulfill({ json: { resourceType: 'Bundle', type: 'collection', entry: [{ resource: { resourceType: 'Patient', id: patientId } }] } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/interoperabilidade');

  await page.getByRole('combobox', { name: 'Paciente' }).click();
  await page.getByPlaceholder('Buscar paciente...').fill('Pessoa Exemplo QA');
  await page.getByRole('option', { name: /Pessoa Exemplo QA/ }).click();
  await page.getByRole('button', { name: 'Exportar JSON FHIR' }).click();

  await expect(page).toHaveURL('/interoperabilidade?workflow=proteger-exportacao');
  await expect(page.getByTestId('protected-clinical-export-page')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('paciente')).toBeNull();
  await page.screenshot({ path: info.outputPath('protected-export-mobile.png'), fullPage: true, animations: 'disabled' });

  await page.getByLabel('Senha de proteção').fill('SenhaSinteticaSegura123');
  await page.getByLabel('Confirme a senha').fill('SenhaSinteticaSegura123');
  await page.locator('main#main-content').evaluate(element => element.scrollTo(0, element.scrollHeight));
  const mobileSubmit = page.getByRole('button', { name: 'Baixar arquivo protegido' });
  const mobileSubmitBounds = await mobileSubmit.boundingBox();
  const bottomNavigation = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
  expect(mobileSubmitBounds).not.toBeNull();
  expect(bottomNavigation).not.toBeNull();
  expect(mobileSubmitBounds!.y + mobileSubmitBounds!.height).toBeLessThanOrEqual(bottomNavigation!.y);
  await page.screenshot({ path: info.outputPath('protected-export-mobile-action.png'), fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.locator('main#main-content').evaluate(element => element.scrollTo(0, 0));
  const title = await page.getByRole('heading', { name: 'Proteger arquivo clínico', exact: true }).boundingBox();
  expect(title).not.toBeNull();
  expect(title!.y).toBeGreaterThanOrEqual(140);
  await page.screenshot({ path: info.outputPath('protected-export-desktop.png'), fullPage: true, animations: 'disabled' });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar arquivo protegido' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe(`fhir-${patientId}.elolab`);
  await expect(page).toHaveURL('/interoperabilidade');
  await expect(page.getByRole('button', { name: 'Exportar JSON FHIR' })).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('reload without the in-memory clinical content shows a recoverable page', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'admin' });

  await page.goto('/interoperabilidade?workflow=proteger-exportacao');
  await expect(page.getByTestId('protected-export-expired')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Voltar à interoperabilidade' }).click();
  await expect(page).toHaveURL('/interoperabilidade');

  await page.goto('/prontuarios?workflow=proteger-exportacao');
  await expect(page.getByTestId('protected-export-expired')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Voltar ao prontuário' }).click();
  await expect(page).toHaveURL('/prontuarios');
});
