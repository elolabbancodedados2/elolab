import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
const clinicId = '00000000-0000-4000-8000-000000000002';
const patientId = '00000000-0000-4000-8000-000000000004';
const appointmentId = '00000000-0000-4000-8000-000000000077';
const token = 'a'.repeat(64);

for (const tokenLocation of ['query', 'fragment']) {
  test(`link ${tokenLocation} confirma nascimento, lembra aparelho e sinaliza chegada`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), authenticated: false });
    await page.clock.install({ time: new Date('2026-11-03T12:30:00Z') });
    let arrival: string | null = null;
    let challenges = 0;
    const requests: Record<string, unknown>[] = [];
    await page.route('**/functions/v1/patient-portal', async route => {
      const body = route.request().postDataJSON(); requests.push(body);
      if (body.action === 'get_profile') {
        if (!body.device_proof) { challenges++; return route.fulfill({ json: { requires_birth_date: true, clinica_telefone: '11999990000' } }); }
        return route.fulfill({ json: { id: patientId, nome: 'Ana Portal', cpf: '***.***.***-09', clinica_telefone: '11999990000' } });
      }
      if (body.action === 'verify_device') {
        expect(body.data_nascimento).toBe('1990-01-02');
        return route.fulfill({ json: { device_proof: 'comprovante-sintetico-assinado' } });
      }
      expect(body.device_proof).toBe('comprovante-sintetico-assinado');
      if (body.action === 'online_checkin') { arrival = body.sinal; return route.fulfill({ json: { success: true, portal_checkin_status: arrival } }); }
      if (body.action === 'get_agendamentos') return route.fulfill({ json: [{ id: appointmentId, data: '2026-11-03', hora_inicio: '10:00:00', tipo: 'Consulta', status: 'confirmado', portal_checkin_status: arrival }] });
      return route.fulfill({ json: [] });
    });
    const url = `/portal-paciente${tokenLocation === 'query' ? '?' : '#'}token=${token}`;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url);
    await expect(page.getByLabel('Data de nascimento')).toBeVisible();
    expect(requests.some(r => r.action === 'get_agendamentos')).toBe(false);
    expect(page.url()).not.toContain(token);
    await page.getByLabel('Data de nascimento').fill('1990-01-02');
    await page.getByRole('button', { name: 'Confirmar e acessar' }).click();
    await expect(page.getByRole('button', { name: 'Próxima consulta', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exames e receitas', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Falar com a clínica', exact: true })).toHaveAttribute('href', /wa\.me\/5511999990000/);
    expect(await page.getByRole('button', { name: 'Próxima consulta', exact: true }).evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await page.getByRole('button', { name: 'Estou a caminho' }).click();
    await expect(page.getByText('A caminho', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cheguei', exact: true }).click();
    await expect(page.getByText('Aguardando confirmação do balcão', { exact: true })).toBeVisible();
    expect(requests.filter(r => r.action === 'online_checkin').map(r => r.sinal)).toEqual(['a_caminho', 'chegou']);
    await page.screenshot({ path: info.outputPath('portal-chegada-mobile.png'), fullPage: true });
    await page.goto(url);
    await expect(page.getByText('Aguardando confirmação do balcão', { exact: true })).toBeVisible();
    expect(challenges).toBe(1);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(token);
    await page.getByRole('button', { name: 'Sair do portal do paciente' }).click();
    expect(await page.evaluate(() => localStorage.getItem('elolab_portal_aparelho_v1'))).toBeNull();
  });
}

test('ficha admin mostra duplicidade e abre comparação das duas fichas', async ({ page }, info) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'admin' });
  const duplicateId = '00000000-0000-4000-8000-000000000088';
  const patient = { id: patientId, clinica_id: clinicId, nome: 'Pessoa Exemplo QA', ativo: true, data_nascimento: '1990-01-02', telefone: '11999990000' };
  const duplicate = { ...patient, id: duplicateId, nome: 'Ana Duplicada QA' };
  await page.route('**/rest/v1/pacientes*', route => {
    const id = new URL(route.request().url()).searchParams.get('id');
    return route.fulfill({ json: id?.startsWith('in.') ? [patient, duplicate] : patient });
  });
  await page.route('**/rest/v1/rpc/buscar_possiveis_duplicidades_paciente', route => route.fulfill({ json: [{ ...duplicate, motivos: ['telefone'] }] }));
  await page.goto(`/pacientes/${patientId}`);
  await expect(page.getByText('Possível duplicado de Ana Duplicada QA')).toBeVisible();
  await page.getByRole('button', { name: 'Comparar e mesclar' }).click();
  await expect(page).toHaveURL('/pacientes/duplicidades');
  await expect(page.getByText('Ana Duplicada QA', { exact: true })).toBeVisible();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
