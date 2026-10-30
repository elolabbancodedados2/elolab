import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
test.setTimeout(60_000);

const patientId = '00000000-0000-4000-8000-000000000004';
const clinicId = '00000000-0000-4000-8000-000000000002';
const insuranceId = '00000000-0000-4000-9000-000000000041';

for (const width of [1440, 390]) {
  test(`patient insurance authorizations use a page at ${width}px and keep clinic scope`, async ({ page }, info) => {
    const synthetic = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
    await page.setViewportSize({ width, height: 900 });
    const patient = {
      id: patientId,
      clinica_id: clinicId,
      nome: 'Pessoa Exemplo QA',
      nome_social: null,
      convenio_id: insuranceId,
      ativo: true,
      alergias: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    let authorizations: Record<string, unknown>[] = [];
    let writes = 0;

    await page.route('**/rest/v1/pacientes*', async route => {
      if (route.request().method() === 'GET') {
        const url = new URL(route.request().url());
        if (url.searchParams.has('id')) {
          expect([`eq.${patientId}`, `in.(${patientId})`]).toContain(url.searchParams.get('id'));
          expect(url.searchParams.get('clinica_id')).toBe(`eq.${clinicId}`);
        }
        return route.fulfill({ json: [patient] });
      }
      return route.fallback();
    });
    await page.route('**/rest/v1/convenios*', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: [{ id: insuranceId, nome: 'Convênio QA', telefone: null, email: 'qa@example.test', carencia: 0, ativo: true }] });
      return route.fallback();
    });
    await page.route('**/rest/v1/autorizacoes_convenio*', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: authorizations });
      return route.fallback();
    });
    await page.route('**/rest/v1/rpc/registrar_visualizacao_historico_paciente*', route => route.fulfill({ json: 1 }));
    await page.route('**/rest/v1/rpc/solicitar_autorizacao_convenio*', async route => {
      writes += 1;
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({
        p_paciente_id: patientId,
        p_convenio_id: insuranceId,
        p_tipo_servico: 'consulta',
        p_descricao: 'Consulta especializada',
      });
      authorizations = [{
        id: '00000000-0000-4000-9000-000000000042',
        paciente_id: patientId,
        convenio_id: insuranceId,
        descricao: body.p_descricao,
        status: 'pendente',
        data_solicitacao: new Date().toISOString(),
        data_autorizacao: null,
        data_expiracao: null,
        numero_autorizacao: null,
        observacoes: body.p_observacoes,
        convenios: { nome: 'Convênio QA', telefone: null },
      }];
      return route.fulfill({ json: { email_enfileirado: true } });
    });

    await page.goto(`/pacientes?paciente=${patientId}&tab=dados`);
    await expect(page.getByRole('heading', { name: 'Ficha do Paciente' })).toBeVisible();
    await page.getByRole('button', { name: 'Gerenciar', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/pacientes/${patientId}/autorizacoes$`));
    await expect(page.getByRole('heading', { name: 'Autorizações do convênio' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`patient-insurance-authorizations-${width}.png`), fullPage: true });

    await page.getByRole('button', { name: 'Solicitar Autorização' }).click();
    await page.getByLabel('Descrição do Procedimento').fill('Consulta especializada');
    await page.screenshot({ path: info.outputPath(`patient-insurance-request-form-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Enviar Solicitação' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`patient-insurance-request-actions-${width}.png`) });
    await page.getByRole('button', { name: 'Enviar Solicitação' }).click();
    await expect(page.getByText('Convênio QA', { exact: true })).toBeVisible();
    await expect(page.getByText('Pendente', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Voltar ao paciente' }).click();
    await expect(page).toHaveURL(new RegExp(`/pacientes/${patientId}\\?tab=dados$`));
    expect(writes).toBe(1);
    expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  });
}
