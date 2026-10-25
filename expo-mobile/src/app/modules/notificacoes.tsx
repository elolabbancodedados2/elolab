import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Chips, Feedback, ListRow, Section, Segmented, Stat, StateView, type Tone } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { canOpen, catalog, WEB_BASE_URL } from '../../navigation/catalog';
import { colors } from '../../theme/tokens';

type Category = 'tarefas' | 'consultas' | 'exames' | 'pagamentos' | 'retornos' | 'alertas';
type Item = { source_type: string; source_id: string; category: Category; severity: 'info' | 'warning' | 'error'; title: string; message: string; occurred_at: string; href: string; is_read: boolean; duplicateCount: number };
type View_ = 'todas' | 'nao-lidas' | 'criticas';

const categoryLabel: Record<Category, string> = { tarefas: 'Tarefas', consultas: 'Consultas', exames: 'Exames', pagamentos: 'Pagamentos', retornos: 'Retornos', alertas: 'Alertas' };
const icons = { tarefas: 'clipboard-outline', consultas: 'calendar-outline', exames: 'flask-outline', pagamentos: 'cash-outline', retornos: 'refresh-outline', alertas: 'warning-outline' } as const;
const severityTone: Record<Item['severity'], Tone> = { error: 'danger', warning: 'warning', info: 'primary' };
const severityLabel: Record<Item['severity'], string> = { error: 'Crítica', warning: 'Atenção', info: 'Informativa' };

// Same as src/lib/notificationDeduplication.ts: one row per source event, read only when every copy is read.
function group(items: Omit<Item, 'duplicateCount'>[]) {
  const map = new Map<string, Item>();
  for (const item of items) {
    const key = `${item.source_type}\u0000${item.source_id}`;
    const prev = map.get(key);
    if (!prev) { map.set(key, { ...item, duplicateCount: 1 }); continue; }
    const latest = new Date(item.occurred_at).getTime() > new Date(prev.occurred_at).getTime() ? item : prev;
    map.set(key, { ...latest, is_read: prev.is_read && item.is_read, duplicateCount: prev.duplicateCount + 1 });
  }
  return [...map.values()];
}

export default function NotificationsScreen() {
  const { session, profile, hasFeature } = useAuth();
  const userId = session?.user.id;
  const clinicId = profile?.clinicaId;
  const [view, setView] = useState<View_>('todas');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!userId || !clinicId) return undefined;
    const rows = must<Omit<Item, 'duplicateCount'>[]>(await client.rpc('central_notificacoes_usuario', { p_limit: 250 })) ?? [];
    return { events: group(rows), raw: rows.length };
  }, [userId, clinicId]);

  const events = data?.events ?? [];
  const unread = events.filter(i => !i.is_read);
  const critical = unread.filter(i => i.severity === 'error').length;
  const filtered = events.filter(i => (category === 'all' || i.category === category) && (view !== 'nao-lidas' || !i.is_read) && (view !== 'criticas' || i.severity === 'error'));
  const unreadVisible = filtered.filter(i => !i.is_read);

  async function markRead(items: Item[]) {
    if (!userId || !clinicId || !items.length) return true;
    try {
      const now = new Date().toISOString();
      must(await db.from('user_notification_state').upsert(items.map(i => ({ clinica_id: clinicId, user_id: userId, source_type: i.source_type, source_id: i.source_id, read_at: now }))));
      return true;
    } catch (err) { setFeedback({ message: `Não foi possível atualizar o estado de leitura. ${friendlyError(err)}`, error: true }); return false; }
  }

  async function markMany(items: Item[]) {
    setBusy(true); setFeedback(null);
    if (await markRead(items)) setFeedback({ message: `${items.length} notificação(ões) marcada(s) como lida(s).` });
    setBusy(false); reload();
  }

  // Maps the web href to a native screen when one exists for this account; otherwise opens the web app.
  function open(item: Item) {
    // A failure saving the read state must not block opening the item (same as the web).
    if (!item.is_read) void markRead([item]).then(reload);
    const [path, query = ''] = item.href.split('?');
    const appointment = path === '/agenda' ? new URLSearchParams(query).get('agendamento') : null;
    if (appointment) return router.push({ pathname: '/appointments/[appointmentId]', params: { appointmentId: appointment } });
    const entry = catalog.flatMap(g => g.items.map(it => ({ it, g }))).find(e => e.it.web === path);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (entry && canOpen(profile, hasFeature, entry.it, entry.g)) return router.push(entry.it.route as any);
    void Linking.openURL(`${WEB_BASE_URL}${item.href}`);
  }

  return <ModuleScreen moduleKey="notificacoes" title="Central de notificações" subtitle={events.length ? `${events.length} notificação(ões) · ${unread.length} não lida(s)${critical ? ` · ${critical} crítica(s)` : ''}` : 'Consultas, tarefas e pendências importantes para o seu perfil.'} refreshing={refreshing} onRefresh={refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando notificações…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível abrir a central" message={error} onAction={reload} /> : <>
      <View style={styles.stats}><Stat label="Não lidas" value={unread.length} onPress={() => setView('nao-lidas')} /><Stat label="Críticas não lidas" value={critical} tone="danger" onPress={() => setView('criticas')} /></View>
      <Segmented options={[{ value: 'todas', label: 'Todas' }, { value: 'nao-lidas', label: 'Não lidas' }, { value: 'criticas', label: 'Críticas' }]} value={view} onChange={setView} />
      <Chips options={[{ value: 'all' as const, label: 'Todas' }, ...(Object.keys(categoryLabel) as Category[]).map(value => ({ value, label: categoryLabel[value] }))]} value={category} onChange={setCategory} />
      <View style={styles.actions}>
        <Button variant="secondary" icon="checkmark-done" label={`Marcar ${unreadVisible.length} visível(is) como lida(s)`} disabled={!unreadVisible.length || busy} onPress={() => void markMany(unreadVisible)} />
        {unread.length > unreadVisible.length ? <Button variant="ghost" label={`Marcar todas como lidas (${unread.length})`} disabled={busy} onPress={() => void markMany(unread)} /> : null}
      </View>
      {(data?.raw ?? 0) >= 250 ? <Text style={styles.note}>Exibindo até as 250 notificações mais recentes. Os filtros consideram este conjunto.</Text> : null}
      {!filtered.length ? <StateView icon="checkmark-done-outline" title={events.length ? 'Nenhuma notificação encontrada' : 'Nenhuma notificação por enquanto'} message={events.length ? 'Ajuste os filtros para encontrar outras notificações.' : 'Novas pendências aparecerão aqui automaticamente.'} /> :
        <Section title={`${filtered.length} de ${events.length}`}>{filtered.map(i => <ListRow key={`${i.source_type}-${i.source_id}`} icon={i.severity === 'error' ? 'alert-circle-outline' : icons[i.category] ?? 'notifications-outline'} tone={severityTone[i.severity]}
          title={`${i.is_read ? '' : '• '}${i.title}`} subtitle={i.message} meta={[categoryLabel[i.category] ?? 'Alertas', dateLabel(i.occurred_at), i.duplicateCount > 1 ? `${i.duplicateCount} ocorrências` : null].filter(Boolean).join(' · ')}
          right={<Badge label={severityLabel[i.severity]} tone={severityTone[i.severity]} />} accessibilityLabel={`${i.is_read ? '' : 'Não lida. '}${i.title}. ${i.message}`} onPress={() => open(i)} />)}</Section>}
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({ stats: { flexDirection: 'row', gap: 10, marginBottom: 14 }, actions: { gap: 6, marginBottom: 4 }, note: { color: colors.muted, fontSize: 11, marginTop: 6 } });
