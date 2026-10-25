import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Field, Section, Segmented, StateView, Stat, type Tone } from '../../components/ui';
import { dateLabel } from '../../lib/format';
import { must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type State = { configured: boolean; healthy: boolean; status?: string; total?: number; last_activity?: string | null };
type Clinic = { clinica_id: string; clinica_nome: string; ativo: boolean; whatsapp: State; email: State; apis: State; ia: State; pagamentos: State };
type Overview = { generated_at: string; clinics: Clinic[] };

const services = [['WhatsApp', 'whatsapp'], ['E-mail', 'email'], ['APIs/webhooks', 'apis'], ['IA', 'ia'], ['Pagamentos', 'pagamentos']] as const;
const statusLabels: Record<string, string> = { connected: 'conectado', conectado: 'conectado', open: 'conectado', close: 'desconectado', desconectado: 'desconectado', ativo: 'ativo', active: 'ativo', inativo: 'inativo', inactive: 'inativo', 'nao configurado': 'não configurado', 'nao vinculado': 'não vinculado' };
const statusLabel = (v?: string) => statusLabels[(v || '').trim().toLocaleLowerCase('pt-BR')] || v || '';
const last = (v?: string | null) => (v ? dateLabel(v) : 'Sem atividade registrada');
const badgeFor = (s: State): [string, Tone] => s.status === 'sem uso' ? ['sem uso', 'neutral'] : !s.configured ? ['não configurado', 'neutral'] : s.healthy ? ['operacional', 'success'] : ['atenção', 'danger'];
const alertsOf = (c: Clinic) => services.filter(([, key]) => c[key].configured && !c[key].healthy).length;

export default function AdminIntegrationsScreen() {
  const [search, setSearch] = useState('');
  const [onlyAlerts, setOnlyAlerts] = useState<'todas' | 'alertas'>('todas');
  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => must<Overview>(await client.rpc('platform_clinic_integration_overview')), []);

  const all = data?.clinics ?? [];
  const term = search.trim().toLowerCase();
  const clinics = all.filter(c => (!term || c.clinica_nome.toLowerCase().includes(term)) && (onlyAlerts === 'todas' || alertsOf(c) > 0));
  const unhealthy = all.reduce((sum, c) => sum + alertsOf(c), 0);
  const withAlerts = all.filter(c => alertsOf(c) > 0).length;

  return <ModuleScreen moduleKey="admin-integracoes" title="Integrações por Clínica" subtitle={data ? `${all.length} clínicas monitoradas · ${unhealthy} alertas em ${withAlerts} clínicas.` : 'Status registrado, sem exposição de chaves, URLs ou payloads.'} refreshing={refreshing} onRefresh={refresh}>
    {loading ? <StateView loading title="Carregando integrações…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar" message={error} onAction={reload} /> : <>
      <View style={styles.stats}>
        <Stat label="Clínicas monitoradas" value={all.length} onPress={() => setOnlyAlerts('todas')} />
        <Stat label="Alertas de integração" value={unhealthy} tone={unhealthy ? 'danger' : 'neutral'} onPress={() => setOnlyAlerts('alertas')} />
      </View>
      <Text style={styles.note}>Dados consolidados em {last(data?.generated_at)}. O status reflete o último registro disponível no EloLab, não uma verificação ao vivo; esta tela não testa as credenciais nos provedores. “Sem uso” indica falta de evidência operacional e não conta como falha.</Text>
      <Section title="Status por clínica">
        <Field label="Buscar clínica" value={search} onChangeText={setSearch} placeholder="Buscar clínica" />
        <Segmented options={[{ value: 'todas', label: 'Todas' }, { value: 'alertas', label: 'Somente com alerta' }]} value={onlyAlerts} onChange={setOnlyAlerts} />
        <Text style={styles.note}>{clinics.length} de {all.length} clínicas</Text>
        {!clinics.length ? <StateView icon="git-network-outline" title={term ? 'Nenhuma clínica corresponde à busca.' : onlyAlerts === 'alertas' ? 'Nenhuma clínica com alerta de integração.' : 'Nenhuma clínica cadastrada para monitorar.'} /> : clinics.map(c =>
          <Card key={c.clinica_id} style={[styles.card, alertsOf(c) > 0 && { borderColor: colors.danger }]}>
            <View style={styles.head}><Text style={styles.name} numberOfLines={2}>{c.clinica_nome}</Text><Badge label={c.ativo ? 'ativa' : 'inativa'} tone={c.ativo ? 'success' : 'neutral'} /></View>
            {services.map(([label, key]) => {
              const s = c[key]; const [text, tone] = badgeFor(s);
              return <View key={key} style={styles.service} accessible accessibilityLabel={`${label}: ${text}`}>
                <View style={styles.fill}><Text style={styles.label}>{label}</Text><Text style={styles.meta}>{s.status ? `Último estado: ${statusLabel(s.status)}` : `${s.total || 0} cadastrada(s)`} · {last(s.last_activity)}</Text></View>
                <Badge label={text} tone={tone} />
              </View>;
            })}
            <Button variant="secondary" label="Ver cliente" onPress={() => router.push('/modules/admin-crm' as Href)} />
          </Card>)}
      </Section>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({ stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }, note: { color: colors.muted, fontSize: 11, lineHeight: 16, marginVertical: 8 }, card: { marginBottom: 10, gap: 4 }, head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }, name: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '700' }, service: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, fill: { flex: 1 }, label: { color: colors.ink, fontSize: 12, fontWeight: '700' }, meta: { color: colors.muted, fontSize: 10, marginTop: 2 } });
