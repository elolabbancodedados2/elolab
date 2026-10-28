import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Section, StateView, type Tone } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Status = 'requested' | 'approved' | 'denied' | 'revoked' | 'expired';
type Request = { id: string; reason: string; scopes: string[] | null; status: Status; expires_at: string | null; created_at: string };
type Action = 'approved' | 'denied' | 'revoked';

const statusLabels: Record<Status, string> = { requested: 'Aguardando decisão', approved: 'Aprovado', denied: 'Negado', revoked: 'Revogado', expired: 'Expirado' };
const statusTone: Record<Status, Tone> = { requested: 'warning', approved: 'primary', denied: 'danger', revoked: 'danger', expired: 'neutral' };
const scopeLabels: Record<string, string> = { diagnostics: 'Indicadores operacionais', integration_logs: 'Logs de integração', configuration: 'Configuração' };
// Same rule as src/lib/supportAccess.ts: an approval past expires_at is shown as expired.
const currentStatus = (r: Request): Status => r.status === 'approved' && r.expires_at && new Date(r.expires_at).getTime() <= Date.now() ? 'expired' : r.status;
const confirmCopy: Record<Action, [string, string]> = {
  approved: ['Autorizar suporte por 2 horas?', 'A equipe da plataforma poderá consultar apenas os indicadores operacionais e os escopos descritos no pedido. A autorização expira automaticamente em 2 horas.'],
  denied: ['Negar este pedido de suporte?', 'O suporte não receberá acesso aos indicadores desta clínica.'],
  revoked: ['Revogar o acesso assistido?', 'O acesso será encerrado imediatamente. Esta ação também ficará registrada na trilha de auditoria.'],
};
const success: Record<Action, string> = { approved: 'Acesso autorizado por 2 horas.', denied: 'Pedido de acesso negado.', revoked: 'Acesso assistido revogado.' };

export default function AssistedAccessScreen() {
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const lock = useRef(false);

  // RLS scopes support_access_requests to the admin's clinic, as on the web.
  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => must<Request[]>(await client.from('support_access_requests').select('*').order('created_at', { ascending: false }).limit(100)) ?? [], []);
  const visible = (data ?? []).filter(r => filter === 'all' || currentStatus(r) === filter);

  function confirm(request: Request, action: Action) {
    const [title, message] = confirmCopy[action];
    Alert.alert(title, message, [{ text: 'Voltar', style: 'cancel' }, { text: 'Confirmar', style: action === 'approved' ? 'default' : 'destructive', onPress: () => void run(request, action) }]);
  }

  async function run(request: Request, action: Action) {
    if (lock.current) return;
    lock.current = true; setBusy(request.id); setFeedback(null);
    try {
      must(action === 'revoked'
        ? await db.rpc('revoke_support_access', { p_request_id: request.id })
        : await db.rpc('decide_support_access', { p_request_id: request.id, p_decision: action, p_hours: 2 }));
      setFeedback({ message: success[action] });
    } catch (err) {
      setFeedback({ message: `${action === 'revoked' ? 'Não foi possível revogar o acesso.' : 'Não foi possível registrar a decisão.'} ${friendlyError(err)}`, error: true });
    } finally { lock.current = false; setBusy(null); reload(); }
  }

  return <ModuleScreen moduleKey="acesso-assistido" subtitle="Acesso temporário, aprovado pela clínica e limitado a dados operacionais. Ações registradas em auditoria." refreshing={refreshing} onRefresh={refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    <Chips options={[{ value: 'all' as const, label: 'Todos os status' }, ...(Object.keys(statusLabels) as Status[]).map(value => ({ value, label: statusLabels[value] }))]} value={filter} onChange={setFilter} />
    {loading ? <StateView loading title="Carregando pedidos…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar os pedidos." message={error} onAction={reload} /> : !data?.length ? <StateView icon="shield-checkmark-outline" title="Nenhum pedido de acesso" message="Quando houver um pedido, ele aparecerá aqui para revisão." /> : !visible.length ? <StateView icon="search-outline" title="Nenhum pedido corresponde ao status." actionLabel="Limpar filtros" onAction={() => setFilter('all')} /> :
      <Section title={`${visible.length} de ${data.length} pedidos carregados`}>{visible.map(r => {
        const status = currentStatus(r);
        return <Card key={r.id} style={styles.item}>
          <View style={styles.head}><Badge label={statusLabels[status]} tone={statusTone[status]} />{status === 'approved' && r.expires_at ? <Text style={styles.meta}>Expira {dateLabel(r.expires_at)}</Text> : null}</View>
          <Text selectable style={styles.reason}>{r.reason}</Text>
          <Text style={styles.meta}>{(r.scopes ?? []).map(s => scopeLabels[s] ?? s).join(' · ') || 'Sem escopos informados'}</Text>
          <Text style={styles.meta}>Criado em {dateLabel(r.created_at)}</Text>
          {status === 'requested' || status === 'approved' ? <View style={styles.actions}>
            {status === 'requested' ? <><Button variant="secondary" icon="close" label="Negar" disabled={busy !== null} onPress={() => confirm(r, 'denied')} /><Button icon="checkmark" label="Autorizar por 2h" loading={busy === r.id} disabled={busy !== null} onPress={() => confirm(r, 'approved')} /></> : null}
            {status === 'approved' ? <Button variant="danger" icon="close" label="Revogar" loading={busy === r.id} disabled={busy !== null} onPress={() => confirm(r, 'revoked')} /> : null}
          </View> : null}
        </Card>;
      })}</Section>}
    {data?.length === 100 ? <Text style={styles.note}>Mostrando os 100 pedidos mais recentes. Pedidos mais antigos podem não aparecer aqui.</Text> : null}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  item: { marginBottom: 10, gap: 6 }, head: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }, reason: { color: colors.ink, fontSize: 13, fontWeight: '700', lineHeight: 19 }, meta: { color: colors.muted, fontSize: 11 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 6 }, note: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 16 },
});
