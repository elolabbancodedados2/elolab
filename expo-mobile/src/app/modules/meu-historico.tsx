import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, StateView, type Tone } from '../../components/ui';
import { dateLabel, parseDateBR } from '../../lib/format';
import { must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Action = 'create' | 'update' | 'delete' | 'access' | 'sign' | 'edit_request';
type Event = { event_id: string; action: Action; resource: string; occurred_at: string; total_count: number };
const PAGE_SIZE = 20;
const actions: Record<Action, string> = { create: 'Criou', update: 'Atualizou', delete: 'Excluiu', access: 'Acessou', sign: 'Assinou', edit_request: 'Solicitou edição' };
const actionTone: Record<Action, Tone> = { create: 'success', update: 'primary', delete: 'danger', access: 'neutral', sign: 'info', edit_request: 'warning' };
const resources: Record<string, string> = { pacientes: 'Paciente', agendamentos: 'Agendamento', prontuarios: 'Prontuário', prescricoes: 'Prescrição', atestados: 'Atestado', exames: 'Exame', tarefas: 'Tarefa', contas_receber: 'Conta a receber', contas_pagar: 'Conta a pagar', support_access: 'Acesso de suporte' };
const resourceLabel = (v: string) => resources[v] ?? v.split('_').join(' ').replace(/^./, l => l.toUpperCase());

export default function MyHistoryScreen() {
  const { session, profile } = useAuth();
  const userId = session?.user.id;
  const clinicId = profile?.clinicaId;
  const [action, setAction] = useState<Action | 'all'>('all');
  const [resource, setResource] = useState('');
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [applied, setApplied] = useState({ resource: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!userId || !clinicId) return undefined;
    // Clinic timezone bounds, same as the web.
    const rows = must<Event[]>(await client.rpc('meu_historico_acoes', { p_action: action === 'all' ? null : action, p_collection: applied.resource || null, p_from: applied.from ? new Date(`${applied.from}T00:00:00-03:00`).toISOString() : null, p_to: applied.to ? new Date(`${applied.to}T23:59:59.999-03:00`).toISOString() : null, p_page: page, p_page_size: PAGE_SIZE })) ?? [];
    return rows;
  }, [userId, clinicId, action, applied, page]);

  const events = data ?? [];
  const total = Number(events[0]?.total_count ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = action !== 'all' || Boolean(applied.resource || applied.from || applied.to);

  function apply() {
    const from = fromText.trim() ? parseDateBR(fromText) : '';
    const to = toText.trim() ? parseDateBR(toText) : '';
    if (from === null || to === null) return setFormError('Use a data no formato DD/MM/AAAA.');
    if (from && to && from > to) return setFormError('A data inicial deve ser anterior à final.');
    setFormError(null); setPage(1); setApplied({ resource: resource.trim(), from, to });
  }
  function clear() { setAction('all'); setResource(''); setFromText(''); setToText(''); setApplied({ resource: '', from: '', to: '' }); setPage(1); setFormError(null); }

  return <ModuleScreen moduleKey="meu-historico" subtitle={`Consulte as ações realizadas pela sua conta nesta clínica.${data ? ` ${total} ${total === 1 ? 'ação registrada' : 'ações registradas'}${hasFilters ? ' com os filtros atuais' : ''}.` : ''}`} refreshing={refreshing} onRefresh={refresh}>
    <Card style={styles.notice}><Text style={styles.noticeText}>Este histórico é pessoal. Nomes de pacientes, conteúdo alterado e identificadores de registros não são exibidos.</Text></Card>
    <Section title="Filtros">
      <Chips label="Ação" options={[{ value: 'all' as const, label: 'Todas' }, ...(Object.keys(actions) as Action[]).map(value => ({ value, label: actions[value] }))]} value={action} onChange={v => { setAction(v); setPage(1); }} />
      <Field label="Recurso" value={resource} onChangeText={setResource} placeholder="Todos" autoCapitalize="none" hint="Nome técnico, por exemplo: pacientes, tarefas" />
      <View style={styles.row}><View style={styles.fill}><Field label="De" value={fromText} onChangeText={setFromText} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" /></View><View style={styles.fill}><Field label="Até" value={toText} onChangeText={setToText} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" /></View></View>
      {formError ? <Feedback message={formError} error /> : null}
      <View style={styles.actions}>{hasFilters ? <Button variant="ghost" icon="close" label="Limpar filtros" onPress={clear} /> : null}<Button variant="secondary" icon="search" label="Aplicar" onPress={apply} /></View>
    </Section>
    {loading ? <StateView loading title="Carregando histórico…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar seu histórico" message={error} onAction={reload} /> : !events.length ? <StateView icon="search-outline" title="Nenhuma ação encontrada" message={hasFilters ? 'Nenhuma ação corresponde aos filtros. Amplie o período ou limpe os filtros.' : 'Suas ações aparecem aqui conforme você usa a plataforma.'} actionLabel={hasFilters ? 'Limpar filtros' : undefined} onAction={hasFilters ? clear : undefined} /> : <>
      <Section title={`${total} ${total === 1 ? 'ação encontrada' : 'ações encontradas'}`}>{events.map(e => <ListRow key={e.event_id} title={resourceLabel(e.resource)} meta={dateLabel(e.occurred_at)} right={<Badge label={actions[e.action] ?? e.action} tone={actionTone[e.action] ?? 'neutral'} />} />)}</Section>
      <View style={styles.pager}><Button variant="secondary" label="Anterior" disabled={page === 1 || refreshing} onPress={() => setPage(p => Math.max(1, p - 1))} /><Text style={styles.page}>Página {page} de {pages}</Text><Button variant="secondary" label="Próxima" disabled={page >= pages || refreshing} onPress={() => setPage(p => p + 1)} /></View>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  notice: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }, noticeText: { color: colors.deep, fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 10 }, fill: { flex: 1 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 14 }, page: { color: colors.muted, fontSize: 12 },
});
