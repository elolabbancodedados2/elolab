import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('fila de notificações mostra próxima tentativa e resumo sem dados privados', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  let selectedColumns = '';
  const rawSecret = 'BREVO_API_KEY=super-secret-token; diagnóstico confidencial: conteúdo privado';

  await page.route('http://127.0.0.1:54321/rest/v1/notification_queue*', async (route) => {
    selectedColumns = new URL(route.request().url()).searchParams.get('select') || '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: '00000000-0000-4000-8000-000000000401', tipo: 'email',
        destinatario_nome: 'Paciente QA', destinatario_email: 'paciente@example.test',
        destinatario_telefone: '+5511999999999', assunto: 'Assunto clínico privado', conteudo: 'Conteúdo clínico privado',
        status: 'pendente', tentativas: 2, max_tentativas: 3, erro_mensagem: rawSecret,
        agendado_para: '2026-10-14T14:30:00.000Z', created_at: '2026-10-14T14:00:00.000Z',
      }]),
    });
  });

  await page.goto('/automacoes?tab=fila');
  await expect(page.getByRole('heading', { name: 'Últimos envios' })).toBeVisible();
  await expect(page.getByText('Próxima tentativa / agendado')).toBeVisible();
  await expect(page.getByText('2/3', { exact: true })).toBeVisible();
  await expect(page.getByText('Falha no processamento do envio. Consulte o suporte da clínica.')).toBeVisible();
  await expect(page.getByText(/super-secret-token|diagnóstico confidencial|Conteúdo clínico privado|Assunto clínico privado|paciente@example.test|9999999999/)).toHaveCount(0);
  expect(selectedColumns).not.toMatch(/conteudo|assunto|destinatario_email|destinatario_telefone/);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
