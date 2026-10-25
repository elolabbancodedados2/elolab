import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Button, Card, Chips, Feedback, Field, StateView } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Item = { id: string; protocolo: string; categoria: string; mensagem: string; contexto: Record<string, string> | null; status: string; resposta_publica: string | null; created_at: string; clinica_id: string; user_id: string; clinica_nome: string; user_nome: string; user_email: string | null };

const categories: Record<string, string> = { duvida: 'Dúvida', problema: 'Problema', sugestao: 'Sugestão', elogio: 'Elogio', acessibilidade: 'Acessibilidade' };
const statuses: Record<string, string> = { recebido: 'Recebido', em_analise: 'Em análise', planejado: 'Planejado', resolvido: 'Resolvido', encerrado: 'Encerrado' };
const statusOptions = Object.entries(statuses).map(([value, label]) => ({ value, label }));

export default function AdminFeedbackScreen() {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const lock = useRef(false);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    // shortcut: first page of 100 only (web paginates), upgrade when the queue regularly exceeds 100.
    const res = await client.from('product_feedback').select('id,protocolo,categoria,mensagem,contexto,status,resposta_publica,created_at,clinica_id,user_id', { count: 'exact' }).order('created_at', { ascending: false }).order('id', { ascending: false }).range(0, 99);
    const rows = (must(res) ?? []) as Item[];
    const clinicIds = [...new Set(rows.map(r => r.clinica_id))];
    const userIds = [...new Set(rows.map(r => r.user_id))];
    const [clinics, people] = await Promise.all([
      clinicIds.length ? client.from('clinicas').select('id,nome').in('id', clinicIds) : { data: [], error: null },
      userIds.length ? client.from('profiles').select('id,nome,email').in('id', userIds) : { data: [], error: null },
    ]);
    const cMap = new Map<string, string>((must(clinics) ?? []).map((c: { id: string; nome: string }) => [c.id, c.nome]));
    const uMap = new Map<string, { nome: string; email: string | null }>((must(people) ?? []).map((p: { id: string; nome: string; email: string | null }) => [p.id, p]));
    const items = rows.map(r => ({ ...r, clinica_nome: cMap.get(r.clinica_id) || 'Clínica indisponível', user_nome: uMap.get(r.user_id)?.nome || 'Usuário indisponível', user_email: uMap.get(r.user_id)?.email || null }));
    return { items, total: (res.count as number | null) ?? items.length };
  }, []);

  const items = data?.items ?? [];
  const term = busca.trim().toLocaleLowerCase('pt-BR');
  const visible = items.filter(i => (filtro === 'todos' || i.status === filtro) && (!term || [i.protocolo, i.mensagem, categories[i.categoria], i.clinica_nome, i.user_nome, i.user_email].some(v => v?.toLocaleLowerCase('pt-BR').includes(term))));
  const counts = items.reduce<Record<string, number>>((acc, i) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc; }, {});
  const pendentes = (counts.recebido || 0) + (counts.em_analise || 0);
  const total = data?.total ?? 0;
  const temFiltro = Boolean(term || filtro !== 'todos');

  // Same RPC as the web: status and public reply are always saved together.
  async function manage(item: Item, status: string, resposta: string | null, success: string, failure: string) {
    if (lock.current) return;
    lock.current = true; setBusy(item.id); setFeedback(null);
    try {
      must(await db.rpc('manage_product_feedback', { p_id: item.id, p_status: status, p_resposta: resposta }));
      setFeedback({ message: success });
      reload();
    } catch (err) { setFeedback({ message: `${failure} ${friendlyError(err)}`, error: true }); } finally { lock.current = false; setBusy(null); }
  }

  return <ModuleScreen moduleKey="admin-feedback" subtitle={total > 0 ? `${total} protocolo${total === 1 ? '' : 's'} · ${pendentes} aguardando retorno${total > 100 ? ' nos 100 mais recentes' : ''}` : 'Acompanhe sugestões e problemas enviados pelos usuários.'} refreshing={refreshing} onRefresh={refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {items.length ? <>
      <Field label="Buscar" value={busca} onChangeText={setBusca} placeholder="Protocolo, mensagem, clínica ou usuário" />
      <Chips label="Status" options={[{ value: 'todos', label: `Todos (${items.length})` }, ...statusOptions.map(o => ({ value: o.value, label: `${o.label} (${counts[o.value] || 0})` }))]} value={filtro} onChange={setFiltro} />
    </> : null}
    {loading ? <StateView loading title="Carregando protocolos…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar" message={error} onAction={reload} /> :
      !visible.length ? <StateView icon="bulb-outline" title={items.length ? 'Nenhum feedback corresponde aos filtros' : 'Nenhum feedback por aqui'} message={items.length ? 'Ajuste a busca ou o status para ver outros protocolos.' : 'Os feedbacks enviados pelas clínicas aparecerão aqui.'}
        actionLabel={temFiltro && items.length ? 'Limpar filtros' : undefined} onAction={temFiltro && items.length ? () => { setBusca(''); setFiltro('todos'); } : undefined} /> :
        visible.map(item => {
          const reply = replies[item.id] ?? item.resposta_publica ?? '';
          return <Card key={item.id} style={styles.item}>
            <Text style={styles.title}>{item.protocolo}</Text>
            <Text style={styles.meta}>{dateLabel(item.created_at)} · {categories[item.categoria] ?? item.categoria}</Text>
            <Text style={styles.meta}>{item.clinica_nome} · {item.user_nome}{item.user_email ? ` (${item.user_email})` : ''}</Text>
            <Text style={styles.body}>{item.mensagem}</Text>
            {Object.keys(item.contexto || {}).length ? <View style={styles.context}><Text style={styles.label}>Contexto informado</Text>{Object.entries(item.contexto ?? {}).map(([k, v]) => <Text key={k} style={styles.meta}>{k}: {v}</Text>)}</View> : null}
            <Chips label="Status" options={statusOptions} value={item.status} onChange={status => { if (status !== item.status) void manage(item, status, item.resposta_publica || null, 'Status do feedback atualizado', 'Falha ao atualizar.'); }} />
            <Field label="Resposta pública" value={reply} onChangeText={value => setReplies(current => ({ ...current, [item.id]: value }))} maxLength={2000} multiline />
            <Button variant="secondary" label="Publicar resposta" loading={busy === item.id} disabled={reply.trim().length < 2 || !!busy} onPress={() => void manage(item, item.status, reply.trim(), 'Resposta publicada', 'Falha ao responder.')} />
          </Card>;
        })}
    {total > 100 ? <Text style={styles.note}>Mostrando os 100 protocolos mais recentes.</Text> : null}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  item: { marginBottom: 10 }, title: { color: colors.ink, fontSize: 14, fontWeight: '700' }, meta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  body: { color: colors.ink, fontSize: 13, lineHeight: 19, marginVertical: 10 }, context: { backgroundColor: colors.primarySoft, borderRadius: 12, padding: 10, marginBottom: 10 }, label: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  note: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 16 },
});
