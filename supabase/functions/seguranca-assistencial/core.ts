export const CATEGORIAS_RELATO = ['adverse_event', 'near_miss', 'unsafe_condition', 'medication', 'fall', 'infection', 'equipment', 'other'] as const;
export const SEVERIDADES_RELATO = ['low', 'moderate', 'high', 'critical'] as const;
export const STATUS_RELATO = ['submitted', 'triage', 'investigating', 'action_required', 'monitoring', 'closed', 'reopened'] as const;

export type NovoRelato = {
  category: typeof CATEGORIAS_RELATO[number];
  severity: typeof SEVERIDADES_RELATO[number];
  occurred_at: string;
  location_label: string;
  summary: string;
  immediate_action: string;
  reporter_confidential: boolean;
};

export type AtualizacaoRelato = {
  status: typeof STATUS_RELATO[number];
  assigned_to: string | null;
  due_at: string | null;
  expected_updated_at: string;
  review_note: string;
  corrective_action: string;
};
export type PedidoRetificacao = { proposed_summary: string; proposed_immediate_action: string; reason: string };
export type DecisaoRetificacao = { status: 'approved' | 'rejected'; expected_report_updated_at: string; review_note: string };

export function limparTexto(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = [...value.normalize('NFC')].filter((char) => {
    const code = char.charCodeAt(0);
    return !(code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127);
  }).join('').trim();
  return clean.length <= maxLength ? clean : null;
}

export function validarNovoRelato(value: unknown, agora = Date.now()): { ok: true; value: NovoRelato } | { ok: false } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false };
  const body = value as Record<string, unknown>;
  const allowed = ['category', 'severity', 'occurred_at', 'location_label', 'summary', 'immediate_action', 'reporter_confidential'];
  if (Object.keys(body).some((key) => !allowed.includes(key))) return { ok: false };
  const location = limparTexto(body.location_label ?? '', 120);
  const summary = limparTexto(body.summary, 4_000);
  const immediateAction = limparTexto(body.immediate_action ?? '', 2_000);
  const occurredAt = typeof body.occurred_at === 'string' ? body.occurred_at : '';
  const occurredMs = Date.parse(occurredAt);
  const confidential = body.reporter_confidential === undefined ? true : body.reporter_confidential;
  if (!CATEGORIAS_RELATO.includes(body.category as typeof CATEGORIAS_RELATO[number]) ||
    !SEVERIDADES_RELATO.includes(body.severity as typeof SEVERIDADES_RELATO[number]) ||
    !Number.isFinite(occurredMs) || occurredMs > agora + 5 * 60_000 ||
    location === null || !summary || summary.length < 20 || immediateAction === null || typeof confidential !== 'boolean') return { ok: false };
  return { ok: true, value: {
    category: body.category as NovoRelato['category'], severity: body.severity as NovoRelato['severity'],
    occurred_at: new Date(occurredMs).toISOString(), location_label: location, summary,
    immediate_action: immediateAction, reporter_confidential: confidential,
  } };
}

export function podeAcessarRelato(actor: { user_id: string; clinic_id: string; roles: string[] }, report: { clinic_id: string; reporter_user_id: string | null }): boolean {
  return actor.clinic_id === report.clinic_id && (actor.roles.includes('admin') || actor.user_id === report.reporter_user_id);
}

export function validarAtualizacaoRelato(value: unknown): { ok: true; value: AtualizacaoRelato } | { ok: false } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false };
  const body = value as Record<string, unknown>;
  const allowed = ['status', 'assigned_to', 'due_at', 'expected_updated_at', 'review_note', 'corrective_action'];
  if (Object.keys(body).some((key) => !allowed.includes(key)) || !STATUS_RELATO.includes(body.status as typeof STATUS_RELATO[number])) return { ok: false };
  const assignedTo = body.assigned_to === null || body.assigned_to === '' ? null : body.assigned_to;
  const dueAt = body.due_at === null || body.due_at === '' ? null : body.due_at;
  const expectedAt = typeof body.expected_updated_at === 'string' ? body.expected_updated_at : '';
  const note = limparTexto(body.review_note, 3_000);
  const corrective = limparTexto(body.corrective_action ?? '', 3_000);
  if ((assignedTo !== null && (typeof assignedTo !== 'string' || !/^[0-9a-f-]{36}$/i.test(assignedTo))) ||
    (dueAt !== null && (typeof dueAt !== 'string' || !Number.isFinite(Date.parse(dueAt)))) ||
    !Number.isFinite(Date.parse(expectedAt)) || !note || note.length < 3 || corrective === null) return { ok: false };
  if (body.status === 'action_required' && (!assignedTo || !dueAt)) return { ok: false };
  return { ok: true, value: {
    status: body.status as AtualizacaoRelato['status'], assigned_to: assignedTo as string | null,
    due_at: dueAt ? new Date(String(dueAt)).toISOString() : null,
    expected_updated_at: new Date(expectedAt).toISOString(), review_note: note, corrective_action: corrective,
  } };
}

export function validarPedidoRetificacao(value: unknown): { ok: true; value: PedidoRetificacao } | { ok: false } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false };
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !['proposed_summary', 'proposed_immediate_action', 'reason'].includes(key))) return { ok: false };
  const summary = limparTexto(body.proposed_summary, 4_000);
  const action = limparTexto(body.proposed_immediate_action ?? '', 2_000);
  const reason = limparTexto(body.reason, 1_000);
  if (!summary || summary.length < 20 || action === null || !reason || reason.length < 3) return { ok: false };
  return { ok: true, value: { proposed_summary: summary, proposed_immediate_action: action, reason } };
}

export function validarDecisaoRetificacao(value: unknown): { ok: true; value: DecisaoRetificacao } | { ok: false } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false };
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !['status', 'expected_report_updated_at', 'review_note'].includes(key))) return { ok: false };
  const note = limparTexto(body.review_note, 2_000);
  const expectedAt = typeof body.expected_report_updated_at === 'string' ? body.expected_report_updated_at : '';
  if (!['approved', 'rejected'].includes(String(body.status)) || !note || note.length < 3 || !Number.isFinite(Date.parse(expectedAt))) return { ok: false };
  return { ok: true, value: { status: body.status as DecisaoRetificacao['status'], expected_report_updated_at: new Date(expectedAt).toISOString(), review_note: note } };
}
