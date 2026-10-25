import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, Segmented, StateView, Stat, type Tone } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { db, useLoad, type Db } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Report = { id: string; category: string; severity: string; occurred_at: string; location_label: string; summary: string; immediate_action: string; status: string; reporter_confidential: boolean; reporter_display?: string; is_reporter?: boolean; assigned_to: string | null; due_at: string | null; created_at: string; updated_at: string };
type Reviewer = { id: string; nome: string };
type ReportUpdate = { id: string; from_status: string | null; to_status: string; review_note: string; corrective_action: string; created_at: string };
type Correction = { id: string; previous_summary: string; proposed_summary: string; reason: string; status: 'pending' | 'approved' | 'rejected'; review_note: string | null; created_at: string };
type View_ = 'abertos' | 'encerrados';

const CATEGORIES: Record<string, string> = { adverse_event: 'Evento adverso', near_miss: 'Quase incidente', unsafe_condition: 'Condição insegura', medication: 'Medicação', fall: 'Queda', infection: 'Infecção', equipment: 'Equipamento', other: 'Outro' };
const SEVERITIES: Record<string, string> = { low: 'Baixa', moderate: 'Moderada', high: 'Alta', critical: 'Crítica' };
const STATUSES: Record<string, string> = { submitted: 'Recebido', triage: 'Triagem', investigating: 'Em investigação', action_required: 'Ação necessária', monitoring: 'Monitorando', closed: 'Encerrado', reopened: 'Reaberto' };
const severityTone: Record<string, Tone> = { critical: 'danger', high: 'danger', moderate: 'warning', low: 'neutral' };
const weight: Record<string, number> = { critical: 0, high: 1, moderate: 2, low: 3 };
const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));
const isOpen = (r: Report) => r.status !== 'closed';
const pad = (n: number) => String(n).padStart(2, '0');
// Clinic wall clock (America/Sao_Paulo is UTC-3 year-round since 2019).
const nowBR = () => { const d = new Date(Date.now() - 3 * 3600_000); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const isoToBR = (v: string | null) => v ? dateLabel(v).replace(',', '') : '';
/** "DD/MM/AAAA HH:mm" (clinic time) → ISO; null when invalid. */
function parseDateTimeBR(v: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00-03:00`);
  return Number.isNaN(d.getTime()) || Number(m[4]) > 23 || Number(m[5]) > 59 || new Date(d.getTime() - 3 * 3600_000).getUTCDate() !== Number(m[1]) ? null : d.toISOString();
}

/** Calls the same edge function as the web; it audits every list/view/create/update server-side. */
async function invoke(client: Db, body: Record<string, unknown>) {
  const { data, error } = await client.functions.invoke('seguranca-assistencial', { body });
  if (error) {
    const payload = await error.context?.json?.().catch(() => null);
    throw new Error(payload?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

const emptyForm = () => ({ category: 'near_miss', severity: 'moderate', occurred: nowBR(), location_label: '', summary: '', immediate_action: '', reporter_confidential: true });

export default function ClinicalSafetyScreen() {
  const { profile } = useAuth();
  const isAdmin = Boolean(profile?.roles.includes('admin'));
  const [view, setView] = useState<View_>('abertos');
  const [severity, setSeverity] = useState('todas');
  const [form, setForm] = useState<ReturnType<typeof emptyForm> | null>(null);
  const [open, setOpen] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  const list = useLoad(async client => {
    if (!profile?.clinicaId) return undefined;
    const data = await invoke(client, { action: 'list' });
    return { reports: (data?.reports ?? []) as Report[], reviewers: (data?.reviewers ?? []) as Reviewer[] };
  }, [profile?.clinicaId]);
  const reports = useMemo(() => list.data?.reports ?? [], [list.data]);
  const reviewerName = (id: string | null) => id ? list.data?.reviewers.find(r => r.id === id)?.nome || 'Definido' : null;
  const now = Date.now();
  const counts = { critical: reports.filter(r => r.severity === 'critical' && isOpen(r)).length, open: reports.filter(isOpen).length, action: reports.filter(r => r.status === 'action_required').length, overdue: reports.filter(r => isOpen(r) && r.due_at && Date.parse(r.due_at) < now).length };
  const shown = reports.filter(r => (view === 'abertos' ? isOpen(r) : !isOpen(r)) && (severity === 'todas' || r.severity === severity))
    .sort((a, b) => (weight[a.severity] ?? 9) - (weight[b.severity] ?? 9) || a.occurred_at.localeCompare(b.occurred_at));

  async function submit() {
    if (!form) return;
    const occurred = parseDateTimeBR(form.occurred);
    if (!occurred) return setFeedback({ message: 'Informe uma data válida no formato DD/MM/AAAA HH:mm.', error: true });
    if (Date.parse(occurred) > Date.now() + 60_000) return setFeedback({ message: 'A data da ocorrência não pode estar no futuro.', error: true });
    setBusy(true); setFeedback(null);
    try {
      await invoke(db, { action: 'create', report: { category: form.category, severity: form.severity, occurred_at: occurred, location_label: form.location_label, summary: form.summary, immediate_action: form.immediate_action, reporter_confidential: form.reporter_confidential } });
      setForm(null);
      setFeedback({ message: 'Relato recebido.' });
      list.reload();
    } catch (err) { setFeedback({ message: `Não foi possível registrar o relato. ${friendlyError(err)}`, error: true }); } finally { setBusy(false); }
  }

  if (open) return <ReportDetail report={open} isAdmin={isAdmin} reviewers={list.data?.reviewers ?? []} reviewerName={reviewerName} onClose={changed => { setOpen(null); if (changed) list.reload(); }} />;

  const summaryLen = form?.summary.trim().length ?? 0;
  return <ModuleScreen moduleKey="seguranca-assistencial" title="Qualidade e segurança assistencial" refreshing={list.refreshing} onRefresh={list.refresh}
    subtitle={list.loading ? 'Carregando relatos…' : !reports.length ? 'Registre eventos, quase incidentes e condições inseguras para análise e melhoria do cuidado.' : `${counts.open} relato(s) aberto(s)${counts.critical ? ` · ${counts.critical} crítico(s) pendente(s)` : ''}${counts.overdue ? ` · ${counts.overdue} com prazo vencido` : ''}`}
    action={form ? null : <Button label="Relatar" icon="add" onPress={() => { setForm(emptyForm()); setFeedback(null); }} />}>
    {form ? <Card style={styles.block}>
      <Text style={styles.title}>Registrar ocorrência ou risco</Text>
      <Text style={styles.muted}>Não informe nome, CPF, CNS ou outros dados que identifiquem o paciente. O relato fica restrito a esta clínica.</Text>
      <Text style={styles.warn}>Se houver risco imediato à vida, acione os serviços de emergência e o protocolo interno antes de registrar.</Text>
      <Chips label="Categoria" options={opts(CATEGORIES)} value={form.category} onChange={category => setForm({ ...form, category })} />
      <Chips label="Gravidade" options={opts(SEVERITIES)} value={form.severity} onChange={s => setForm({ ...form, severity: s })} />
      <Field label="Quando aconteceu" value={form.occurred} onChangeText={occurred => setForm({ ...form, occurred })} placeholder="DD/MM/AAAA HH:mm" keyboardType="numbers-and-punctuation" />
      <Field label="Local ou setor" value={form.location_label} maxLength={120} onChangeText={location_label => setForm({ ...form, location_label })} placeholder="Ex.: sala de coleta" />
      <Field label="O que aconteceu? *" value={form.summary} maxLength={4000} multiline onChangeText={summary => setForm({ ...form, summary })} placeholder="Descreva os fatos sem identificar pacientes ou outras pessoas." hint={`${form.summary.length}/4000${summaryLen > 0 && summaryLen < 20 ? ' · mínimo de 20 caracteres' : ''}`} />
      <Field label="Ação imediata tomada" value={form.immediate_action} maxLength={2000} multiline onChangeText={immediate_action => setForm({ ...form, immediate_action })} placeholder="Quais medidas foram tomadas para reduzir o risco?" />
      <View style={styles.switchRow}><View style={styles.fill}><Text style={styles.label}>Proteger minha identidade dos revisores</Text><Text style={styles.muted}>{form.reporter_confidential ? 'Ativado por padrão. Seu relato continuará associado à sua conta para permitir que você acompanhe o protocolo.' : 'Seu nome será exibido para os administradores que revisarem este relato.'}</Text></View>
        <Switch accessibilityLabel="Proteger minha identidade dos revisores" value={form.reporter_confidential} onValueChange={reporter_confidential => setForm({ ...form, reporter_confidential })} trackColor={{ true: colors.primary, false: colors.border }} /></View>
      <View style={styles.actions}><Button variant="ghost" label="Cancelar" onPress={() => setForm(null)} /><Button label="Enviar relato" loading={busy} disabled={summaryLen < 20} onPress={() => void submit()} /></View>
    </Card> : null}
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    <View style={styles.stats}><Stat label="Críticos pendentes" value={list.loading ? '—' : counts.critical} tone="danger" /><Stat label="Ação necessária" value={list.loading ? '—' : counts.action} tone="warning" /></View>
    <Section title={isAdmin ? 'Relatos da clínica' : 'Meus relatos'}>
      <Segmented options={[{ value: 'abertos', label: 'Em acompanhamento' }, { value: 'encerrados', label: 'Encerrados' }]} value={view} onChange={setView} />
      <Chips options={[{ value: 'todas', label: 'Todas' }, ...opts(SEVERITIES)]} value={severity} onChange={setSeverity} />
      {list.loading ? <StateView loading title="Carregando relatos…" /> : list.error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar os relatos." message={list.error} onAction={list.reload} />
        : !reports.length ? <StateView icon="shield-checkmark-outline" title="Nenhum relato registrado" message="Ocorrências e condições de risco aparecerão aqui." />
        : !shown.length ? <StateView icon="search-outline" title="Nenhum relato corresponde aos filtros" message="Ajuste a gravidade ou a aba para ver outros relatos." />
        : shown.map(r => {
          const late = isOpen(r) && r.due_at && Date.parse(r.due_at) < now;
          return <ListRow key={r.id} title={`${CATEGORIES[r.category] || 'Relato assistencial'} · ${dateLabel(r.occurred_at)}`} subtitle={r.summary}
            meta={[STATUSES[r.status] || r.status, r.location_label || 'Local não informado', isAdmin && r.reporter_display ? `Relator: ${r.reporter_display}` : null, r.assigned_to ? `Responsável: ${reviewerName(r.assigned_to)}` : null, r.due_at ? `Prazo ${dateLabel(r.due_at)}` : null].filter(Boolean).join(' · ')}
            right={<Badge label={late ? 'Prazo vencido' : SEVERITIES[r.severity] || r.severity} tone={late ? 'danger' : severityTone[r.severity]} />}
            accessibilityLabel={`${isAdmin ? 'Revisar e acompanhar' : 'Acompanhar relato'}: ${CATEGORIES[r.category] ?? ''}`} onPress={() => { setFeedback(null); setOpen(r); }} />;
        })}
    </Section>
    <Text style={styles.note}>A lista não mostra identificação do relator quando a proteção está ativada.</Text>
  </ModuleScreen>;
}

function ReportDetail({ report, isAdmin, reviewers, reviewerName, onClose }: { report: Report; isAdmin: boolean; reviewers: Reviewer[]; reviewerName: (id: string | null) => string | null; onClose: (changed: boolean) => void }) {
  const [changed, setChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const [review, setReview] = useState({ status: report.status === 'submitted' ? 'triage' : report.status, assigned: report.assigned_to ?? 'none', due: isoToBR(report.due_at), note: '', action: '' });
  const [correction, setCorrection] = useState<{ summary: string; action: string; reason: string } | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const detail = useLoad(async client => {
    const data = await invoke(client, { action: 'get', report_id: report.id });
    return { report: data.report as Report, updates: (data.updates ?? []) as ReportUpdate[], corrections: (data.correction_requests ?? []) as Correction[] };
  }, [report.id]);
  const current = detail.data?.report;

  async function run(body: Record<string, unknown>, success: string, after?: () => void) {
    setBusy(true); setFeedback(null);
    try { await invoke(db, body); setChanged(true); setFeedback({ message: success }); after?.(); detail.reload(); }
    catch (err) { setFeedback({ message: friendlyError(err), error: true }); } finally { setBusy(false); }
  }
  function saveReview() {
    if (!current) return;
    const due = review.due.trim() ? parseDateTimeBR(review.due) : null;
    if (review.due.trim() && !due) return setFeedback({ message: 'Use o prazo no formato DD/MM/AAAA HH:mm.', error: true });
    // expected_updated_at lets the server reject the save when someone else reviewed meanwhile.
    void run({ action: 'update', report_id: report.id, update: { status: review.status, assigned_to: review.assigned === 'none' ? null : review.assigned, due_at: due, expected_updated_at: current.updated_at, review_note: review.note.trim(), corrective_action: review.action.trim() } },
      'Revisão e ação corretiva registradas.', () => setReview(r => ({ ...r, note: '', action: '' })));
  }
  const needsOwner = review.status === 'action_required' && (review.assigned === 'none' || !review.due.trim());
  const canReview = review.note.trim().length >= 3 && review.note.trim().length <= 3000 && review.action.length <= 3000 && !needsOwner;
  const hasPending = detail.data?.corrections.some(c => c.status === 'pending');

  return <ModuleScreen moduleKey="seguranca-assistencial" title={isAdmin ? 'Revisar relato assistencial' : 'Acompanhar relato'} subtitle="O histórico não inclui dados do paciente e fica restrito à equipe autorizada desta clínica." refreshing={detail.refreshing} onRefresh={detail.refresh}
    action={<Button variant="ghost" label="Fechar" onPress={() => onClose(changed)} />}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {detail.loading ? <StateView loading title="Abrindo relato…" /> : detail.error || !current ? <StateView icon="alert-circle-outline" title="Não foi possível abrir o histórico." message={detail.error ?? undefined} onAction={detail.reload} /> : <>
      <Card style={styles.block}>
        <View style={styles.badges}><Badge label={SEVERITIES[current.severity] || current.severity} tone={severityTone[current.severity]} /><Badge label={STATUSES[current.status] || current.status} tone="primary" />{isAdmin && current.reporter_confidential ? <Badge label="Identidade protegida" /> : null}</View>
        <Text style={styles.muted}>{CATEGORIES[current.category]} · {dateLabel(current.occurred_at)} · {current.location_label || 'Local não informado'}</Text>
        <Text selectable style={styles.body}>{current.summary}</Text>
        <Text style={styles.label}>Ação imediata registrada</Text>
        <Text selectable style={styles.muted}>{current.immediate_action || 'Nenhuma ação informada.'}</Text>
        {current.assigned_to || current.due_at ? <Text style={styles.muted}>{[current.assigned_to ? `Responsável: ${reviewerName(current.assigned_to)}` : null, current.due_at ? `Prazo ${dateLabel(current.due_at)}` : null].filter(Boolean).join(' · ')}</Text> : null}
      </Card>
      <Section title="Histórico de revisão">{detail.data?.updates.length ? detail.data.updates.map(u => <ListRow key={u.id} title={`${STATUSES[u.from_status || 'submitted']} → ${STATUSES[u.to_status]}`} subtitle={`${u.review_note}${u.corrective_action ? `\nAção corretiva: ${u.corrective_action}` : ''}`} meta={dateLabel(u.created_at)} />) : <Text style={styles.muted}>Ainda não há atualizações de revisão.</Text>}</Section>
      <Section title="Pedidos de retificação" action={current.is_reporter && !correction && !hasPending ? <Button variant="secondary" label="Solicitar retificação" onPress={() => setCorrection({ summary: current.summary, action: current.immediate_action || '', reason: '' })} /> : undefined}>
        {detail.data?.corrections.length ? detail.data.corrections.map(c => <Card key={c.id} style={styles.block}>
          <View style={styles.badges}><Badge label={c.status === 'pending' ? 'Aguardando análise' : c.status === 'approved' ? 'Aprovada' : 'Recusada'} tone={c.status === 'approved' ? 'success' : c.status === 'pending' ? 'warning' : 'danger'} /><Text style={styles.muted}>{dateLabel(c.created_at)}</Text></View>
          <Text style={styles.label}>Versão anterior preservada</Text><Text style={styles.muted}>{c.previous_summary}</Text>
          <Text style={styles.label}>Texto proposto</Text><Text style={styles.body}>{c.proposed_summary}</Text>
          <Text style={styles.body}>Motivo: {c.reason}</Text>{c.review_note ? <Text style={styles.muted}>Decisão: {c.review_note}</Text> : null}
          {isAdmin && c.status === 'pending' ? <>
            <Field label="Nota da decisão *" value={decisionNote} maxLength={2000} multiline onChangeText={setDecisionNote} placeholder="Explique a aprovação ou recusa." />
            <View style={styles.actions}>
              {(['rejected', 'approved'] as const).map(status => <Button key={status} variant={status === 'approved' ? 'primary' : 'danger'} label={status === 'approved' ? 'Aprovar e aplicar retificação' : 'Recusar pedido'} disabled={decisionNote.trim().length < 3 || busy}
                onPress={() => void run({ action: 'resolve_correction', report_id: report.id, correction_id: c.id, decision: { status, expected_report_updated_at: current.updated_at, review_note: decisionNote.trim() } }, 'Decisão de retificação registrada.', () => setDecisionNote(''))} />)}
            </View>
          </> : null}
        </Card>) : <Text style={styles.muted}>Não há pedidos de retificação.</Text>}
        {correction ? <Card style={styles.block}>
          <Text style={styles.muted}>O texto atual permanece preservado até a análise do administrador. Não inclua identificadores de pacientes.</Text>
          <Field label="Texto corrigido *" value={correction.summary} maxLength={4000} multiline onChangeText={summary => setCorrection({ ...correction, summary })} />
          <Field label="Ação imediata corrigida" value={correction.action} maxLength={2000} multiline onChangeText={action => setCorrection({ ...correction, action })} />
          <Field label="Motivo da retificação *" value={correction.reason} maxLength={1000} multiline onChangeText={reason => setCorrection({ ...correction, reason })} />
          <View style={styles.actions}><Button variant="ghost" label="Cancelar" onPress={() => setCorrection(null)} />
            <Button label="Enviar pedido" loading={busy} disabled={correction.summary.trim().length < 20 || correction.reason.trim().length < 3}
              onPress={() => void run({ action: 'request_correction', report_id: report.id, request: { proposed_summary: correction.summary.trim(), proposed_immediate_action: correction.action.trim(), reason: correction.reason.trim() } }, 'Pedido de retificação enviado para análise.', () => setCorrection(null))} /></View>
        </Card> : null}
      </Section>
      {isAdmin ? <Section title="Revisão da qualidade">
        <Chips label="Status da revisão" options={opts(STATUSES)} value={review.status} onChange={status => setReview({ ...review, status })} />
        <Chips label="Responsável" options={[{ value: 'none', label: 'Sem responsável' }, ...reviewers.map(r => ({ value: r.id, label: r.nome }))]} value={review.assigned} onChange={assigned => setReview({ ...review, assigned })} />
        <Field label="Prazo da ação" value={review.due} onChangeText={due => setReview({ ...review, due })} placeholder="DD/MM/AAAA HH:mm" keyboardType="numbers-and-punctuation" error={needsOwner ? 'Atribua um responsável e um prazo para manter este status.' : undefined} />
        <Field label="Análise da qualidade *" value={review.note} maxLength={3000} multiline onChangeText={note => setReview({ ...review, note })} placeholder="Registre a análise sem identificar pacientes." />
        <Field label="Ação corretiva ou preventiva" value={review.action} maxLength={3000} multiline onChangeText={a => setReview({ ...review, action: a })} placeholder="Descreva a medida, o controle ou o acompanhamento planejado." />
        <Button label="Salvar revisão" loading={busy} disabled={!canReview} onPress={saveReview} />
      </Section> : null}
      <Pressable accessibilityRole="button" onPress={() => onClose(changed)} style={styles.back}><Text style={styles.backText}>Voltar aos relatos</Text></Pressable>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  block: { marginTop: 8, gap: 6 }, title: { color: colors.ink, fontSize: 15, fontWeight: '800' }, muted: { color: colors.muted, fontSize: 12, lineHeight: 17 }, body: { color: colors.ink, fontSize: 13, lineHeight: 19 }, label: { color: colors.ink, fontSize: 12, fontWeight: '700', marginTop: 4 },
  warn: { color: colors.warning, backgroundColor: colors.warningSoft, borderRadius: 12, padding: 10, fontSize: 12, marginBottom: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 13, backgroundColor: colors.primarySoft, marginBottom: 12 }, fill: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }, stats: { flexDirection: 'row', gap: 8, marginTop: 8 }, badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  note: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 16 }, back: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 12 }, backText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
});
