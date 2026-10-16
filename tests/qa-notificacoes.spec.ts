import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('agrupa alertas repetidos e abre a origem marcando o evento uma vez', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  const sourceId = '00000000-0000-4000-8000-0000000002a1';
  const readWrites: Array<Record<string, unknown>[]> = [];
  const occurrences = [
    {
      source_type: 'tarefa', source_id: sourceId, category: 'tarefas', severity: 'warning',
      title: 'Revisar retorno da paciente QA', message: 'Prazo venceu.',
      occurred_at: '2026-10-14T10:00:00.000Z', href: '/tarefas', is_read: false,
    },
    {
      source_type: 'tarefa', source_id: sourceId, category: 'tarefas', severity: 'warning',
      title: 'Revisar retorno da paciente QA', message: 'O prazo segue vencido.',
      occurred_at: '2026-10-14T10:01:00.000Z', href: '/tarefas', is_read: false,
    },
  ];

  await page.route('http://127.0.0.1:54321/rest/v1/rpc/central_notificacoes_usuario*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(occurrences) });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/user_notification_state*', async (route) => {
    if (route.request().method() === 'POST') {
      readWrites.push(route.request().postDataJSON() as Record<string, unknown>[]);
      await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.fallback();
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/notificacoes');
  await expect(page.getByText('2 ocorrências')).toBeVisible();
  await page.getByRole('button', { name: /Revisar retorno da paciente QA/ }).click();

  await expect(page).toHaveURL(/\/tarefas$/);
  await expect.poll(() => readWrites.length).toBe(1);
  expect(readWrites[0]).toHaveLength(1);
  expect(readWrites[0][0]).toMatchObject({
    clinica_id: synthetic.clinicId,
    user_id: synthetic.userId,
    source_type: 'tarefa',
    source_id: sourceId,
  });
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('mostra alerta técnico do webhook sem mensagem ou dados de paciente', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, platformAdmin: false });
  const alert = {
    source_type: 'alert', source_id: '00000000-0000-4000-8000-0000000002a2', category: 'alertas', severity: 'error',
    title: 'Falha no envio: Falha no webhook WhatsApp',
    message: 'Webhook de comunicação com falha. Código técnico: webhook_whatsapp_processing_failed.',
    occurred_at: '2026-10-14T10:00:00.000Z', href: '/automacoes', is_read: false,
  };
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/central_notificacoes_usuario*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([alert]) });
  });

  await page.goto('/notificacoes');
  await expect(page.getByRole('button', { name: /Falha no envio: Falha no webhook WhatsApp/ })).toBeVisible();
  await expect(page.getByText(alert.message)).toBeVisible();
  await expect(page.getByText(/Paciente QA|5551999999999|mensagem privada|diagnóstico clínico/i)).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
