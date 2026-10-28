import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Card, Chips, Field, ListRow, Section, Segmented, Stat, StateView } from '../../components/ui';
import { dateLabel, money } from '../../lib/format';
import { must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Event = { id: number; clinica_nome: string | null; event_type: string; old_plan_slug: string | null; new_plan_slug: string | null; old_status: string | null; new_status: string | null; mrr_delta: number; occurred_at: string; source: string };
type History = { tracking_since: string | null; metrics: { expansion: number; contraction: number; churned: number; reactivated: number }; events: Event[] };

const eventLabels: Record<string, string> = { baseline: 'Marco inicial', created: 'Nova assinatura', upgrade: 'Upgrade', downgrade: 'Downgrade', canceled: 'Cancelamento', reactivated: 'Reativação', status_changed: 'Mudança de status' };
const sourceLabels: Record<string, string> = { migration: 'Marco importado', database: 'Evento do banco' };

export default function AdminFinancialHistoryScreen() {
  const [days, setDays] = useState<'30' | '90' | '180' | '365'>('90');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => must<History>(await client.rpc('platform_financial_history', { p_days: Number(days) })), [days]);

  const m = data?.metrics;
  const events = data?.events ?? [];
  const term = search.trim().toLocaleLowerCase('pt-BR');
  const visible = events.filter(e => (type === 'all' || e.event_type === type) && (!term || [e.clinica_nome, eventLabels[e.event_type], e.event_type, e.old_plan_slug, e.new_plan_slug, e.old_status, e.new_status, sourceLabels[e.source], e.source].some(v => v?.toLocaleLowerCase('pt-BR').includes(term))));
  const filtered = Boolean(term || type !== 'all');

  return <ModuleScreen moduleKey="admin-historico-financeiro" subtitle={data ? `${events.length} eventos nos últimos ${days} dias · ${m?.churned || 0} cancelamentos · ${m?.reactivated || 0} reativações. Valores calculados a partir dos eventos de assinatura; não representam valores recebidos.` : 'Variações de MRR e churn calculados a partir dos eventos de assinatura; não representam valores recebidos.'} refreshing={refreshing} onRefresh={refresh}>
    <Segmented options={(['30', '90', '180', '365'] as const).map(value => ({ value, label: `${value} dias` }))} value={days} onChange={setDays} />
    {loading ? <StateView loading title="Carregando histórico…" /> : error || !data ? <StateView icon="alert-circle-outline" title="Não foi possível carregar" message={error ?? undefined} onAction={reload} /> : <>
      <View style={styles.stats}>
        <Stat label="Expansão de MRR · variações positivas no período" value={money(m?.expansion)} tone="success" />
        <Stat label="Contração de MRR · variações negativas no período" value={money(m?.contraction)} tone="warning" />
        <Stat label="Cancelamentos · ver cancelamentos" value={m?.churned || 0} tone="danger" onPress={() => setType(type === 'canceled' ? 'all' : 'canceled')} />
        <Stat label="Reativações · ver reativações" value={m?.reactivated || 0} tone="success" onPress={() => setType(type === 'reactivated' ? 'all' : 'reactivated')} />
      </View>
      <Card style={styles.tracking}><Text style={styles.title}>Período de rastreamento</Text><Text style={styles.copy}>Eventos anteriores ao marco inicial não são reconstruídos artificialmente. {data.tracking_since ? `Rastreamento desde ${dateLabel(data.tracking_since)}.` : 'Ainda não há eventos para definir um marco inicial.'}</Text></Card>
      <Section title="Linha do tempo">
        <Text style={styles.copy}>{visible.length} de {events.length} eventos carregados; até 500 eventos de assinatura no período escolhido.</Text>
        <Field label="Buscar" value={search} onChangeText={setSearch} placeholder="Clínica, plano, status ou origem" />
        <Chips options={[{ value: 'all', label: 'Todos os eventos' }, ...Object.entries(eventLabels).map(([value, label]) => ({ value, label }))]} value={type} onChange={setType} />
        {!visible.length ? <StateView icon="time-outline" title={events.length ? 'Nenhum evento corresponde à busca e ao tipo selecionado.' : 'Nenhum evento no período.'} actionLabel={filtered ? 'Limpar filtros' : undefined} onAction={filtered ? () => { setSearch(''); setType('all'); } : undefined} /> :
          visible.map(e => {
            const delta = Number(e.mrr_delta || 0);
            return <ListRow key={e.id} title={e.clinica_nome || 'Clínica não vinculada'} subtitle={`${eventLabels[e.event_type] || e.event_type} · ${e.old_plan_slug || e.old_status || '—'} → ${e.new_plan_slug || e.new_status || '—'} · ${dateLabel(e.occurred_at)}`}
              meta={sourceLabels[e.source] || e.source} right={<Badge label={`${delta > 0 ? '+' : ''}${money(delta)}`} tone={delta < 0 ? 'danger' : delta > 0 ? 'success' : 'neutral'} />} />;
          })}
        {events.length === 500 ? <Text style={styles.copy}>A lista atingiu o limite de 500 eventos; registros anteriores do período podem não aparecer.</Text> : null}
      </Section>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, tracking: { marginTop: 12, backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  title: { color: colors.ink, fontSize: 14, fontWeight: '700', marginBottom: 4 }, copy: { color: colors.muted, fontSize: 11, lineHeight: 16, marginBottom: 10 },
});
