import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, Section, Stat, StateView } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Status = 'investigating' | 'identified' | 'monitoring' | 'resolved';
type Severity = 'minor' | 'major' | 'critical';
type Incident = { id: string; title: string; summary: string; severity: Severity; status: Status; started_at: string; resolved_at: string | null };
type Update = { id: string; incident_id: string; message: string; status: Status | null; created_at: string };
type Filter = 'todos' | 'ativos' | 'criticos' | 'resolvidos';

const statusLabels: Record<Status, string> = { investigating: 'Investigando', identified: 'Causa identificada', monitoring: 'Monitorando', resolved: 'Resolvido' };
const severityLabels: Record<Severity, string> = { minor: 'Menor', major: 'Maior', critical: 'Crítico' };
const tests: Record<Filter, (i: Incident) => boolean> = { todos: () => true, ativos: i => i.status !== 'resolved', criticos: i => i.status !== 'resolved' && i.severity === 'critical', resolvidos: i => i.status === 'resolved' };
const filterLabels: Record<Filter, string> = { todos: 'Todos', ativos: 'Ativos', criticos: 'Críticos ativos', resolvidos: 'Resolvidos' };
const opt = <T extends string>(labels: Record<T, string>) => (Object.keys(labels) as T[]).map(value => ({ value, label: labels[value] }));

export default function AdminIncidentsScreen() {
  const [filter, setFilter] = useState<Filter>('todos');
  const [form, setForm] = useState<{ title: string; summary: string; severity: Severity } | null>(null);
  const [edit, setEdit] = useState<{ id: string; status: Status; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    const [incidents, updates] = await Promise.all([
      client.from('platform_incidents').select('*').order('started_at', { ascending: false }),
      client.from('platform_incident_updates').select('*').order('created_at', { ascending: false }).limit(500),
    ]);
    return { incidents: (must<Incident[]>(incidents) ?? []), updates: (must<Update[]>(updates) ?? []) };
  }, []);

  const all = data?.incidents ?? [];
  const count = (f: Filter) => all.filter(tests[f]).length;
  const visible = all.filter(tests[filter]);

  async function run(call: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, success: string, done: () => void) {
    if (busy) return;
    setBusy(true); setFeedback(null);
    try { must(await call()); done(); setFeedback({ message: success }); reload(); } catch (err) { setFeedback({ message: friendlyError(err), error: true }); } finally { setBusy(false); }
  }
  const t = form ? { title: form.title.trim(), summary: form.summary.trim() } : null;
  const canOpen = !!t && t.title.length >= 5 && t.title.length <= 160 && t.summary.length >= 10 && t.summary.length <= 2000;
  const canSave = !!edit && edit.message.trim().length >= 3 && edit.message.trim().length <= 2000;

  return <ModuleScreen moduleKey="admin-incidentes" subtitle={data ? `${count('ativos')} incidentes ativos · ${count('criticos')} críticos · ${count('resolvidos')} resolvidos` : 'Registre impacto, mantenha a linha do tempo e acompanhe a resolução da plataforma.'} refreshing={refreshing} onRefresh={refresh}
    action={form ? null : <Button label="Abrir" icon="add" onPress={() => { setForm({ title: '', summary: '', severity: 'minor' }); setFeedback(null); }} />}>
    {form ? <Card style={styles.gap}>
      <Text style={styles.muted}>Registre impacto operacional sem incluir dados clínicos ou informações de pacientes.</Text>
      <Field label="Título" value={form.title} maxLength={160} onChangeText={title => setForm({ ...form, title })} placeholder="Ex.: lentidão no envio de notificações" />
      <Field label="Impacto observado" value={form.summary} maxLength={2000} multiline onChangeText={summary => setForm({ ...form, summary })} placeholder="Quais serviços e clientes foram afetados?" />
      <Chips label="Severidade" options={opt(severityLabels)} value={form.severity} onChange={severity => setForm({ ...form, severity })} />
      <View style={styles.actions}><Button variant="ghost" label="Cancelar" onPress={() => setForm(null)} /><Button label="Abrir incidente" loading={busy} disabled={!canOpen} onPress={() => void run(() => db.rpc('platform_open_incident', { p_title: t!.title, p_summary: t!.summary, p_severity: form.severity }), 'Incidente aberto.', () => setForm(null))} /></View>
    </Card> : null}
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando incidentes…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar os incidentes." message={error} onAction={reload} /> : <>
      <View style={styles.grid}>
        <Stat label="Ativos" value={count('ativos')} onPress={() => setFilter(filter === 'ativos' ? 'todos' : 'ativos')} />
        <Stat label="Críticos ativos" value={count('criticos')} tone="danger" onPress={() => setFilter(filter === 'criticos' ? 'todos' : 'criticos')} />
      </View>
      <Chips options={(Object.keys(tests) as Filter[]).map(value => ({ value, label: `${filterLabels[value]} (${count(value)})` }))} value={filter} onChange={setFilter} />
      {!all.length ? <StateView icon="checkmark-circle-outline" title="Nenhum incidente registrado" message="Incidentes ativos e resolvidos aparecerão nesta lista." /> : !visible.length ? <StateView icon="checkmark-circle-outline" title="Nenhum incidente neste filtro" actionLabel="Limpar filtros" onAction={() => setFilter('todos')} /> :
        <Section title={`${visible.length} de ${all.length}`}>{visible.map(i => {
          const timeline = (data?.updates ?? []).filter(u => u.incident_id === i.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
          return <Card key={i.id} style={[styles.item, i.status !== 'resolved' && i.severity === 'critical' && { borderColor: colors.danger }]}>
            <Text style={styles.title}>{i.title}</Text>
            <View style={styles.row}><Badge label={severityLabels[i.severity]} tone={i.severity === 'critical' ? 'danger' : i.severity === 'major' ? 'warning' : 'neutral'} /><Badge label={statusLabels[i.status]} tone={i.status === 'resolved' ? 'success' : 'primary'} /></View>
            <Text style={styles.body}>{i.summary}</Text>
            <Text style={styles.muted}>Início: {dateLabel(i.started_at)}{i.resolved_at ? ` · Resolvido: ${dateLabel(i.resolved_at)}` : ''}</Text>
            {edit?.id === i.id ? <View style={styles.gap}>
              <Chips label="Novo status" options={opt(statusLabels)} value={edit.status} onChange={status => setEdit({ ...edit, status })} />
              <Field label="O que mudou? *" value={edit.message} maxLength={2000} multiline onChangeText={message => setEdit({ ...edit, message })} placeholder="Descreva as verificações, a causa identificada ou a resolução aplicada." hint="Mínimo de 3 caracteres. Não inclua dados clínicos." />
              <View style={styles.actions}><Button variant="ghost" label="Cancelar" disabled={busy} onPress={() => setEdit(null)} /><Button label="Salvar atualização" icon="save-outline" loading={busy} disabled={!canSave} onPress={() => void run(() => db.rpc('platform_update_incident', { p_id: edit.id, p_status: edit.status, p_message: edit.message.trim() }), 'Status e linha do tempo atualizados.', () => setEdit(null))} /></View>
            </View> : <Button variant="secondary" label={i.status === 'resolved' ? 'Reabrir incidente' : 'Atualizar status'} onPress={() => { setEdit({ id: i.id, status: i.status === 'resolved' ? 'investigating' : i.status, message: '' }); setFeedback(null); }} />}
            <Text style={styles.sub}>Linha do tempo</Text>
            {timeline.length ? timeline.map(u => <View key={u.id} style={styles.update}>
              <View style={styles.row}>{u.status ? <Badge label={statusLabels[u.status]} tone="info" /> : null}<Text style={styles.muted}>{dateLabel(u.created_at)}</Text></View>
              <Text style={styles.body}>{u.message}</Text>
            </View>) : <Text style={styles.muted}>Nenhuma atualização registrada ainda.</Text>}
          </Card>;
        })}</Section>}
      {data?.updates.length === 500 ? <Text style={styles.muted}>A linha do tempo carrega os 500 eventos mais recentes da plataforma; eventos mais antigos podem não aparecer neste painel.</Text> : null}
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 }, gap: { gap: 8, marginBottom: 6 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  item: { marginBottom: 10, gap: 8 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  title: { color: colors.ink, fontSize: 14, fontWeight: '700' }, sub: { color: colors.ink, fontSize: 12, fontWeight: '700', marginTop: 6 }, body: { color: colors.ink, fontSize: 12, lineHeight: 18 }, muted: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  update: { borderLeftWidth: 2, borderLeftColor: colors.primarySoft, backgroundColor: colors.surfaceMuted, padding: 10, borderRadius: 10, gap: 4 },
});
