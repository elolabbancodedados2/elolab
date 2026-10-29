import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

const clinicId = '00000000-0000-4000-8000-000000000002';
const patientId = '00000000-0000-4000-8000-000000000004';

test('médico acessa pacientes, cadastra e edita a ficha clínica', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page, { role: 'medico', platformAdmin: false });
  const saved: Array<{ method: string; body: Record<string, unknown> }> = [];
  await page.route('**/rest/v1/pacientes*', async route => {
    const method = route.request().method();
    if (!['POST', 'PATCH'].includes(method)) return route.fallback();
    saved.push({ method, body: route.request().postDataJSON() });
    await route.fulfill({ json: { id: patientId, updated_at: new Date().toISOString() } });
  });
  await page.route('**/rest/v1/rpc/buscar_possiveis_duplicidades_paciente', route => route.fulfill({ json: [] }));

  await page.goto('/pacientes');
  await expect(page.getByRole('heading', { name: 'Pacientes', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Cadastro e histórico', exact: true })).toBeVisible();
  const main = page.locator('#main-content');
  await expect(main.getByRole('button', { name: /Inativar Pessoa|Excluir Pessoa/ })).toHaveCount(0);
  await main.getByRole('button', { name: 'Editar Pessoa Exemplo QA', exact: true }).click();
  let dialog = page.locator('#main-content');
  await dialog.getByLabel('Nome Completo').fill('Pessoa Clínica Atualizada');
  await dialog.getByLabel('CPF', { exact: true }).fill('');
  await dialog.getByLabel('Telefone', { exact: true }).fill('');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL(/\/pacientes$/);
  expect(saved).toContainEqual({ method: 'PATCH', body: expect.objectContaining({ nome: 'Pessoa Clínica Atualizada', clinica_id: clinicId }) });
  await expect(page.getByText('Paciente atualizado com sucesso', { exact: true })).toBeVisible();

  await main.getByRole('button', { name: 'Novo Paciente', exact: true }).click();
  dialog = page.locator('#main-content');
  await dialog.getByLabel('Nome Completo').fill('Paciente Novo do Médico');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL(/\/pacientes$/);
  expect(saved).toContainEqual({ method: 'POST', body: expect.objectContaining({ nome: 'Paciente Novo do Médico', clinica_id: clinicId }) });
  await expect(page.getByText('Paciente cadastrado com sucesso', { exact: true })).toBeVisible();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('médico consulta exames da clínica solicitados por outro profissional', async ({ page }) => {
  await installSyntheticClinic(page, { role: 'medico', platformAdmin: false });
  await page.route('**/rest/v1/exames*', async route => {
    const url = new URL(route.request().url());
    const otherDoctor = '00000000-0000-4000-8000-000000000099';
    const matches = url.searchParams.get('clinica_id') === `eq.${clinicId}`
      && (!url.searchParams.has('medico_solicitante_id') || url.searchParams.get('medico_solicitante_id') === `eq.${otherDoctor}`);
    await route.fulfill({ json: matches ? [{
      id: '00000000-0000-4000-9000-000000000091', clinica_id: clinicId,
      paciente_id: patientId, medico_solicitante_id: otherDoctor,
      tipo_exame: 'Exame de acompanhamento clínico QA', tipo_categorizado: 'Imagem',
      status: 'solicitado', data_solicitacao: '2026-10-16', resultado: null, arquivo_resultado: null,
      pacientes: { nome: 'Pessoa Exemplo QA', nome_social: null, cpf: null, telefone: null, email: null },
      medicos: { nome: 'Outra médica QA', crm: '000000', especialidade: 'Clínica geral' },
    }] : [] });
  });
  await page.goto('/exames');
  const main = page.locator('#main-content');
  await expect(main.getByText('Exame de acompanhamento clínico QA', { exact: true })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Nova Guia de Exames', exact: true })).toBeEnabled();
});

test('médico lê histórico assinado e edita apenas seu rascunho na ficha', async ({ page }) => {
  await installSyntheticClinic(page, { role: 'medico', platformAdmin: false });
  await page.route('**/rest/v1/prontuarios*', route => route.fulfill({ json: [
    { id: '00000000-0000-4000-9000-000000000092', paciente_id: patientId,
      medico_id: '00000000-0000-4000-8000-000000000099', data: '2026-10-16',
      queixa_principal: 'Histórico assinado por outra médica', assinado: true,
      medicos: { nome: 'Outra médica QA', crm: '000000' } },
    { id: '00000000-0000-4000-9000-000000000093', paciente_id: patientId,
      medico_id: '00000000-0000-4000-8000-000000000003', data: '2026-10-16',
      queixa_principal: 'Meu rascunho clínico', assinado: false,
      medicos: { nome: 'Medico QA', crm: '000000' } },
  ] }));
  await page.goto('/pacientes');
  await page.getByRole('button', { name: 'Ver detalhes de Pessoa Exemplo QA', exact: true }).click();
  const dialog = page.locator('#main-content');
  await expect(dialog.getByRole('tab', { name: 'Exames', exact: true })).toBeVisible();
  await dialog.getByRole('tab', { name: 'Prontuário', exact: true }).click();
  await dialog.getByText('Histórico assinado por outra médica', { exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '← Voltar', exact: true }).click();
  await dialog.getByText('Meu rascunho clínico', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Salvar', exact: true })).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'Financeiro', exact: true })).toHaveCount(0);
});

test('formulários clínicos da ficha usam o médico da sessão', async ({ page }) => {
  await installSyntheticClinic(page, { role: 'medico', platformAdmin: false });
  await page.route('**/rest/v1/medicos*', route => route.fulfill({ json: [
    { id: '00000000-0000-4000-8000-000000000003', nome: 'Médico da sessão', ativo: true, crm: '000000', clinica_id: clinicId },
    { id: '00000000-0000-4000-8000-000000000099', nome: 'Outro médico', ativo: true, crm: '000001', clinica_id: clinicId },
  ] }));
  await page.goto('/pacientes');
  await page.getByRole('button', { name: 'Ver detalhes de Pessoa Exemplo QA', exact: true }).click();
  const dialog = page.locator('#main-content');
  await dialog.getByRole('tab', { name: 'Consultas', exact: true }).click();
  await dialog.getByRole('button', { name: 'Agendar Consulta', exact: true }).click();
  await expect(dialog.getByRole('combobox').filter({ hasText: 'Médico da sessão' })).toBeDisabled();
  await dialog.getByRole('tab', { name: 'Exames', exact: true }).click();
  await dialog.getByRole('button', { name: 'Solicitar Exame', exact: true }).click();
  await expect(dialog.getByRole('combobox').filter({ hasText: 'Médico da sessão' })).toBeDisabled();
});
