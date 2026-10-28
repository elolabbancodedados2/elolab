import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Feedback, Field, ListRow, Section, Segmented, StateView } from '../../components/ui';
import { clinicDate, dateLabel, friendlyError, timeLabel } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors, radius } from '../../theme/tokens';

// Mirrors src/hooks/useChatInterno.ts (tables chat_conversations / chat_messages).
type Person = { id: string; nome: string; email: string | null };
type Conv = { id: string; participante_1_id: string; participante_2_id: string; ultima_mensagem_em: string | null; preview: string | null };
type Msg = { id: string; conversa_id: string; remetente_id: string; destinatario_id: string; texto: string; urgente: boolean; lida_em: string | null; created_at: string; clinica_id?: string | null };
type Active = { conv: Conv; other: Person | undefined };

// shortcut: loads the 300 most recent messages (web pages up to 20k); upgrade to paging if long threads matter on the phone.
const MSG_LIMIT = 300;
const when = (value: string | null) => !value ? '' : dateLabel(value).startsWith(dateLabel(clinicDate())) ? timeLabel(value) : dateLabel(value);
const addSorted = (list: Msg[], msg: Msg) => list.some(m => m.id === msg.id) ? list : [...list, msg].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));

export default function ChatScreen() {
  const { session, profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const userId = session?.user.id;
  const [tab, setTab] = useState<'conversas' | 'equipe'>('conversas');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<Active | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [msgState, setMsgState] = useState<{ loading: boolean; error: string | null; truncated: boolean }>({ loading: false, error: null, truncated: false });
  const [text, setText] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const activeRef = useRef<Active | null>(null);
  activeRef.current = active;

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId || !userId) return undefined;
    const [people, convs] = await Promise.all([
      client.from('profiles').select('id, nome, email').neq('id', userId).eq('ativo', true).eq('clinica_id', clinicId).order('nome'),
      client.from('chat_conversations').select('*').or(`participante_1_id.eq.${userId},participante_2_id.eq.${userId}`).eq('clinica_id', clinicId).order('ultima_mensagem_em', { ascending: false }),
    ]);
    const list = (must(convs) ?? []) as Conv[];
    const unread = new Map<string, { count: number; urgent: boolean }>();
    if (list.length) {
      // shortcut: counts up to 1000 unread messages (web pages through all); enough for a badge.
      const rows = must(await client.from('chat_messages').select('conversa_id, urgente').in('conversa_id', list.map(c => c.id)).eq('clinica_id', clinicId).eq('destinatario_id', userId).is('lida_em', null).limit(1000)) ?? [];
      for (const row of rows as { conversa_id: string; urgente: boolean }[]) {
        const cur = unread.get(row.conversa_id) ?? { count: 0, urgent: false };
        unread.set(row.conversa_id, { count: cur.count + 1, urgent: cur.urgent || row.urgente });
      }
    }
    return { people: (must(people) ?? []) as Person[], convs: list, unread };
  }, [clinicId, userId]);

  const otherId = (conv: Conv) => conv.participante_1_id === userId ? conv.participante_2_id : conv.participante_1_id;
  const personOf = useCallback((id: string) => data?.people.find(p => p.id === id), [data]);

  const markRead = useCallback(async (convId: string) => {
    if (!clinicId || !userId) return;
    const { error: markError } = await db.from('chat_messages').update({ lida_em: new Date().toISOString() }).eq('conversa_id', convId).eq('clinica_id', clinicId).eq('destinatario_id', userId).is('lida_em', null);
    if (markError) setFeedback({ message: 'Mensagens carregadas, mas não foi possível marcar a leitura.', error: true });
    else reload();
  }, [clinicId, userId, reload]);

  const loadMessages = useCallback(async (convId: string) => {
    if (!clinicId) return;
    setMessages([]);
    setMsgState({ loading: true, error: null, truncated: false });
    try {
      const rows = (must(await db.from('chat_messages').select('*').eq('conversa_id', convId).eq('clinica_id', clinicId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(MSG_LIMIT)) ?? []) as Msg[];
      if (activeRef.current?.conv.id !== convId) return;
      setMessages(rows.reverse());
      setMsgState({ loading: false, error: null, truncated: rows.length === MSG_LIMIT });
      if (rows.some(m => m.destinatario_id === userId && !m.lida_em)) void markRead(convId);
    } catch (err) { setMsgState({ loading: false, error: friendlyError(err), truncated: false }); }
  }, [clinicId, userId, markRead]);

  // Realtime, same as the web: new messages and read receipts; channel removed on unmount.
  useEffect(() => {
    if (!db || !userId || !clinicId) return;
    const channel = db.channel(`chat-realtime-mobile:${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload: { new: Msg }) => {
        const msg = payload.new;
        if (msg.clinica_id !== clinicId) return;
        if (activeRef.current?.conv.id === msg.conversa_id) {
          setMessages(prev => addSorted(prev, msg));
          if (msg.destinatario_id === userId) void db.from('chat_messages').update({ lida_em: new Date().toISOString() }).eq('id', msg.id).eq('clinica_id', clinicId);
        }
        reload();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, (payload: { new: Msg }) => {
        const msg = payload.new;
        if (msg.clinica_id !== clinicId) return;
        if (activeRef.current?.conv.id === msg.conversa_id && msg.lida_em) setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, lida_em: msg.lida_em } : m));
        reload();
      })
      .subscribe();
    return () => { void db.removeChannel(channel); };
  }, [userId, clinicId, reload]);

  function open(conv: Conv) {
    const next = { conv, other: personOf(otherId(conv)) };
    activeRef.current = next;
    setActive(next);
    setFeedback(null);
    void loadMessages(conv.id);
  }

  async function startWith(person: Person) {
    if (!clinicId || !userId) return;
    setBusy(true);
    setFeedback(null);
    // Canonical participant order so both users resolve the same thread.
    const [p1, p2] = userId < person.id ? [userId, person.id] : [person.id, userId];
    const find = () => db.from('chat_conversations').select('*').eq('participante_1_id', p1).eq('participante_2_id', p2).eq('clinica_id', clinicId).order('created_at', { ascending: true }).limit(1).maybeSingle();
    try {
      let conv = must<Conv | null>(await find());
      if (!conv) {
        const created = await db.from('chat_conversations').insert({ participante_1_id: p1, participante_2_id: p2, clinica_id: clinicId }).select().maybeSingle();
        conv = created.error?.code === '23505' ? must<Conv | null>(await find()) : must<Conv | null>(created);
        if (!conv) throw new Error('Não foi possível iniciar a conversa.');
        reload();
      }
      open(conv);
    } catch (err) { setFeedback({ message: friendlyError(err, 'Não foi possível iniciar a conversa.'), error: true }); } finally { setBusy(false); }
  }

  async function send() {
    const conv = activeRef.current?.conv;
    if (!conv || !clinicId || !userId || !text.trim()) return;
    setBusy(true);
    try {
      const msg = must<Msg | null>(await db.from('chat_messages').insert({ conversa_id: conv.id, remetente_id: userId, destinatario_id: otherId(conv), texto: text.trim(), urgente: urgent, clinica_id: clinicId }).select().maybeSingle());
      if (!msg) throw new Error('Não foi possível enviar a mensagem.');
      if (activeRef.current?.conv.id === conv.id) setMessages(prev => addSorted(prev, msg));
      setText('');
      setUrgent(false);
      reload();
    } catch (err) { setFeedback({ message: friendlyError(err, 'Não foi possível enviar a mensagem.'), error: true }); } finally { setBusy(false); }
  }

  const term = search.trim().toLowerCase();
  const totalUnread = [...(data?.unread.values() ?? [])].reduce((sum, u) => sum + u.count, 0);

  if (active) {
    const name = active.other?.nome ?? personOf(otherId(active.conv))?.nome ?? 'Colega';
    return <ModuleScreen moduleKey="chat" subtitle={`Conversa com ${name}`} action={<Button variant="secondary" icon="list" label="Conversas" onPress={() => { activeRef.current = null; setActive(null); setFeedback(null); }} />}>
      {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
      {msgState.truncated ? <Text style={styles.note}>Mostrando as {MSG_LIMIT} mensagens mais recentes.</Text> : null}
      {msgState.loading ? <StateView loading title="Carregando mensagens…" /> : msgState.error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar" message={msgState.error} onAction={() => void loadMessages(active.conv.id)} /> : !messages.length ? <StateView icon="chatbubble-ellipses-outline" title="Nenhuma mensagem ainda" message="Envie a primeira mensagem." /> :
        <View style={styles.thread}>{messages.map(m => {
          const mine = m.remetente_id === userId;
          return <View key={m.id} accessible accessibilityLabel={`${mine ? 'Você' : name}${m.urgente ? ', urgente' : ''}: ${m.texto}`} style={[styles.bubble, mine ? styles.mine : styles.theirs, m.urgente && styles.urgent]}>
            {m.urgente ? <Text style={[styles.urgentTag, mine && styles.mineText]}>URGENTE</Text> : null}
            <Text style={[styles.msgText, mine && styles.mineText]}>{m.texto}</Text>
            <Text style={[styles.msgMeta, mine && styles.mineMeta]}>{when(m.created_at)}{mine ? m.lida_em ? ' · Lida' : ' · Enviada' : ''}</Text>
          </View>;
        })}</View>}
      <Card style={styles.composer}>
        <Field label="Mensagem" value={text} onChangeText={setText} placeholder="Digite uma mensagem…" multiline maxLength={4000} />
        <View style={styles.composerRow}>
          <View style={styles.urgentRow}><Switch value={urgent} onValueChange={setUrgent} accessibilityLabel="Marcar como urgente" trackColor={{ true: colors.danger, false: colors.border }} /><Text style={styles.urgentLabel}>Urgente</Text></View>
          <Button label="Enviar" icon="send" loading={busy} disabled={!text.trim()} onPress={() => void send()} />
        </View>
      </Card>
    </ModuleScreen>;
  }

  const convs = (data?.convs ?? []).filter(c => !term || (personOf(otherId(c))?.nome ?? '').toLowerCase().includes(term));
  const people = (data?.people ?? []).filter(p => !term || p.nome.toLowerCase().includes(term) || (p.email ?? '').toLowerCase().includes(term));

  return <ModuleScreen moduleKey="chat" subtitle={totalUnread ? `${totalUnread} mensagem(ns) não lida(s).` : 'Converse com a equipe da clínica.'} refreshing={refreshing} onRefresh={refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    <Segmented options={[{ value: 'conversas', label: 'Conversas' }, { value: 'equipe', label: 'Nova conversa' }]} value={tab} onChange={setTab} />
    <Field label="Buscar" value={search} onChangeText={setSearch} placeholder={tab === 'conversas' ? 'Buscar conversa…' : 'Buscar pessoa da equipe…'} autoCapitalize="none" />
    {loading ? <StateView loading title="Carregando conversas…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar" message={error} onAction={reload} /> :
      tab === 'conversas' ? (!convs.length ? <StateView icon="chatbubbles-outline" title="Nenhuma conversa" message={term ? 'Nenhuma conversa corresponde à busca.' : 'Comece uma conversa com alguém da equipe.'} actionLabel="Nova conversa" onAction={() => setTab('equipe')} /> :
        <Section title={`${convs.length} conversa(s)`}>{convs.map(c => {
          const unread = data?.unread.get(c.id);
          return <ListRow key={c.id} icon="person-circle-outline" tone={unread?.urgent ? 'danger' : 'primary'} title={personOf(otherId(c))?.nome ?? 'Colega'} subtitle={c.preview} meta={when(c.ultima_mensagem_em) || null} onPress={() => open(c)}
            right={unread ? <Badge label={unread.urgent ? `${unread.count} urgente` : String(unread.count)} tone={unread.urgent ? 'danger' : 'primary'} /> : undefined} />;
        })}</Section>) :
      !people.length ? <StateView icon="people-outline" title="Ninguém encontrado" message={term ? 'Nenhuma pessoa corresponde à busca.' : 'Não há outras pessoas ativas nesta clínica.'} /> :
        <Section title="Equipe">{people.map(p => <ListRow key={p.id} icon="person-outline" title={p.nome} subtitle={p.email} onPress={busy ? undefined : () => void startWith(p)} accessibilityLabel={`Conversar com ${p.nome}`} />)}</Section>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  thread: { gap: 8, marginTop: 8 }, bubble: { maxWidth: '85%', padding: 11, borderRadius: radius.md }, mine: { alignSelf: 'flex-end', backgroundColor: colors.primary }, theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  urgent: { borderWidth: 2, borderColor: colors.danger }, urgentTag: { color: colors.danger, fontSize: 9, fontWeight: '800', marginBottom: 3 }, msgText: { color: colors.ink, fontSize: 13, lineHeight: 19 }, mineText: { color: '#FFFFFF' }, msgMeta: { color: colors.muted, fontSize: 10, marginTop: 4 }, mineMeta: { color: colors.primarySoft },
  composer: { marginTop: 16 }, composerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, urgentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }, urgentLabel: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  note: { color: colors.muted, fontSize: 11, textAlign: 'center', marginVertical: 6 },
});
