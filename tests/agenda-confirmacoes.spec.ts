import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('filtra lembretes sem resposta e informa conflito no lote selecionado', async ({ page }, info) => {
  const synthetic = await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'recepcao' });
  const versao = '2026-11-03T10:00:00Z';
  const consultas = ['Ana', 'Bruno', 'Carla', 'Diego'].map((nome, index) => ({
    id: `00000000-0000-4000-9000-${String(index + 10).padStart(12, '0')}`,
    clinica_id: synthetic.clinicId, medico_id: '00000000-0000-4000-8000-000000000003',
    pacientes: { nome, telefone: null }, status: 'agendado', data: '2026-11-04', hora_inicio: '08:00:00', updated_at: versao,
  }));
  const updates: string[] = [];
  await page.route('**/rest/v1/agendamentos*', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: consultas });
    if (route.request().method() !== 'PATCH') return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('clinica_id')).toBe(`eq.${synthetic.clinicId}`);
    expect(params.get('updated_at')).toBe(`eq.${versao}`);
    expect(params.get('status')).toBe('eq.agendado');
    expect(route.request().postDataJSON()).toEqual({ status: 'confirmado' });
    const id = params.get('id')!.slice(3);
    updates.push(id);
    if (id === consultas[3].id) return route.fulfill({ json: null });
    consultas.find(a => a.id === id)!.status = 'confirmado';
    await route.fulfill({ json: { id } });
  });
  await page.route('**/rest/v1/notification_queue*', route => route.fulfill({ json: [0, 1, 3].map(index => ({
    id: `lembrete-${index}`, tipo: 'whatsapp', created_at: versao,
    status: 'enviado', enviado_em: versao, dados_extras: { agendamento_id: consultas[index].id, tipo_lembrete: '24h' },
  })) }));
  await page.route('**/rest/v1/whatsapp_agent_actions*', route => route.fulfill({ json: [{
    sucesso: true, tipo_acao: 'confirmar_presenca', created_at: '2026-11-03T11:00:00Z',
    dados_entrada: { agendamento_id: consultas[1].id }, dados_saida: { requires_confirmation: true },
  }] }));
  await page.goto('/agenda/confirmacoes');
  const pendentes = page.getByRole('region', { name: 'A confirmar', exact: true });
  await expect(pendentes.getByText('Respondeu', { exact: true })).toHaveCount(1);
  await expect(pendentes.getByText('Não enviado', { exact: true })).toHaveCount(1);
  await page.getByRole('checkbox', { name: 'Sem resposta', exact: true }).check();
  await expect(pendentes.getByRole('checkbox')).toHaveCount(2);
  await page.getByRole('checkbox', { name: 'Selecionar todas as consultas visíveis' }).check();
  await page.getByRole('button', { name: 'Confirmar selecionadas (2)' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Não confirmadas' })).toContainText('Diego: A consulta mudou');
  await expect(page.getByRole('region', { name: 'Confirmadas', exact: true })).toContainText('Ana');
  expect(updates).toEqual([consultas[0].id, consultas[3].id]);
});
