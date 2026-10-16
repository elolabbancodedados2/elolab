import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('mostra snapshots e autoria preservada no histórico do modelo', async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin });
  const template = {
    id: '00000000-0000-4000-8000-000000000901',
    clinica_id: synthetic.clinicId,
    nome: 'Lembrete histórico QA',
    categoria: 'lembrete_consulta',
    assunto: 'Consulta {{paciente_nome}}',
    conteudo: '<p>Versão atual {{horario}}</p>',
    ativo: true,
    tipo: 'email',
    variaveis: ['paciente_nome', 'horario'],
  };
  const versions = [
    {
      id: '00000000-0000-4000-8000-000000000911', revision: 2, action: 'updated', actor_type: 'user',
      author_name: 'Admin QA', created_at: '2026-10-14T12:00:00.000Z',
      snapshot: { assunto: 'Consulta {{paciente_nome}}', conteudo: '<p>Versão atual {{horario}}</p>' },
    },
    {
      id: '00000000-0000-4000-8000-000000000912', revision: 1, action: 'baseline', actor_type: 'legacy',
      author_name: null, created_at: '2026-10-13T12:00:00.000Z',
      snapshot: { assunto: 'Assunto anterior', conteudo: '<p>Texto inicial.</p>' },
    },
  ];
  await page.route('http://127.0.0.1:54321/rest/v1/notification_templates*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([template]) });
  });
  await page.route('http://127.0.0.1:54321/rest/v1/notification_template_versions*', async route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('clinica_id')).toBe(`eq.${synthetic.clinicId}`);
    expect(url.searchParams.get('template_id')).toBe(`eq.${template.id}`);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(versions) });
  });

  await page.goto('/todos-templates?tab=email');
  await page.getByRole('button', { name: 'Histórico do modelo Lembrete histórico QA' }).click();
  await expect(page.getByRole('heading', { name: 'Histórico: Lembrete histórico QA' })).toBeVisible();
  await expect(page.getByText('Admin QA')).toBeVisible();
  await expect(page.getByText('Assunto anterior')).toBeVisible();
  await expect(page.getByText('Autor não registrado').first()).toBeVisible();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
