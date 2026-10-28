import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, StateView, type Tone } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Ticket = { id: string; clinica_id: string; solicitante_id: string; categoria: string; titulo: string; descricao: string; prioridade: string; status: string; sla_limite: string; primeira_resposta_em: string | null; clinica_nome: string; solicitante_nome: string; solicitante_email: string | null };
type Message = { id: string; autor_id: string; mensagem: string; interno: boolean; created_at: string; autor_nome: string };

const STATUS = ['aberto', 'em_atendimento', 'aguardando_cliente', 'resolvido', 'fechado'];
const statusLabel: Record<string, string> = { aberto: 'Aberto', em_atendimento: 'Em atendimento', aguardando_cliente: 'Aguardando cliente', resolvido: 'Resolvido', fechado: 'Fechado' };
const prioridadeLabel: Record<string, string> = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', critica: 'Crítica' };
const categoriaLabel: Record<string, string> = { duvida: 'Dúvida', incidente: 'Incidente', financeiro: 'Financeiro', integracao: 'Integração', seguranca: 'Segurança' };
const prioridadeTone: Record<string, Tone> = { critica: 'danger', alta: 'warning', normal: 'neutral', baixa: 'neutral' };
const priorityOrder: Record<string, number> = { critica: 0, alta: 1, normal: 2, baixa: 3 };
const slaVencido = (t: Ticket) => !t.primeira_resposta_em && new Date(t.sla_limite).getTime() < Date.now() && !['resolvido', 'fechado'].includes(t.status);
const sanitize = (value: string) => value.trim().replace(/[^\p{L}\p{N}@ -]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

export default function AdminSupportScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [status, setStatus] = useState('all');
  const [prioridade, setPrioridade] = useState('all');
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [interno, setInterno] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const lock = useRef(false);

  const tickets = useLoad(async client => {
    let q = client.from('support_tickets').select('id,clinica_id,solicitante_id,categoria,titulo,descricao,prioridade,status,sla_limite,primeira_resposta_em,created_at', { count: 'exact' });
    if (status !== 'all') q = q.eq('status', status);
    if (prioridade !== 'all') q = q.eq('prioridade', prioridade);
    if (buscaAplicada) q = q.or(`titulo.ilike.%${buscaAplicada}%,descricao.ilike.%${buscaAplicada}%`);
    // shortcut: first 100 tickets only (web paginates), upgrade when the queue regularly exceeds 100 matches.
    const res = await q.order('created_at', { ascending: false }).order('id', { ascending: false }).range(0, 99);
    const rows = must<Omit<Ticket, 'clinica_nome' | 'solicitante_nome' | 'solicitante_email'>[]>(res) ?? [];
    const clinicIds = [...new Set(rows.map(r => r.clinica_id))];
    const requesterIds = [...new Set(rows.map(r => r.solicitante_id))];
    const [clinics, people] = await Promise.all([
      clinicIds.length ? client.from('clinicas').select('id,nome').in('id', clinicIds) : { data: [], error: null },
      requesterIds.length ? client.from('profiles').select('id,nome,email').in('id', requesterIds) : { data: [], error: null },
    ]);
    const names = new Map<string, string>((must(clinics) ?? []).map((c: { id: string; nome: string }) => [c.id, c.nome]));
    const reqs = new Map<string, { nome: string; email: string | null }>((must(people) ?? []).map((p: { id: string; nome: string; email: string | null }) => [p.id, p]));
    const items: Ticket[] = rows.map(r => ({ ...r, clinica_nome: names.get(r.clinica_id) || 'Clínica sem nome', solicitante_nome: reqs.get(r.solicitante_id)?.nome || 'Solicitante indisponível', solicitante_email: reqs.get(r.solicitante_id)?.email || null }));
    items.sort((a, b) => Number(slaVencido(b)) - Number(slaVencido(a)) || (priorityOrder[a.prioridade] ?? 4) - (priorityOrder[b.prioridade] ?? 4) || new Date(a.sla_limite).getTime() - new Date(b.sla_limite).getTime());
    return { items, total: (res.count as number | null) ?? items.length };
  }, [status, prioridade, buscaAplicada]);

  const messages = useLoad(async client => {
    if (!selected) return undefined;
    const rows = must<Omit<Message, 'autor_nome'>[]>(await client.from('support_ticket_messages').select('id,autor_id,mensagem,interno,created_at').eq('ticket_id', selected.id).order('created_at')) ?? [];
    const ids = [...new Set(rows.map(r => r.autor_id))];
    const people = ids.length ? must<{ id: string; nome: string }[]>(await client.from('profiles').select('id,nome').in('id', ids)) ?? [] : [];
    const names = new Map(people.map(p => [p.id, p.nome]));
    return rows.map(r => ({ ...r, autor_nome: names.get(r.autor_id) || 'Usuário' })) as Message[];
  }, [selected?.id]);

  const draft = selected ? drafts[selected.id] ?? '' : '';

  async function reply() {
    const texto = draft.trim();
    if (lock.current || !texto || !selected || !userId) return;
    const ticketId = selected.id;
    lock.current = true; setBusy('reply'); setFeedback(null);
    try {
      must(await db.from('support_ticket_messages').insert({ ticket_id: ticketId, autor_id: userId, mensagem: texto, interno }));
      setDrafts(current => { const next = { ...current }; if (next[ticketId] === texto) delete next[ticketId]; return next; });
      setInterno(false);
      setFeedback({ message: 'Resposta enviada.' });
      messages.reload(); tickets.reload();
    } catch (err) { setFeedback({ message: `Não foi possível enviar a resposta. ${friendlyError(err)}`, error: true }); } finally { lock.current = false; setBusy(null); }
  }

  async function changeStatus(ticket: Ticket, novo: string) {
    if (lock.current || novo === ticket.status) return;
    lock.current = true; setBusy('status'); setFeedback(null);
    try {
      const row = must(await db.from('support_tickets').update({ status: novo, resolvido_em: novo === 'resolvido' || novo === 'fechado' ? new Date().toISOString() : null }).eq('id', ticket.id).select('id').maybeSingle());
      if (!row) throw new Error('O chamado não foi encontrado ou não pode mais ser atualizado.');
      setSelected(current => current?.id === ticket.id ? { ...current, status: novo } : current);
      setFeedback({ message: 'Status do chamado atualizado.' });
      tickets.reload();
    } catch (err) { setFeedback({ message: `Não foi possível atualizar o chamado. ${friendlyError(err)}`, error: true }); } finally { lock.current = false; setBusy(null); }
  }

  if (selected) return <ModuleScreen moduleKey="admin-suporte" title={selected.titulo} subtitle={`${categoriaLabel[selected.categoria] ?? selected.categoria} · ${prioridadeLabel[selected.prioridade] ?? selected.prioridade}`} refreshing={messages.refreshing} onRefresh={messages.refresh}
    action={<Button variant="ghost" label="Fila" icon="list" onPress={() => { setSelected(null); setFeedback(null); }} />}>
    <Card>
      <Text style={styles.meta}>{selected.clinica_nome} · {selected.solicitante_nome}{selected.solicitante_email ? ` (${selected.solicitante_email})` : ''}</Text>
      <Text style={styles.body}>{selected.descricao}</Text>
      {slaVencido(selected) ? <Badge label="SLA vencido" tone="danger" /> : null}
    </Card>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    <Chips label="Status" options={STATUS.map(value => ({ value, label: statusLabel[value] }))} value={selected.status} onChange={value => void changeStatus(selected, value)} />
    <Section title="Mensagens">
      {messages.loading ? <StateView loading title="Carregando mensagens…" /> : messages.error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar as mensagens" message={messages.error} onAction={messages.reload} /> :
        !messages.data?.length ? <StateView icon="chatbubbles-outline" title="Ainda não há mensagens neste chamado." /> :
          messages.data.map(m => <View key={m.id} style={[styles.msg, m.interno && styles.internal]}>
            <Text style={styles.meta}>{m.autor_nome} · {dateLabel(m.created_at)}</Text>
            {m.interno ? <Badge label="Nota interna · só plataforma" tone="warning" /> : null}
            <Text style={styles.body}>{m.mensagem}</Text>
          </View>)}
    </Section>
    <Field label="Responder" value={draft} onChangeText={value => setDrafts(current => ({ ...current, [selected.id]: value }))} multiline maxLength={4000} hint={`${draft.length}/4000`} />
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: interno }} onPress={() => setInterno(!interno)} style={styles.toggle}>
      <Switch value={interno} onValueChange={setInterno} trackColor={{ true: colors.primary, false: colors.border }} accessibilityLabel="Nota interna, visível somente à plataforma" />
      <Text style={styles.toggleText}>Nota interna, visível somente à plataforma</Text>
    </Pressable>
    <Button label={interno ? 'Adicionar nota interna' : 'Enviar resposta'} icon="send" loading={busy === 'reply'} disabled={!draft.trim()} onPress={() => void reply()} />
  </ModuleScreen>;

  const items = tickets.data?.items ?? [];
  const filtered = Boolean(buscaAplicada || status !== 'all' || prioridade !== 'all');
  return <ModuleScreen moduleKey="admin-suporte" subtitle="Chamados, prioridade, SLA e histórico em um só lugar." refreshing={tickets.refreshing} onRefresh={tickets.refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    <Field label="Buscar" value={busca} onChangeText={setBusca} placeholder="Buscar em todos os chamados" returnKeyType="search" onSubmitEditing={() => setBuscaAplicada(sanitize(busca))} onBlur={() => setBuscaAplicada(sanitize(busca))} />
    <Chips label="Status" options={[{ value: 'all', label: 'Todos os status' }, ...STATUS.map(value => ({ value, label: statusLabel[value] }))]} value={status} onChange={setStatus} />
    <Chips label="Prioridade" options={[{ value: 'all', label: 'Todas prioridades' }, ...Object.entries(prioridadeLabel).map(([value, label]) => ({ value, label }))]} value={prioridade} onChange={setPrioridade} />
    {tickets.loading ? <StateView loading title="Carregando chamados…" /> : tickets.error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar os chamados" message={tickets.error} onAction={tickets.reload} /> :
      !items.length ? <StateView icon="chatbubbles-outline" title={filtered ? 'Nenhum chamado corresponde aos filtros' : 'Nenhum chamado por aqui'} message={filtered ? 'A busca e os filtros são aplicados a toda a fila.' : 'Os chamados da clínica aparecerão nesta lista.'}
        actionLabel={filtered ? 'Limpar filtros' : undefined} onAction={filtered ? () => { setBusca(''); setBuscaAplicada(''); setStatus('all'); setPrioridade('all'); } : undefined} /> :
        <Section title={`Fila de chamados (${tickets.data?.total ?? items.length})`}>{items.map(t => <ListRow key={t.id} title={t.titulo} onPress={() => { setSelected(t); setFeedback(null); setInterno(false); }}
          subtitle={`${t.clinica_nome} · ${t.solicitante_nome}${t.solicitante_email ? ` · ${t.solicitante_email}` : ''}`}
          meta={[statusLabel[t.status] ?? t.status, categoriaLabel[t.categoria] ?? t.categoria, t.primeira_resposta_em ? `Primeira resposta ${dateLabel(t.primeira_resposta_em)}` : `SLA ${dateLabel(t.sla_limite)}`].join(' · ')}
          right={<Badge label={slaVencido(t) ? 'SLA vencido' : prioridadeLabel[t.prioridade] ?? t.prioridade} tone={slaVencido(t) ? 'danger' : prioridadeTone[t.prioridade]} />} />)}</Section>}
    {(tickets.data?.total ?? 0) > 100 ? <Text style={styles.note}>Mostrando os 100 chamados mais recentes. Refine a busca para encontrar os demais.</Text> : null}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  meta: { color: colors.muted, fontSize: 11, marginBottom: 6 }, body: { color: colors.ink, fontSize: 13, lineHeight: 19, marginBottom: 6 },
  msg: { padding: 12, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 8 }, internal: { backgroundColor: colors.warningSoft },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, marginBottom: 12 }, toggleText: { flex: 1, color: colors.ink, fontSize: 12 },
  note: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 16 },
});
