import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('nursing corrects a triage recorded today without creating another record', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(testInfo.project.use.baseURL), platformAdmin: false, role: 'enfermagem' } as any);
  const triageId = '00000000-0000-4000-9000-000000000501';
  const patches: Array<Record<string, unknown>> = [];
  let inserts = 0;
  await page.route('**/rest/v1/triagens**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{
        id: triageId, clinica_id: '00000000-0000-4000-8000-000000000002',
        paciente_id: '00000000-0000-4000-8000-000000000004', agendamento_id: null, enfermeiro_id: null,
        pressao_arterial: '120/80', frequencia_cardiaca: 82, frequencia_respiratoria: null, temperatura: 36.5,
        saturacao: 98, peso: null, altura: null, imc: null, glicemia: null, dor_escala: 2,
        queixa_principal: 'Cefaleia', classificacao_risco: 'verde', observacoes: null,
        data_hora: new Date().toISOString(), pacientes: { id: '00000000-0000-4000-8000-000000000004', nome: 'Pessoa Exemplo QA' },
      }]) });
    }
    if (request.method() === 'PATCH') {
      expect(new URL(request.url()).searchParams.get('id')).toBe(`eq.${triageId}`);
      patches.push(request.postDataJSON());
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: triageId }) });
    }
    if (request.method() === 'POST') inserts += 1;
    return route.fallback();
  });

  await page.goto(`/triagem/nova?corrigir=${triageId}&origem=triagem`);
  const main = page.locator('#main-content');
  await expect(main.getByRole('heading', { name: 'Corrigir triagem' })).toBeVisible();
  await expect(main.getByLabel('Pressão Arterial *')).toHaveValue('120/80');
  await expect(main.getByLabel('Temperatura')).toHaveValue('36,5');
  await main.getByLabel('Pressão Arterial *').fill('130/85');
  await main.getByRole('button', { name: 'Salvar correção' }).click();

  await expect(page.getByText('Triagem corrigida')).toBeVisible();
  await expect(page).toHaveURL('/fila?tab=triagem');
  expect(patches).toHaveLength(1);
  expect(patches[0]).toMatchObject({ pressao_arterial: '130/85', temperatura: 36.5, classificacao_risco: 'verde' });
  expect(patches[0]).not.toHaveProperty('paciente_id');
  expect(inserts).toBe(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
