import { buildDailySummaryEmail, dailySummaryDue, dailySummaryRecipient, dailySummarySections } from './dailySummary.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('sections follow the same role boundaries as the app screens', () => {
  const financeiro = dailySummarySections(new Set(['financeiro']));
  assert(!financeiro.agenda && !financeiro.exames && financeiro.contas && financeiro.tarefas, 'Finance sees receivables and tasks only.');
  const medico = dailySummarySections(new Set(['medico']));
  assert(medico.agenda && medico.exames && !medico.contas && medico.proprioMedico, 'Doctor sees own agenda and exams, never receivables.');
  const enfermagem = dailySummarySections(new Set(['enfermagem', 'medico']));
  assert(enfermagem.exames && !enfermagem.proprioMedico, 'Nursing keeps clinic-wide exam scope.');
  const recepcao = dailySummarySections(new Set(['recepcao']));
  assert(recepcao.agenda && !recepcao.exames && !recepcao.contas, 'Reception sees agenda only.');
  const admin = dailySummarySections(new Set(['admin']));
  assert(admin.agenda && admin.exames && admin.contas && !admin.proprioMedico, 'Admin sees every section clinic-wide.');
});

Deno.test('only the opted-in user, active in the same clinic, with an e-mail, receives the summary', () => {
  const pref = { user_id: 'u1', clinica_id: 'c1', email_daily_summary: true };
  assert(dailySummaryRecipient(pref, { id: 'u1', clinica_id: 'c1', ativo: true, email: ' Ana@Clinica.com ' }) === 'ana@clinica.com', 'Own normalized e-mail.');
  assert(dailySummaryRecipient({ ...pref, email_daily_summary: false }, { id: 'u1', clinica_id: 'c1', ativo: true, email: 'a@b.com' }) === null, 'Without opt-in nothing is sent.');
  assert(dailySummaryRecipient(pref, { id: 'u1', clinica_id: 'c2', ativo: true, email: 'a@b.com' }) === null, 'Another clinic is refused.');
  assert(dailySummaryRecipient(pref, { id: 'u1', clinica_id: 'c1', ativo: false, email: 'a@b.com' }) === null, 'Inactive profile is refused.');
  assert(dailySummaryRecipient(pref, { id: 'u2', clinica_id: 'c1', ativo: true, email: 'a@b.com' }) === null, 'Another user is refused.');
  assert(dailySummaryRecipient(pref, { id: 'u1', clinica_id: 'c1', ativo: true, email: 'invalido' }) === null, 'Invalid e-mail is refused.');
});

Deno.test('summary is due once per Sao Paulo day from 7h', () => {
  const before = dailySummaryDue(new Date('2026-10-24T09:59:00Z'));
  assert(!before.due && before.today === '2026-10-24', 'Before 7h in Sao Paulo it waits.');
  const after = dailySummaryDue(new Date('2026-10-24T10:00:00Z'));
  assert(after.due && after.today === '2026-10-24', 'From 7h in Sao Paulo it is due.');
  const lateUtc = dailySummaryDue(new Date('2026-10-25T02:00:00Z'));
  assert(lateUtc.today === '2026-10-24', 'Uses the local day, not the UTC day.');
});

Deno.test('e-mail has counts only, escapes names and omits sections the role cannot see', () => {
  const email = buildDailySummaryEmail({
    nome: '<b>Ana</b>', clinica: 'Clínica & Cia', data: '2026-10-24', appUrl: 'https://app.elolab.com.br',
    counts: { tarefas: 3, agenda: 5, contas: null, exames: null },
  });
  assert(email.html.includes('&lt;b&gt;Ana&lt;/b&gt;') && !email.html.includes('<b>Ana</b>'), 'Names are escaped.');
  assert(email.html.includes('Clínica &amp; Cia'), 'Clinic name is escaped.');
  assert(email.html.includes('5') && email.html.includes('3'), 'Counts are present.');
  assert(!email.html.includes('Contas a receber vencidas') && !email.html.includes('Exames'), 'Hidden sections are omitted.');
  assert(email.subject.includes('24/10/2026'), 'Subject carries the local date.');
  assert(email.text.includes('Tarefas abertas atribuídas a você: 3'), 'Plain text is provided.');
});
