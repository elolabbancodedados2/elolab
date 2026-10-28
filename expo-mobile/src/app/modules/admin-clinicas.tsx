import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, Section, Stat, StateView, type Tone } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Clinic = { clinica_id: string; clinica_nome: string; owner_nome: string | null; owner_email: string | null; created_at: string; suspensa: boolean; plano_nome: string | null; assinatura_status: string | null; em_trial: boolean | null; trial_fim: string | null; data_fim: string | null; total_medicos: number; total_funcionarios: number; total_pacientes: number; total_agendamentos: number; arquivada?: boolean };
type Orphan = { id: string; nome: string; email: string; plano_slug: string; updated_at: string; reminder_count: number | null };
type Filter = 'todas' | 'ativas' | 'trial' | 'suspensas';

const statusLabels: Record<string, string> = { ativa: 'Ativa', trial: 'Em teste', expirada: 'Expirada', cancelada: 'Cancelada', pendente: 'Pendente' };
const statusTone: Record<string, Tone> = { ativa: 'success', trial: 'info', expirada: 'warning', cancelada: 'danger', pendente: 'warning' };
const valid = (c: Clinic) => { const end = c.data_fim || c.trial_fim; return !end || new Date(end).getTime() >= Date.now(); };
const tests: Record<Filter, (c: Clinic) => boolean> = {
  todas: () => true,
  ativas: c => !c.arquivada && !c.suspensa && c.assinatura_status === 'ativa' && !c.em_trial && valid(c),
  trial: c => !c.arquivada && !c.suspensa && (c.assinatura_status === 'trial' || !!c.em_trial) && valid(c),
  suspensas: c => c.suspensa,
};
const day = (v: string | null) => v ? dateLabel(v).slice(0, 10) : '—';

export default function AdminClinicsScreen() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('todas');
  const [archived, setArchived] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    const [clinics, orphans] = await Promise.all([
      client.rpc('platform_get_clinicas_overview'),
      client.from('registros_pendentes').select('id, nome, email, plano_slug, updated_at, reminder_count', { count: 'exact' }).eq('status', 'pago').is('user_id', null).order('updated_at', { ascending: false }).order('id', { ascending: false }).range(0, 49),
    ]);
    return { clinics: (must<Clinic[]>(clinics) ?? []), orphans: orphans.error ? null : (orphans.data ?? []) as Orphan[], orphanTotal: (orphans.count ?? 0) as number };
  }, []);

  const all = data?.clinics ?? [];
  const n = (f: Filter) => all.filter(tests[f]).length;
  const shown = all.filter(c => archived || !c.arquivada);
  const q = search.trim().toLowerCase();
  const list = shown.filter(tests[filter]).filter(c => !q || [c.clinica_nome, c.owner_email, c.owner_nome, c.plano_nome].some(v => v?.toLowerCase().includes(q)));
  const archivedCount = all.filter(c => c.arquivada).length;

  function resend(o: Orphan) {
    Alert.alert('Reenviar código', `Enviar novamente o código de ativação para ${o.email}?`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Reenviar', onPress: () => void (async () => {
        setBusy(o.id); setFeedback(null);
        try {
          const res = must<{ success?: boolean; error?: string }>(await db.functions.invoke('resend-pending-registration', { body: { registration_id: o.id } }));
          if (!res?.success) throw new Error(res?.error || 'Não foi possível reenviar o convite.');
          setFeedback({ message: `Código reenviado para ${o.email}` }); reload();
        } catch (err) { setFeedback({ message: friendlyError(err), error: true }); } finally { setBusy(null); }
      })() },
    ]);
  }

  return <ModuleScreen moduleKey="admin-clinicas" subtitle={data ? `${all.length} clínicas · ${n('ativas')} assinaturas ativas · ${n('trial')} em teste${n('suspensas') ? ` · ${n('suspensas')} com acesso suspenso` : ''}${data.orphanTotal ? ` · ${data.orphanTotal} pagamentos aguardando ativação` : ''}` : 'Visão global de todas as clínicas, assinaturas e uso.'} refreshing={refreshing} onRefresh={refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando clínicas…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar" message={error} onAction={reload} /> : <>
      {data?.orphans === null ? <Feedback error message="Não foi possível consultar os pagamentos que aguardam ativação." /> : data?.orphans.length ? <Card style={styles.warn}>
        <Text style={styles.warnTitle}>Pagamentos órfãos ({data.orphans.length} nesta página · {data.orphanTotal} no total)</Text>
        <Text style={styles.muted}>Clientes que pagaram mas ainda não criaram a conta. Reenvie o código quando necessário.</Text>
        {data.orphans.map(o => <View key={o.id} style={styles.orphan}>
          <View style={styles.fill}><Text style={styles.title}>{o.nome}</Text><Text style={styles.muted}>{o.email} · {o.plano_slug} · {dateLabel(o.updated_at)} · {o.reminder_count ?? 0} lembrete(s)</Text></View>
          <Button variant="secondary" icon="mail-outline" label="Reenviar" loading={busy === o.id} disabled={busy !== null} onPress={() => resend(o)} />
        </View>)}
        <Text style={styles.muted}>A reconciliação em lote e as páginas seguintes ficam no navegador.</Text>
        <OpenOnWeb path="/admin/clinicas" label="Reconciliar no navegador" />
      </Card> : null}
      <View style={styles.grid}>
        <Stat label={`Clínicas · ${archivedCount} arquivada(s)`} value={all.length} onPress={() => setFilter('todas')} />
        <Stat label="Assinaturas ativas" value={n('ativas')} tone="success" onPress={() => setFilter(filter === 'ativas' ? 'todas' : 'ativas')} />
        <Stat label="Em trial" value={n('trial')} tone="info" onPress={() => setFilter(filter === 'trial' ? 'todas' : 'trial')} />
        <Stat label="Pacientes (total)" value={all.reduce((s, c) => s + Number(c.total_pacientes || 0), 0)} />
      </View>
      <Section title="Todas as clínicas" action={<Text style={styles.muted}>{list.length} de {shown.length}</Text>}>
        <Field label="Buscar" value={search} onChangeText={setSearch} placeholder="Buscar por clínica, dono ou plano..." autoCapitalize="none" />
        <Chips options={[{ value: 'todas', label: 'Todas' }, { value: 'ativas', label: 'Ativas' }, { value: 'trial', label: 'Em teste' }, { value: 'suspensas', label: `Acesso suspenso (${n('suspensas')})` }]} value={filter} onChange={setFilter} />
        {archivedCount ? <Button variant="ghost" icon="archive-outline" label={archived ? 'Ocultar arquivadas' : `Ver arquivadas (${archivedCount})`} onPress={() => setArchived(v => !v)} /> : null}
        {!list.length ? <StateView icon="business-outline" title="Nenhuma clínica encontrada." message={filter !== 'todas' || q ? 'Nenhuma clínica corresponde aos filtros atuais.' : 'Quando um cliente concluir o cadastro, a clínica aparece aqui.'} /> : list.map(c => {
          const end = c.data_fim || c.trial_fim;
          return <Card key={c.clinica_id} style={styles.item}>
            <View style={styles.row}>
              <Text style={[styles.title, styles.fill, c.arquivada && styles.strike]}>{c.clinica_nome}</Text>
              {c.arquivada ? <Badge label="Arquivada" /> : null}{c.suspensa ? <Badge label="Acesso suspenso" tone="danger" /> : null}
            </View>
            <Text style={styles.muted}>{c.owner_nome || '—'} · {c.owner_email || '—'}</Text>
            <View style={styles.row}>
              <Badge label={c.plano_nome || 'sem plano'} tone="primary" />
              <Badge label={c.assinatura_status ? statusLabels[c.assinatura_status] || c.assinatura_status : 'Sem assinatura'} tone={c.assinatura_status ? statusTone[c.assinatura_status] ?? 'neutral' : 'neutral'} />
            </View>
            {end ? <Text style={styles.muted}>{new Date(end).getTime() < Date.now() ? 'Data vencida em' : 'Vencimento'} {day(end)}</Text> : null}
            <Text style={styles.muted}>{c.total_medicos} médicos · {c.total_funcionarios} funcionários · {c.total_pacientes} pacientes · {c.total_agendamentos} agendamentos · criada em {day(c.created_at)}</Text>
          </Card>;
        })}
      </Section>
      <Section title="Entrar, arquivar ou excluir">
        <Text style={styles.muted}>Entrar numa clínica dá acesso a prontuários de pacientes e exige motivo registrado em auditoria; arquivar e excluir também pedem confirmação detalhada. Faça essas ações no navegador.</Text>
        <OpenOnWeb path="/admin/clinicas" />
      </Section>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }, fill: { flex: 1 },
  item: { marginBottom: 10, gap: 6, padding: 12 }, warn: { borderColor: colors.warning, backgroundColor: colors.warningSoft, gap: 8 }, warnTitle: { color: colors.warning, fontSize: 13, fontWeight: '700' },
  orphan: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { color: colors.ink, fontSize: 13, fontWeight: '700' }, strike: { textDecorationLine: 'line-through', color: colors.muted }, muted: { color: colors.muted, fontSize: 11, lineHeight: 16 },
});
