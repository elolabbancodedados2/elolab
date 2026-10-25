import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, Stat, StateView, type Tone } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Status = 'requested' | 'approved' | 'denied' | 'revoked' | 'expired';
type Request = { id: string; clinica_id: string; reason: string; scopes: string[] | null; status: Status; expires_at: string | null; created_at: string };
type Context = { request_id: string; expires_at: string; scopes: string[]; active_users: number | null; failed_automations_24h: number | null; open_support_tickets: number | null };

const statusLabels: Record<Status, string> = { requested: 'Aguardando decisão', approved: 'Aprovado', denied: 'Negado', revoked: 'Revogado', expired: 'Expirado' };
const statusTone: Record<Status, Tone> = { requested: 'neutral', approved: 'primary', denied: 'danger', revoked: 'danger', expired: 'neutral' };
const scopeLabels: Record<string, string> = { diagnostics: 'Indicadores operacionais', integration_logs: 'Logs de integração', configuration: 'Configuração' };
// Same rule as src/lib/supportAccess.ts on the web: an approved request past its expiry is shown as expired.
const current = (r: Request): Status => r.status === 'approved' && r.expires_at && new Date(r.expires_at).getTime() <= Date.now() ? 'expired' : r.status;
const scopes = (list: string[] | null | undefined) => (list ?? []).map(s => scopeLabels[s] ?? s).join(' · ');

export default function AdminAssistedAccessScreen() {
  const [clinicaId, setClinicaId] = useState('');
  const [clinicSearch, setClinicSearch] = useState('');
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [context, setContext] = useState<Context | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const lock = useRef(false);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    const [clinics, requests] = await Promise.all([
      client.from('clinicas').select('id,nome').eq('arquivada', false).order('nome'),
      client.from('support_access_requests').select('*').order('created_at', { ascending: false }).limit(100),
    ]);
    return { clinics: (must(clinics) ?? []) as { id: string; nome: string }[], requests: (must(requests) ?? []) as Request[] };
  }, []);

  const clinicName = (id: string) => data?.clinics.find(c => c.id === id)?.nome ?? id;
  const term = search.trim().toLocaleLowerCase('pt-BR');
  const visible = (data?.requests ?? []).filter(r => (filter === 'all' || current(r) === filter) && (!term || [r.reason, clinicName(r.clinica_id), r.id, statusLabels[current(r)], scopes(r.scopes)].some(v => v.toLocaleLowerCase('pt-BR').includes(term))));
  const clinicTerm = clinicSearch.trim().toLocaleLowerCase('pt-BR');
  const clinicOptions = (data?.clinics ?? []).filter(c => c.id === clinicaId || (clinicTerm && c.nome.toLocaleLowerCase('pt-BR').includes(clinicTerm))).slice(0, 8);
  const validReason = reason.trim().length >= 10 && reason.trim().length <= 500;
  const shownContext = context && new Date(context.expires_at).getTime() > Date.now() && data?.requests.some(r => r.id === context.request_id && current(r) === 'approved') ? context : null;

  async function run(key: string, action: () => Promise<void>, success: string, failure: string) {
    if (lock.current) return;
    lock.current = true; setBusy(key); setFeedback(null);
    try { await action(); setFeedback({ message: success }); reload(); } catch (err) { setFeedback({ message: `${failure} ${friendlyError(err)}`, error: true }); } finally { lock.current = false; setBusy(null); }
  }

  const send = () => void run('send', async () => { must(await db.rpc('request_support_access', { p_clinica_id: clinicaId, p_reason: reason.trim(), p_scopes: ['diagnostics'] })); setReason(''); }, 'Pedido enviado para aprovação da clínica.', 'Não foi possível criar o pedido.');

  const revoke = (r: Request) => Alert.alert('Revogar o acesso assistido?', 'O acesso será encerrado imediatamente. Esta ação também ficará registrada na trilha de auditoria.', [
    { text: 'Voltar', style: 'cancel' },
    { text: 'Confirmar', style: 'destructive', onPress: () => void run(r.id, async () => { must(await db.rpc('revoke_support_access', { p_request_id: r.id })); setContext(null); }, 'Acesso assistido revogado.', 'Não foi possível revogar o acesso.') },
  ]);

  async function diagnose(r: Request) {
    setBusy(`ctx-${r.id}`); setFeedback(null);
    try { setContext(must<Context>(await db.rpc('platform_support_context', { p_request_id: r.id }))); } catch (err) { setFeedback({ message: `O diagnóstico não está disponível. ${friendlyError(err)}`, error: true }); } finally { setBusy(null); }
  }

  return <ModuleScreen moduleKey="admin-acesso-assistido" subtitle="Acesso temporário, aprovado pela clínica e limitado a dados operacionais. Ações registradas em auditoria." refreshing={refreshing} onRefresh={refresh}>
    <Card>
      <Text style={styles.title}>Solicitar acesso à clínica</Text>
      <Text style={styles.copy}>A clínica precisa aprovar o pedido. Este escopo libera apenas indicadores operacionais e expira após 2 horas; não inclui logs nem dados clínicos de pacientes.</Text>
      <Field label="Clínica" value={clinicSearch} onChangeText={setClinicSearch} placeholder="Digite para buscar uma clínica" hint={clinicaId ? `Selecionada: ${clinicName(clinicaId)}` : undefined} />
      {clinicOptions.length ? <Chips options={clinicOptions.map(c => ({ value: c.id, label: c.nome }))} value={clinicaId || null} onChange={setClinicaId} /> : null}
      <Field label="Motivo do pedido" value={reason} onChangeText={setReason} maxLength={500} multiline placeholder="Descreva o problema que precisa ser investigado" hint="Mínimo de 10 caracteres. Não inclua dados de pacientes." />
      <Button label="Enviar pedido" icon="send" loading={busy === 'send'} disabled={!clinicaId || !validReason || loading} onPress={send} />
    </Card>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {shownContext ? <Section title="Diagnóstico operacional autorizado" action={<Button variant="ghost" label="Fechar diagnóstico" onPress={() => setContext(null)} />}>
      <Text style={styles.copy}>Indicadores sem prontuários ou identificação de pacientes. Autorização expira em {dateLabel(shownContext.expires_at)}.</Text>
      <View style={styles.stats}>
        <Stat label="Usuários ativos" value={shownContext.active_users ?? '—'} />
        <Stat label="Falhas de automação · 24h" value={shownContext.failed_automations_24h ?? '—'} tone="warning" />
        <Stat label="Chamados em aberto" value={shownContext.open_support_tickets ?? '—'} tone="info" />
      </View>
      <Text style={styles.copy}>Escopos autorizados: {scopes(shownContext.scopes)}</Text>
    </Section> : null}
    <Section title="Pedidos enviados">
      {loading ? <StateView loading title="Carregando pedidos…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar os pedidos." message={error} onAction={reload} /> :
        !data?.requests.length ? <StateView icon="shield-checkmark-outline" title="Nenhum pedido de acesso" message="Quando houver um pedido, ele aparecerá aqui para revisão." /> : <>
          <Field label="Buscar" value={search} onChangeText={setSearch} placeholder="Buscar motivo, clínica ou código" />
          <Chips options={[{ value: 'all' as const, label: 'Todos os status' }, ...(Object.keys(statusLabels) as Status[]).map(value => ({ value, label: statusLabels[value] }))]} value={filter} onChange={setFilter} />
          <Text style={styles.copy}>{visible.length} de {data.requests.length} pedidos carregados. Acompanhe as autorizações concedidas pela equipe da clínica.</Text>
          {!visible.length ? <StateView title="Nenhum pedido corresponde à busca ou ao status." actionLabel="Limpar filtros" onAction={() => { setSearch(''); setFilter('all'); }} /> : visible.map(r => {
            const status = current(r);
            return <View key={r.id}>
              <ListRow title={r.reason} subtitle={`Clínica: ${clinicName(r.clinica_id)} · ${scopes(r.scopes) || 'Sem escopos informados'}`} meta={status === 'approved' && r.expires_at ? `Expira ${dateLabel(r.expires_at)}` : `Criado em ${dateLabel(r.created_at)}`} right={<Badge label={statusLabels[status]} tone={statusTone[status]} />} />
              {status === 'approved' ? <View style={styles.actions}>
                <Button variant="secondary" icon="eye-outline" label="Ver diagnóstico" loading={busy === `ctx-${r.id}`} onPress={() => void diagnose(r)} />
                <Button variant="danger" label="Revogar" disabled={!!busy} loading={busy === r.id} onPress={() => revoke(r)} />
              </View> : null}
            </View>;
          })}
          {data.requests.length === 100 ? <Text style={styles.copy}>Mostrando os 100 pedidos mais recentes. Pedidos mais antigos podem não aparecer aqui.</Text> : null}
        </>}
    </Section>
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 14, fontWeight: '700', marginBottom: 6 }, copy: { color: colors.muted, fontSize: 11, lineHeight: 16, marginBottom: 12 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10 },
});
