import { assertEquals } from 'jsr:@std/assert@1';
import { podeAcessarRelato, validarAtualizacaoRelato, validarDecisaoRetificacao, validarNovoRelato, validarPedidoRetificacao } from './core.ts';

Deno.test('valida categorias, severidade, campos obrigatórios e limites sem aceitar campos extras', () => {
  const now = Date.parse('2026-10-14T10:35:00-03:00');
  const valid = validarNovoRelato({
    category: 'near_miss', severity: 'moderate', occurred_at: '2026-10-14T10:30:00-03:00',
    location_label: 'Sala 2', summary: 'Equipamento quase foi utilizado sem revisão.',
    immediate_action: 'Equipamento retirado de uso e equipe avisada.', reporter_confidential: true,
  }, now);
  assertEquals(valid.ok, true);
  assertEquals(validarAtualizacaoRelato({
    status: 'action_required', assigned_to: null, due_at: null, expected_updated_at: '2026-10-14T12:00:00Z',
    review_note: 'Sem responsável definido.', corrective_action: 'Nenhuma ação registrada.',
  }).ok, false);
  if (!valid.ok) throw new Error('relato válido foi rejeitado');
  assertEquals(valid.value.reporter_confidential, true);
  const optional = validarNovoRelato({ category: 'other', severity: 'low', occurred_at: '2026-10-14T10:30:00-03:00', summary: 'Descrição de evento sem identificação.' }, now);
  if (!optional.ok) throw new Error('campos opcionais vazios foram rejeitados');
  assertEquals(optional.value.location_label, '');
  assertEquals(optional.value.immediate_action, '');
  assertEquals(validarNovoRelato({ category: 'other', severity: 'critical', occurred_at: '2026-10-14T10:30:00-03:00', summary: 'x'.repeat(4001) }, now).ok, false);
  assertEquals(validarNovoRelato({ category: 'made_up', severity: 'low', occurred_at: '2026-10-14T10:30:00-03:00', summary: 'Texto de teste válido.' }, now).ok, false);
  assertEquals(validarNovoRelato({ category: 'other', severity: 'critical', occurred_at: '2026-10-14T10:30:00-03:00', summary: 'Texto de teste válido.', patient_id: 'sensitive' }, now).ok, false);
  assertEquals(validarNovoRelato({ category: 'other', severity: 'critical', occurred_at: '2050-01-01T00:00:00Z', summary: 'Texto de teste válido.' }, now).ok, false);
});

Deno.test('apenas admin da mesma clínica ou relator consulta detalhe; atualização interna é só de admin', () => {
  const report = { clinic_id: 'clinic-a', reporter_user_id: 'user-nurse', reporter_confidential: true };
  assertEquals(podeAcessarRelato({ user_id: 'admin-a', clinic_id: 'clinic-a', roles: ['admin'] }, report), true);
  assertEquals(podeAcessarRelato({ user_id: 'user-nurse', clinic_id: 'clinic-a', roles: ['enfermagem'] }, report), true);
  assertEquals(podeAcessarRelato({ user_id: 'doctor-b', clinic_id: 'clinic-b', roles: ['admin'] }, report), false);
  assertEquals(podeAcessarRelato({ user_id: 'other-nurse', clinic_id: 'clinic-a', roles: ['enfermagem'] }, report), false);
});

Deno.test('valida responsável, prazo, nota de análise e versão esperada antes da revisão', () => {
  const valid = validarAtualizacaoRelato({
    status: 'action_required', assigned_to: '00000000-0000-4000-8000-000000000003',
    due_at: '2026-10-20T12:00:00Z', expected_updated_at: '2026-10-14T12:00:00Z',
    review_note: 'Revisão inicial concluída.', corrective_action: 'Revisar checklist de abertura.',
  });
  assertEquals(valid.ok, true);
  assertEquals(validarAtualizacaoRelato({
    status: 'invented', assigned_to: 'outside-clinic', due_at: null, expected_updated_at: 'bad-date',
    review_note: 'ok', corrective_action: '', patient_id: 'forbidden',
  }).ok, false);
});

Deno.test('valida pedido de retificação e decisão versionada sem aceitar campos extras', () => {
  const request = validarPedidoRetificacao({
    proposed_summary: 'Correção do relato preservando a versão que foi enviada inicialmente.',
    proposed_immediate_action: '', reason: 'Corrigi a sequência dos fatos descrita no protocolo.',
  });
  assertEquals(request.ok, true);
  assertEquals(validarPedidoRetificacao({ proposed_summary: 'curto', reason: 'ok', patient_id: 'forbidden' }).ok, false);
  assertEquals(validarDecisaoRetificacao({ status: 'approved', expected_report_updated_at: '2026-10-14T12:00:00Z', review_note: 'Correção conferida e aprovada.' }).ok, true);
  assertEquals(validarDecisaoRetificacao({ status: 'approved', expected_report_updated_at: 'invalid', review_note: 'ok' }).ok, false);
});
