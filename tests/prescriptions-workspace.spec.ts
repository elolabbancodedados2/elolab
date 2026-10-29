import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('histórico de prescrições mantém medicamento visível no mobile e filtros operacionais', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, role: 'admin', platformAdmin: false });
  const prescriptions: Array<Record<string, unknown>> = [
    {
      id: '00000000-0000-4000-8000-000000000901',
      paciente_id: '00000000-0000-4000-8000-000000000904',
      medico_id: '00000000-0000-4000-8000-000000000903',
      data_emissao: '2026-10-29',
      medicamento: 'Amoxicilina 500 mg',
      posologia: 'Tomar 1 cápsula a cada 8 horas por 7 dias',
      arquivo_pdf: 'prescricoes/qa/amoxicilina.pdf',
      observacoes: null,
      pacientes: { nome: 'Paciente Sintético', nome_social: null, cpf: '00000000000', telefone: null, email: null },
    },
    {
      id: '00000000-0000-4000-8000-000000000902',
      paciente_id: '00000000-0000-4000-8000-000000000905',
      medico_id: '00000000-0000-4000-8000-000000000903',
      data_emissao: '2026-10-20',
      medicamento: 'Losartana 50 mg',
      posologia: 'Tomar 1 comprimido pela manhã',
      arquivo_pdf: null,
      observacoes: null,
      pacientes: { nome: 'Outra Pessoa QA', nome_social: null, cpf: '11111111111', telefone: null, email: null },
    },
  ];
  let failPrescriptions = false;
  let holdInitialPrescriptionsRead = true;
  let releaseInitialPrescriptionsRead: (() => void) | null = null;
  let notifyInitialPrescriptionsRead: (() => void) | null = null;
  const initialReadGate = new Promise<void>(resolve => { releaseInitialPrescriptionsRead = resolve; });
  const initialReadStarted = new Promise<void>(resolve => { notifyInitialPrescriptionsRead = resolve; });

  await page.route('http://127.0.0.1:54321/rest/v1/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (route.request().method() === 'GET' && path.endsWith('/prescricoes')) {
      if (holdInitialPrescriptionsRead) {
        holdInitialPrescriptionsRead = false;
        notifyInitialPrescriptionsRead?.();
        await initialReadGate;
      }
      if (failPrescriptions) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Falha sintética de leitura' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(prescriptions) });
      return;
    }
    if (route.request().method() === 'GET' && path.endsWith('/medicos')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
        id: '00000000-0000-4000-8000-000000000903', nome: 'Dra. Marina Ribeiro', crm: '000000',
        tipo_registro: 'CRM', crm_uf: 'SP', ativo: true, clinica_id: synthetic.clinicId,
      }]) });
      return;
    }
    if (route.request().method() === 'GET' && path.endsWith('/configuracoes_clinica')) {
      const chave = url.searchParams.get('chave');
      const valor = chave === 'eq.config_clinica' ? { nomeClinica: 'Clínica QA' } : {};
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ valor }) });
      return;
    }
    await route.fallback();
  });

  await page.setViewportSize({ width: 390, height: 844 });
  const navigation = page.goto('/prescricoes');
  await initialReadStarted;
  await expect(page.locator('div.animate-pulse.rounded-md').first()).toBeVisible();
  releaseInitialPrescriptionsRead?.();
  await navigation;
  await expect(page.getByRole('heading', { name: 'Prescrições' })).toBeVisible();
  await expect(page.getByText('Paciente Sintético')).toBeVisible();
  await expect(page.locator('p').filter({ hasText: 'Amoxicilina 500 mg' })).toBeVisible();
  await page.getByRole('heading', { name: 'Prescrições' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('prescriptions-mobile-summary.png'), animations: 'disabled' });
  await page.getByRole('row').filter({ hasText: 'Paciente Sintético' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('prescriptions-mobile.png'), animations: 'disabled' });
  await expect(page.getByRole('button', { name: /Sem PDF/ })).toBeVisible();
  const semPdfFilter = page.getByRole('button', { name: 'Filtrar: Sem PDF, 1 receita' });
  await semPdfFilter.focus();
  await page.keyboard.press('Enter');
  await expect(semPdfFilter).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Outra Pessoa QA')).toBeVisible();
  await expect(page.getByText('Paciente Sintético')).toHaveCount(0);

  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole('heading', { name: 'Prescrições' }).scrollIntoViewIfNeeded();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320);
  await page.screenshot({ path: testInfo.outputPath('prescriptions-320.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(page.getByRole('heading', { name: 'Prescrições' })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Filtrar: Total, 2 receitas' }).click();
  await expect(page.getByRole('columnheader', { name: 'Medicamento' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('prescriptions-desktop.png'), fullPage: true, animations: 'disabled' });

  prescriptions.length = 0;
  await page.getByRole('button', { name: 'Atualizar prescrições' }).click();
  await expect(page.getByText('Nenhuma prescrição')).toBeVisible();
  failPrescriptions = true;
  await page.getByRole('button', { name: 'Atualizar prescrições' }).click();
  await expect(page.getByRole('heading', { name: 'Não foi possível carregar prescrições' })).toBeVisible();
  failPrescriptions = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('Nenhuma prescrição')).toBeVisible();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
