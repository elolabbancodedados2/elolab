import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, Segmented, StateView, Stat } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Status = 'pending' | 'fulfilled' | 'denied';
type Request = { id: string; clinica_id: string | null; paciente_id: string; request_type: 'export' | 'access' | 'correction'; status: Status; requested_at: string; prazo_em: string | null; updated_at: string; responsavel_id: string | null; base_legal: string | null; evidencia: string | null };
type Policy = { id: string; categoria: string; retencao_meses: number; base_legal: string; ativo: boolean };
type Decision = { request: Request; status: 'fulfilled' | 'denied'; evidence: string };

const statusLabel: Record<Status, string> = { pending: 'Pendente', fulfilled: 'Atendida', denied: 'Negada' };
const typeLabel: Record<string, string> = { export: 'Exportação', access: 'Acesso', correction: 'Correção' };
const due = (r: Request) => (r.prazo_em ? new Date(r.prazo_em).getTime() : Number.POSITIVE_INFINITY);

export default function AdminLgpdScreen() {
  const { session } = useAuth();
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [search, setSearch] = useState('');
  const [decision, setDecision] = useState<Decision | null>(null);
  const [policy, setPolicy] = useState({ categoria: '', meses: '60', baseLegal: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    const [cases, policies] = await Promise.all([
      client.from('lgpd_access_request_log').select('id,clinica_id,paciente_id,request_type,status,requested_at,prazo_em,fulfillment_date,updated_at,responsavel_id,base_legal,evidencia').order('requested_at', { ascending: false }).limit(500),
      client.from('platform_retention_policies').select('id,categoria,retencao_meses,base_legal,ativo,updated_at').order('categoria'),
    ]);
    return { cases: (must(cases) ?? []) as Request[], policies: (must(policies) ?? []) as Policy[] };
  }, []);

  const now = Date.now();
  const all = data?.cases ?? [];
  const pending = all.filter(r => r.status === 'pending');
  const overdue = pending.filter(r => due(r) < now).length;
  const term = search.trim().toLocaleLowerCase('pt-BR');
  const visible = all.filter(r => (filter === 'all' || r.status === filter) && (!term || [r.clinica_id, r.paciente_id, typeLabel[r.request_type], statusLabel[r.status], r.base_legal, r.evidencia].some(v => v?.toLocaleLowerCase('pt-BR').includes(term))))
    .sort((a, b) => (a.status === 'pending') !== (b.status === 'pending') ? (a.status === 'pending' ? -1 : 1) : a.status === 'pending' && due(a) !== due(b) ? due(a) - due(b) : new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime());

  async function run(key: string, action: () => Promise<void>, success: string) {
    if (lock.current) return;
    lock.current = true; setBusy(key); setFeedback(null);
    try { await action(); setFeedback({ message: success }); reload(); } catch (err) { setFeedback({ message: friendlyError(err), error: true }); } finally { lock.current = false; setBusy(null); }
  }

  const evidence = decision?.evidence.trim() ?? '';
  const months = Number(policy.meses);
  const policyValid = policy.categoria.trim().length >= 2 && policy.categoria.trim().length <= 100 && policy.baseLegal.trim().length >= 10 && policy.baseLegal.trim().length <= 1000 && Number.isSafeInteger(months) && months >= 1 && months <= 360;

  return <ModuleScreen moduleKey="admin-lgpd" subtitle={data ? `${all.length} solicitações · ${pending.length} pendentes · ${overdue} com prazo vencido` : 'Acompanhe solicitações dos titulares e regras de retenção sem exibir conteúdo clínico.'} refreshing={refreshing} onRefresh={refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando solicitações…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar as solicitações" message={error} onAction={reload} /> : <>
      <View style={styles.stats}>
        <Stat label="Solicitações carregadas" value={all.length} onPress={() => setFilter('all')} />
        <Stat label="Pendentes" value={pending.length} tone="warning" onPress={() => setFilter('pending')} />
        <Stat label="Prazo vencido" value={overdue} tone={overdue ? 'danger' : 'neutral'} />
      </View>
      {decision ? <Card style={styles.form}>
        <Text style={styles.title}>Registrar decisão da solicitação</Text>
        <Text style={styles.note}>{typeLabel[decision.request.request_type]} · titular {decision.request.paciente_id.slice(0, 8)}…. A decisão e a justificativa serão auditadas.</Text>
        <Chips label="Decisão" options={[{ value: 'fulfilled', label: 'Atendida' }, { value: 'denied', label: 'Negada' }]} value={decision.status} onChange={status => setDecision({ ...decision, status })} />
        <Field label="Justificativa e evidência (20 a 1.000 caracteres)" value={decision.evidence} onChangeText={text => setDecision({ ...decision, evidence: text })} multiline maxLength={1000} placeholder="Descreva como a solicitação foi atendida ou por que foi negada." hint={`${evidence.length}/1.000 caracteres. Evite incluir dados de saúde.`} />
        <View style={styles.actions}><Button variant="ghost" label="Cancelar" disabled={!!busy} onPress={() => setDecision(null)} />
          <Button label="Salvar decisão" loading={busy === 'decision'} disabled={evidence.length < 20} onPress={() => void run('decision', async () => { must(await db.rpc('platform_update_lgpd_request', { p_id: decision.request.id, p_status: decision.status, p_evidence: evidence })); setDecision(null); }, 'Decisão registrada com justificativa.')} /></View>
      </Card> : null}
      <Section title="Solicitações de titulares">
        <Field label="Buscar" value={search} onChangeText={setSearch} placeholder="Buscar clínica, titular ou justificativa" />
        <Segmented options={[{ value: 'all', label: 'Todos' }, { value: 'pending', label: 'Pendentes' }, { value: 'fulfilled', label: 'Atendidas' }, { value: 'denied', label: 'Negadas' }]} value={filter} onChange={setFilter} />
        {!visible.length ? <StateView icon="shield-checkmark-outline" title={all.length ? 'Nenhuma solicitação corresponde aos filtros' : 'Nenhuma solicitação encontrada'} message={all.length ? 'Ajuste a busca ou o status para ver outras solicitações.' : 'Solicitações de titulares feitas pelas clínicas aparecerão aqui.'} /> : visible.map(r => {
          const late = r.status === 'pending' && due(r) < now;
          return <View key={r.id}>
            <ListRow title={typeLabel[r.request_type] ?? r.request_type} subtitle={`Clínica ${r.clinica_id || 'não identificada'} · titular ${r.paciente_id.slice(0, 8)}… · Recebida: ${dateLabel(r.requested_at)}`}
              meta={[r.prazo_em ? `Prazo ${dateLabel(r.prazo_em)}` : 'Sem prazo', r.status === 'pending' ? r.base_legal || 'Base legal pendente' : `Atualizada em ${dateLabel(r.updated_at)}`].join(' · ')}
              right={<Badge label={late ? 'Prazo vencido' : statusLabel[r.status] ?? r.status} tone={late ? 'danger' : r.status === 'pending' ? 'warning' : r.status === 'fulfilled' ? 'success' : 'neutral'} />} />
            {r.evidencia ? <Text style={styles.evidence}>Registro: {r.evidencia}</Text> : null}
            {r.status === 'pending' && session ? <View style={styles.actions}><Button variant="secondary" label="Registrar decisão" onPress={() => { setDecision({ request: r, status: 'fulfilled', evidence: '' }); setFeedback(null); }} /></View> : null}
          </View>;
        })}
        {all.length === 500 ? <Text style={styles.note}>Mostrando as 500 solicitações mais recentes.</Text> : null}
      </Section>
      <Section title="Políticas de retenção">
        <Card style={styles.form}>
          <Field label="Categoria" value={policy.categoria} maxLength={100} onChangeText={categoria => setPolicy({ ...policy, categoria })} placeholder="Categoria" />
          <Field label="Meses" value={policy.meses} keyboardType="number-pad" onChangeText={meses => setPolicy({ ...policy, meses })} hint="De 1 a 360 meses" />
          <Field label="Base legal" value={policy.baseLegal} maxLength={1000} multiline onChangeText={baseLegal => setPolicy({ ...policy, baseLegal })} placeholder="Base legal e finalidade da retenção" />
          <Button label="Adicionar" icon="add" disabled={!policyValid} loading={busy === 'policy'} onPress={() => void run('policy', async () => {
            const { error: err } = await db.from('platform_retention_policies').insert({ categoria: policy.categoria.trim(), retencao_meses: months, base_legal: policy.baseLegal.trim(), updated_by: session?.user.id });
            if (err) throw new Error(err.code === '23505' ? 'Já existe uma política para essa categoria.' : err.message);
            setPolicy({ categoria: '', meses: policy.meses, baseLegal: '' });
          }, 'Política de retenção adicionada.')} />
        </Card>
        {!data?.policies.length ? <Text style={styles.note}>Nenhuma política cadastrada. Use o formulário acima para adicionar a primeira.</Text> : data.policies.map(p =>
          <ListRow key={p.id} title={p.categoria} subtitle={p.base_legal} right={<View style={styles.badges}><Badge label={p.ativo ? 'Ativa' : 'Inativa'} tone={p.ativo ? 'success' : 'neutral'} /><Badge label={`${p.retencao_meses} meses`} tone="primary" /></View>} />)}
      </Section>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({ stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }, form: { marginTop: 14 }, title: { color: colors.ink, fontSize: 15, fontWeight: '700', marginBottom: 6 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, paddingVertical: 8 }, evidence: { color: colors.ink, fontSize: 11, backgroundColor: colors.primarySoft, borderRadius: 10, padding: 8, marginTop: 6 }, note: { color: colors.muted, fontSize: 11, marginVertical: 8 }, badges: { gap: 4, alignItems: 'flex-end' } });
