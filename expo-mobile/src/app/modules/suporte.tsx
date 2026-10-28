import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, StateView, type Tone } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Ticket = { id: string; solicitante_id: string; categoria: string; titulo: string; descricao: string; prioridade: string; status: string; sla_limite: string; primeira_resposta_em: string | null; created_at: string };
type Message = { id: string; autor_id: string; mensagem: string; interno: boolean; created_at: string; autor_nome: string };

const statusLabel: Record<string, string> = { aberto: 'Aberto', em_atendimento: 'Em atendimento', aguardando_cliente: 'Aguardando cliente', resolvido: 'Resolvido', fechado: 'Fechado' };
const priorityLabel: Record<string, string> = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', critica: 'Crítica' };
const categoryLabel: Record<string, string> = { duvida: 'Dúvida', incidente: 'Incidente', financeiro: 'Financeiro', integracao: 'Integração', seguranca: 'Segurança' };
const toOptions = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));
const priorityTone: Record<string, Tone> = { critica: 'danger', alta: 'warning', normal: 'primary', baixa: 'neutral' };
const closed = (t: Ticket) => t.status === 'resolvido' || t.status === 'fechado';
const slaLate = (t: Ticket) => !t.primeira_resposta_em && new Date(t.sla_limite).getTime() < Date.now() && !closed(t);
const priorityOrder: Record<string, number> = { critica: 0, alta: 1, normal: 2, baixa: 3 };
const emptyForm = { titulo: '', descricao: '', prioridade: 'normal', categoria: 'duvida' };

export default function SupportScreen() {
  const { session, profile } = useAuth();
  const userId = session?.user.id;
  const clinicId = profile?.clinicaId;
  const platform = Boolean(profile?.isPlatformAdmin);
  const [status, setStatus] = useState('all');
  const [form, setForm] = useState<typeof emptyForm | null>(null);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const lock = useRef(false);

  const tickets = useLoad(async client => {
    if (!userId) return undefined;
    let query = client.from('support_tickets').select('id,clinica_id,solicitante_id,categoria,titulo,descricao,prioridade,status,sla_limite,primeira_resposta_em,created_at', { count: 'exact' });
    if (status !== 'all') query = query.eq('status', status);
    const res = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(0, 99);
    const rows = (must<Ticket[]>(res) ?? []);
    const ids = [...new Set(rows.map(r => r.solicitante_id))];
    const people = ids.length ? must<{ id: string; nome: string }[]>(await client.from('profiles').select('id,nome').in('id', ids)) ?? [] : [];
    const names = new Map(people.map(p => [p.id, p.nome]));
    // Same ordering as the web: overdue SLA first, then priority, then nearest SLA.
    const items = [...rows].sort((a, b) => Number(slaLate(b)) - Number(slaLate(a)) || (priorityOrder[a.prioridade] ?? 4) - (priorityOrder[b.prioridade] ?? 4) || new Date(a.sla_limite).getTime() - new Date(b.sla_limite).getTime());
    return { items, names, total: (res.count as number | null) ?? rows.length };
  }, [userId, status]);

  const messages = useLoad(async client => {
    if (!selected) return undefined;
    let query = client.from('support_ticket_messages').select('id,autor_id,mensagem,interno,created_at').eq('ticket_id', selected.id);
    if (!platform) query = query.eq('interno', false);
    const rows = must<Omit<Message, 'autor_nome'>[]>(await query.order('created_at')) ?? [];
    const ids = [...new Set(rows.map(r => r.autor_id))];
    const people = ids.length ? must<{ id: string; nome: string }[]>(await client.from('profiles').select('id,nome').in('id', ids)) ?? [] : [];
    const names = new Map(people.map(p => [p.id, p.nome]));
    return rows.map(r => ({ ...r, autor_nome: names.get(r.autor_id) || 'Usuário' })) as Message[];
  }, [selected?.id, platform]);

  async function create() {
    if (lock.current || !form || !clinicId || !userId) return;
    if (form.titulo.trim().length < 5) return setFeedback({ message: 'O resumo precisa ter ao menos 5 caracteres.', error: true });
    if (form.descricao.trim().length < 10) return setFeedback({ message: 'A descrição precisa ter ao menos 10 caracteres.', error: true });
    lock.current = true; setBusy(true); setFeedback(null);
    try {
      must(await db.from('support_tickets').insert({ titulo: form.titulo.trim(), descricao: form.descricao.trim(), prioridade: form.prioridade, categoria: form.categoria, clinica_id: clinicId, solicitante_id: userId }));
      setForm(null);
      setFeedback({ message: 'Chamado aberto.' });
      tickets.reload();
    } catch (err) { setFeedback({ message: `Não foi possível abrir o chamado. ${friendlyError(err)}`, error: true }); } finally { lock.current = false; setBusy(false); }
  }

  async function send() {
    const text = reply.trim();
    if (lock.current || !text || !selected || !userId) return;
    lock.current = true; setBusy(true); setFeedback(null);
    try {
      must(await db.from('support_ticket_messages').insert({ ticket_id: selected.id, autor_id: userId, mensagem: text, interno: false }));
      setReply('');
      setFeedback({ message: 'Resposta enviada.' });
      messages.reload(); tickets.reload();
    } catch (err) { setFeedback({ message: `Não foi possível enviar a resposta. ${friendlyError(err)}`, error: true }); } finally { lock.current = false; setBusy(false); }
  }

  if (selected) return <ModuleScreen moduleKey="suporte" title={selected.titulo} subtitle={`${categoryLabel[selected.categoria] ?? selected.categoria} · ${priorityLabel[selected.prioridade] ?? selected.prioridade} · ${statusLabel[selected.status] ?? selected.status}`} refreshing={messages.refreshing} onRefresh={messages.refresh}>
    <Button variant="ghost" icon="list-outline" label="Voltar para a fila" onPress={() => { setSelected(null); setReply(''); setFeedback(null); }} />
    <Card><Text selectable style={styles.body}>{selected.descricao}</Text><Text style={styles.meta}>{selected.primeira_resposta_em ? `Primeira resposta: ${dateLabel(selected.primeira_resposta_em)}` : `Prazo da primeira resposta: ${dateLabel(selected.sla_limite)}`}</Text></Card>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    <Section title="Mensagens">{messages.loading ? <StateView loading title="Carregando mensagens…" /> : messages.error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar as mensagens" message={messages.error} onAction={messages.reload} /> : !messages.data?.length ? <StateView icon="chatbubbles-outline" title="Ainda não há mensagens neste chamado." /> :
      messages.data.map(m => <View key={m.id} style={[styles.message, m.autor_id === userId && styles.mine]}>
        <Text style={styles.author}>{m.autor_nome}{m.interno ? ' · Nota interna' : ''}</Text><Text selectable style={styles.body}>{m.mensagem}</Text><Text style={styles.meta}>{dateLabel(m.created_at)}</Text>
      </View>)}</Section>
    <Field label="Responder" value={reply} onChangeText={setReply} multiline maxLength={4000} hint={`${reply.length}/4000`} />
    <Button label={busy ? 'Enviando…' : 'Enviar resposta'} icon="send" loading={busy} disabled={!reply.trim()} onPress={() => void send()} />
  </ModuleScreen>;

  const list = tickets.data?.items ?? [];
  return <ModuleScreen moduleKey="suporte" title="Central de Suporte" subtitle="Chamados, prioridade, SLA e histórico em um só lugar." refreshing={tickets.refreshing} onRefresh={tickets.refresh}
    action={form || platform ? null : <Button label="Abrir chamado" icon="add" disabled={!clinicId} onPress={() => { setForm(emptyForm); setFeedback(null); }} />}>
    {form ? <Card style={styles.form}>
      <Text style={styles.formHint}>Conte o que aconteceu e como podemos reproduzir o problema.</Text>
      <Field label="Resumo do problema" value={form.titulo} onChangeText={titulo => setForm({ ...form, titulo })} maxLength={120} hint={`Mínimo de 5 caracteres · ${form.titulo.length}/120`} />
      <Field label="Descrição" value={form.descricao} onChangeText={descricao => setForm({ ...form, descricao })} multiline maxLength={4000} hint={`Mínimo de 10 caracteres · ${form.descricao.length}/4000`} />
      <Chips label="Prioridade" options={toOptions(priorityLabel)} value={form.prioridade} onChange={prioridade => setForm({ ...form, prioridade })} />
      <Chips label="Categoria" options={toOptions(categoryLabel)} value={form.categoria} onChange={categoria => setForm({ ...form, categoria })} />
      <View style={styles.actions}><Button variant="ghost" label="Cancelar" onPress={() => setForm(null)} /><Button label={busy ? 'Abrindo chamado…' : 'Enviar chamado'} icon="add" loading={busy} disabled={form.titulo.trim().length < 5 || form.descricao.trim().length < 10} onPress={() => void create()} /></View>
    </Card> : null}
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    <Chips options={[{ value: 'all', label: 'Todos os status' }, ...toOptions(statusLabel)]} value={status} onChange={setStatus} />
    {tickets.loading ? <StateView loading title="Carregando chamados…" /> : tickets.error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar os chamados" message={tickets.error} onAction={tickets.reload} /> : !list.length ? <StateView icon="chatbox-outline" title={status === 'all' ? 'Nenhum chamado por aqui' : 'Nenhum chamado corresponde aos filtros'} message={status === 'all' ? 'Os chamados da clínica aparecerão nesta lista.' : undefined} /> :
      <Section title={`${list.length} de ${tickets.data?.total ?? list.length} chamado(s)`}>{list.map(t => <ListRow key={t.id} title={t.titulo} subtitle={`${tickets.data?.names.get(t.solicitante_id) ?? 'Solicitante indisponível'} · ${categoryLabel[t.categoria] ?? t.categoria} · ${statusLabel[t.status] ?? t.status}`}
        meta={slaLate(t) ? `SLA vencido · ${dateLabel(t.sla_limite)}` : t.primeira_resposta_em ? `Primeira resposta ${dateLabel(t.primeira_resposta_em)}` : `SLA ${dateLabel(t.sla_limite)}`}
        right={<Badge label={slaLate(t) ? 'SLA vencido' : priorityLabel[t.prioridade] ?? t.prioridade} tone={slaLate(t) ? 'danger' : priorityTone[t.prioridade] ?? 'neutral'} />} onPress={() => { setSelected(t); setFeedback(null); }} />)}</Section>}
    {(tickets.data?.total ?? 0) > 100 ? <Text style={styles.note}>Exibindo os 100 chamados mais recentes. Use a versão web para ver os demais.</Text> : null}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  form: { marginBottom: 6 }, formHint: { color: colors.muted, fontSize: 12, marginBottom: 12 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  body: { color: colors.ink, fontSize: 13, lineHeight: 19 }, meta: { color: colors.muted, fontSize: 11, marginTop: 6 }, author: { color: colors.ink, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  message: { backgroundColor: colors.surfaceMuted, borderRadius: 13, padding: 12, marginBottom: 8 }, mine: { backgroundColor: colors.primarySoft },
  note: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 16 },
});
