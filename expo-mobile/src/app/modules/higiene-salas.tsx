import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Feedback, Field, ListRow, Section, Stat, StateView, type Tone } from '../../components/ui';
import { clinicDate, dateLabel, friendlyError } from '../../lib/format';
import { db, type Db, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Room = { id: string; nome: string; status: string; localizacao: string | null };
type Item = { id: string; label: string; required: boolean; completed?: boolean };
type Checklist = { id: string; version: number; title: string; items: Item[] };
type Execution = { id: string; room_id: string; checklist_version_id: string; started_at: string; submitted_at: string | null; completed_items: Item[] | null; notes: string | null };
type Review = { id: string; execution_id: string; decision: 'approved' | 'rejected'; created_at: string };
type Data = { rooms: Room[]; activeChecklistId: string | null; checklists: Checklist[]; executions: Execution[]; reviews: Review[]; canReview: boolean; canConfigure: boolean };
type Stage = 'aguardando' | 'executando' | 'inspecao' | 'liberadas';

const statusInfo: Record<string, { label: string; tone: Tone }> = { disponivel: { label: 'Disponível', tone: 'success' }, limpeza: { label: 'Em higienização', tone: 'info' }, ocupado: { label: 'Em uso', tone: 'danger' }, manutencao: { label: 'Indisponível', tone: 'warning' } };
const stages: { key: Stage; label: string; tone: Tone }[] = [{ key: 'aguardando', label: 'Aguardando limpeza', tone: 'info' }, { key: 'executando', label: 'Em execução', tone: 'primary' }, { key: 'inspecao', label: 'Aguardando inspeção', tone: 'warning' }, { key: 'liberadas', label: 'Liberadas hoje', tone: 'success' }];
const dayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

/** Calls the same edge function as the web and surfaces its JSON error message. */
async function invoke(client: Db, body: Record<string, unknown>) {
  const { data, error } = await client.functions.invoke('higiene-salas', { body });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function HygieneScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [filter, setFilter] = useState<Stage | null>(null);
  const [checked, setChecked] = useState<Record<string, Record<string, boolean>>>({});
  const [execNotes, setExecNotes] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const today = clinicDate();

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => clinicId ? invoke(client, { action: 'list' }) as Promise<Data> : undefined, [clinicId]);
  const d: Data = data ?? { rooms: [], activeChecklistId: null, checklists: [], executions: [], reviews: [], canReview: false, canConfigure: false };
  const active = d.checklists.find(c => c.id === d.activeChecklistId) ?? null;
  const reviewByExec = new Map(d.reviews.map(r => [r.execution_id, r]));
  const openByRoom = new Map(d.executions.filter(e => !e.submitted_at).map(e => [e.room_id, e]));
  const pending = d.executions.filter(e => e.submitted_at && !reviewByExec.has(e.id)).sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)));
  const pendingByRoom = new Map(pending.map(e => [e.room_id, e]));
  const execById = new Map(d.executions.map(e => [e.id, e]));
  const releasedToday = new Set(d.reviews.filter(r => r.decision === 'approved' && dayOf(r.created_at) === today).map(r => execById.get(r.execution_id)?.room_id).filter(Boolean) as string[]);
  const stageOf = (room: Room): Stage | null => pendingByRoom.has(room.id) ? 'inspecao' : openByRoom.has(room.id) ? 'executando' : room.status === 'limpeza' ? 'aguardando' : releasedToday.has(room.id) ? 'liberadas' : null;
  const count = (s: Stage) => s === 'liberadas' ? d.rooms.filter(r => releasedToday.has(r.id)).length : d.rooms.filter(r => stageOf(r) === s).length;
  const rooms = d.rooms.filter(r => !filter || (filter === 'liberadas' ? releasedToday.has(r.id) : stageOf(r) === filter));

  async function act(id: string, body: Record<string, unknown>, success: string) {
    if (busy) return;
    setBusy(id); setFeedback(null);
    try { await invoke(db, body); setFeedback({ message: success }); } catch (err) { setFeedback({ message: friendlyError(err, 'Operação não concluída'), error: true }); } finally { setBusy(null); reload(); }
  }

  return <ModuleScreen moduleKey="higiene-salas" title="Higienização de salas" subtitle={d.rooms.length ? `${d.rooms.length} sala(s) · ${count('aguardando')} aguardando limpeza · ${count('inspecao')} aguardando inspeção` : 'Checklists, inspeções e liberação segura de ambientes'} refreshing={refreshing} onRefresh={refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando higienização…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar a higienização" message={`A operação foi pausada para evitar liberar uma sala com estado desatualizado. ${error}`} onAction={reload} /> : <>
      <View style={styles.stats}>{stages.map(s => <Stat key={s.key} label={filter === s.key ? `${s.label} (filtro)` : s.label} value={count(s.key)} tone={s.tone} onPress={() => setFilter(f => f === s.key ? null : s.key)} />)}</View>
      {active ? <Text style={styles.note}>Checklist vigente v{active.version}: {active.title} · {active.items.length} item(ns).</Text> : <Feedback error message="Configure o checklist vigente para liberar o início." />}
      {!rooms.length ? <StateView icon="sparkles-outline" title={d.rooms.length ? 'Nenhuma sala corresponde aos filtros' : 'Nenhuma sala cadastrada nesta unidade.'} message={d.rooms.length ? 'Toque no indicador selecionado para ver todas as salas.' : 'Cadastre salas e leitos para iniciar o controle de higienização.'} actionLabel={d.rooms.length ? 'Limpar filtro' : 'Ir para Salas e leitos'} onAction={() => d.rooms.length ? setFilter(null) : router.push('/modules/gestao-fluxo')} /> :
        <Section title={`${rooms.length} de ${d.rooms.length} sala(s)`}>{rooms.map(room => {
          const open = openByRoom.get(room.id);
          const sent = pendingByRoom.get(room.id);
          const checklist = open ? d.checklists.find(c => c.id === open.checklist_version_id) : null;
          const marks = checked[open?.id ?? ''] ?? {};
          const canStart = Boolean(active) && room.status !== 'ocupado' && room.status !== 'manutencao' && !sent;
          const info = statusInfo[room.status] ?? { label: 'Indisponível', tone: 'warning' as Tone };
          return <View key={room.id} style={styles.item}>
            <ListRow icon="business-outline" tone={info.tone} title={room.nome} subtitle={room.localizacao || 'Local não informado'} right={<Badge label={info.label} tone={info.tone} />} />
            {stageOf(room) === 'aguardando' ? <Text style={styles.note}>Marcada para limpeza em Salas e leitos. Inicie o checklist para registrar a higienização.</Text> : null}
            {sent ? <Text style={styles.warn}>Higienização enviada; sala bloqueada até revisão.</Text> : null}
            {!open ? <Button icon="sparkles-outline" label="Iniciar higienização" loading={busy === room.id} disabled={!canStart || busy !== null} onPress={() => void act(room.id, { action: 'start', room_id: room.id }, 'Higienização iniciada')} /> : null}
            {open && checklist ? <Card style={styles.checklist}>
              <Text style={styles.cardTitle}>Checklist v{checklist.version} · iniciado {dateLabel(open.started_at)}</Text>
              {checklist.items.map(item => {
                const on = marks[item.id] ?? false;
                return <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={item.label} onPress={() => setChecked(c => ({ ...c, [open.id]: { ...(c[open.id] ?? {}), [item.id]: !on } }))} style={styles.check}>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.primary : colors.muted} /><Text style={styles.checkText}>{item.label}{item.required ? <Text style={styles.req}> *</Text> : null}</Text>
                </Pressable>;
              })}
              <Field label="Observação da execução" value={execNotes[open.id] ?? ''} onChangeText={v => setExecNotes(n => ({ ...n, [open.id]: v }))} multiline maxLength={1000} />
              <Button label="Enviar para revisão" loading={busy === open.id} disabled={busy !== null || checklist.items.some(i => i.required && !(marks[i.id] ?? false))}
                onPress={() => void act(open.id, { action: 'submit', execution_id: open.id, completed_items: checklist.items.map(i => ({ ...i, completed: marks[i.id] ?? false })), notes: execNotes[open.id] ?? '' }, 'Higienização enviada para revisão')} />
            </Card> : null}
          </View>;
        })}</Section>}
      {d.canReview && pending.length ? <Section title={`Inspeção e liberação (${pending.length})`}>{pending.map(exec => {
        const room = d.rooms.find(r => r.id === exec.room_id);
        const version = d.checklists.find(c => c.id === exec.checklist_version_id)?.version ?? '?';
        const noteOk = (reviewNotes[exec.id] || '').trim().length >= 3;
        return <Card key={exec.id} style={styles.review}>
          <Text style={styles.cardTitle}>{room?.nome || 'Sala'} · revisão</Text>
          <Text style={styles.note}>Enviado {dateLabel(exec.submitted_at)} · checklist v{version}</Text>
          {(exec.completed_items || []).map(i => <View key={i.id} style={styles.check}><Ionicons name={i.completed ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={i.completed ? colors.success : colors.muted} /><Text style={styles.checkText}>{i.label}</Text></View>)}
          {exec.notes ? <Text style={styles.execNote}>{exec.notes}</Text> : null}
          <Field label="Observação da inspeção *" value={reviewNotes[exec.id] || ''} onChangeText={v => setReviewNotes(n => ({ ...n, [exec.id]: v }))} multiline maxLength={1000} hint="Mínimo de 3 caracteres." />
          <View style={styles.actions}>
            <Button icon="shield-checkmark-outline" label="Aprovar e liberar sala" loading={busy === exec.id} disabled={busy !== null || !noteOk} onPress={() => void act(exec.id, { action: 'review', execution_id: exec.id, decision: 'approved', note: reviewNotes[exec.id] }, 'Sala aprovada e liberada')} />
            <Button variant="danger" label="Reprovar e manter bloqueada" disabled={busy !== null || !noteOk} onPress={() => void act(exec.id, { action: 'review', execution_id: exec.id, decision: 'rejected', note: reviewNotes[exec.id] }, 'Higienização reprovada; a sala segue bloqueada')} />
          </View>
        </Card>;
      })}</Section> : null}
      <Section title="Histórico recente">{!d.executions.length ? <Text style={styles.note}>As execuções e inspeções aparecerão aqui. Nenhuma alteração foi feita nas salas.</Text> : d.executions.slice(0, 15).map(exec => {
        const rev = reviewByExec.get(exec.id);
        const badge: { label: string; tone: Tone } = rev?.decision === 'approved' ? { label: 'Aprovada · sala liberada', tone: 'success' } : rev?.decision === 'rejected' ? { label: 'Reprovada · segue bloqueada', tone: 'danger' } : exec.submitted_at ? { label: 'Aguardando inspeção', tone: 'warning' } : { label: 'Em execução', tone: 'primary' };
        return <ListRow key={exec.id} title={d.rooms.find(r => r.id === exec.room_id)?.nome || 'Sala'} subtitle={`${dateLabel(exec.started_at)}${rev ? ` · inspeção ${dateLabel(rev.created_at)}` : ''}`} right={<Badge label={badge.label} tone={badge.tone} />} />;
      })}</Section>
      {d.canConfigure ? <Card style={styles.handoff}><Text style={styles.note}>Criar ou versionar o checklist vigente é feito no navegador.</Text><OpenOnWeb path="/higiene-salas" /></Card> : null}
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }, note: { color: colors.muted, fontSize: 11, lineHeight: 17, marginVertical: 6 }, warn: { color: colors.warning, fontSize: 12, fontWeight: '700', marginVertical: 6 },
  item: { marginBottom: 10 }, checklist: { marginTop: 8, backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }, cardTitle: { color: colors.ink, fontSize: 13, fontWeight: '800', marginBottom: 6 },
  check: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }, checkText: { flex: 1, color: colors.ink, fontSize: 13 }, req: { color: colors.danger },
  review: { marginBottom: 10 }, execNote: { color: colors.ink, fontSize: 12, backgroundColor: colors.primarySoft, padding: 8, borderRadius: 10, marginVertical: 6 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, handoff: { marginTop: 18, gap: 8 },
});
