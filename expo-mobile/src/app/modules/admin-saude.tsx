import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Card, Chips, Field, Section, Stat, StateView, type Tone } from '../../components/ui';
import { dateLabel, friendlyError, money } from '../../lib/format';
import { must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Row = { clinica_id: string; clinica_nome: string; assinatura_status: string; em_trial: boolean; suspensa: boolean; arquivada: boolean; ultima_atividade_ha_dias: number | null; agendamentos_em_atendimento: number; coletas_esquecidas: number; exames_solicitados_ha_7d: number; contas_a_receber_vencidas: number; contas_a_receber_valor: number; total_pacientes: number; total_agendamentos_no_mes: number; audits_no_mes: number };
type Totals = { total_clinicas: number; clinicas_ativas: number; clinicas_em_trial: number; total_pacientes: number; agendamentos_no_mes: number; audits_ultimos_7d: number } | null;
type Health = { checked_at: string; checks: { id: string; nome: string; status: 'ok' | 'warning' | 'error'; detalhe: string; latencia_ms?: number }[] };
type Filter = 'todas' | 'alertas' | 'sem_uso' | 'trial';

// Same rough severity sum the web uses for "Com alertas" and "Mais alertas".
const score = (c: Row) => c.agendamentos_em_atendimento + c.coletas_esquecidas + c.exames_solicitados_ha_7d + c.contas_a_receber_vencidas + (c.ultima_atividade_ha_dias == null || c.ultima_atividade_ha_dias > 7 ? 10 : 0);
const tests: Record<Filter, (c: Row) => boolean> = { todas: () => true, alertas: c => score(c) >= 5, sem_uso: c => c.ultima_atividade_ha_dias == null || c.ultima_atividade_ha_dias > 7, trial: c => c.em_trial };
const filterLabels: Record<Filter, string> = { todas: 'Todas', alertas: 'Com alertas', sem_uso: 'Sem uso há 7+ dias', trial: 'Em trial' };
const tone = (n: number, warn: number, crit: number): Tone => n >= crit ? 'danger' : n >= warn ? 'warning' : n > 0 ? 'neutral' : 'success';
const days = (d: number | null) => d == null ? 'nunca usou' : d === 0 ? 'hoje' : d === 1 ? '1 dia' : `${d} dias`;
const checkTone = { ok: 'success', warning: 'warning', error: 'danger' } as const;

export default function AdminHealthScreen() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('todas');
  const [order, setOrder] = useState<'atividade' | 'alertas' | 'nome'>('atividade');
  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    const [totals, rows, health] = await Promise.all([
      client.from('platform_saude_agregada').select('*').maybeSingle(),
      client.rpc('platform_get_clinicas_saude'),
      client.functions.invoke('integration-health').then((r: { data: Health; error: unknown }) => r, (e: unknown) => ({ data: null, error: e })),
    ]);
    return { totals: must<Totals>(totals), rows: (must<Row[]>(rows) ?? []), health: health.error ? null : health.data as Health, healthError: health.error ? friendlyError(health.error, 'Não foi possível executar o diagnóstico das integrações.') : null };
  }, []);

  const all = data?.rows ?? [];
  const q = search.trim().toLowerCase();
  let list = all.filter(tests[filter]).filter(c => !q || c.clinica_nome.toLowerCase().includes(q));
  if (order === 'nome') list = [...list].sort((a, b) => a.clinica_nome.localeCompare(b.clinica_nome));
  if (order === 'alertas') list = [...list].sort((a, b) => score(b) - score(a));
  const count = (f: Filter) => all.filter(tests[f]).length;
  const t = data?.totals;

  return <ModuleScreen moduleKey="admin-saude" subtitle={data ? `${all.length} clínicas · ${count('alertas')} com alertas · ${count('sem_uso')} sem uso há mais de 7 dias` : 'Como o SaaS está agora, e como cada clínica está usando'} refreshing={refreshing} onRefresh={refresh}>
    {loading ? <StateView loading title="Carregando indicadores…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar" message={error} onAction={reload} /> : <>
      <Section title="Integrações e serviços">
        {data?.healthError ? <Text style={styles.muted}>{data.healthError}</Text> : data?.health?.checks?.length ? data.health.checks.map(c => <Card key={c.id} style={styles.check}>
          <View style={styles.between}><Text style={styles.title}>{c.nome}</Text><Badge label={c.status} tone={checkTone[c.status]} /></View>
          <Text style={styles.muted}>{c.detalhe}{c.latencia_ms != null ? ` · ${c.latencia_ms} ms` : ''}</Text>
        </Card>) : <Text style={styles.muted}>A verificação não retornou serviços para exibir.</Text>}
        {data?.health?.checked_at ? <Text style={styles.note}>Última verificação: {dateLabel(data.health.checked_at)}</Text> : null}
      </Section>
      {t ? <View style={[styles.grid, styles.top]}>
        <Stat label={`Assinaturas ativas · ${t.total_clinicas} total · ${t.clinicas_em_trial} em trial`} value={t.clinicas_ativas} />
        <Stat label="Pacientes em todo o SaaS" value={t.total_pacientes} />
        <Stat label="Agendamentos no mês" value={t.agendamentos_no_mes} />
        <Stat label="Auditoria 7d" value={t.audits_ultimos_7d} />
      </View> : null}
      <Section title="Clínicas" action={<Text style={styles.muted}>{list.length} de {all.length}</Text>}>
        <Field label="Buscar clínica" value={search} onChangeText={setSearch} placeholder="Buscar clínica..." />
        <Chips label="Filtro" options={(Object.keys(tests) as Filter[]).map(value => ({ value, label: `${filterLabels[value]} (${count(value)})` }))} value={filter} onChange={setFilter} />
        <Chips label="Ordenar" options={[{ value: 'atividade', label: 'Última atividade' }, { value: 'alertas', label: 'Mais alertas' }, { value: 'nome', label: 'Nome' }]} value={order} onChange={setOrder} />
        {!list.length ? <StateView icon="business-outline" title="Nenhuma clínica" message={q || filter !== 'todas' ? 'Ninguém correspondeu ao filtro.' : 'Ainda não há clínicas cadastradas na plataforma.'} /> : list.map(c => <Card key={c.clinica_id} style={[styles.clinic, c.arquivada && styles.archived, score(c) >= 5 && styles.alert]}>
          <View style={styles.badges}>
            <Text style={[styles.title, styles.fill]}>{c.clinica_nome}</Text>
            {c.em_trial ? <Badge label="Trial" tone="info" /> : null}
            {c.assinatura_status === 'ativa' ? <Badge label="Ativa" tone="success" /> : null}
            {c.suspensa ? <Badge label="Suspensa" tone="danger" /> : null}
            {c.arquivada ? <Badge label="Arquivada" /> : null}
          </View>
          <Text style={styles.muted}>Última atividade: {days(c.ultima_atividade_ha_dias)} · {c.total_pacientes} pacientes · {c.total_agendamentos_no_mes} agend/mês · {c.audits_no_mes} audits/mês</Text>
          <View style={styles.badges}>
            <Badge label={`Atendimento aberto: ${c.agendamentos_em_atendimento}`} tone={tone(c.agendamentos_em_atendimento, 1, 5)} />
            <Badge label={`Coletas esquecidas: ${c.coletas_esquecidas}`} tone={tone(c.coletas_esquecidas, 5, 30)} />
            <Badge label={`Exames sem coleta há 7d: ${c.exames_solicitados_ha_7d}`} tone={tone(c.exames_solicitados_ha_7d, 5, 30)} />
            <Badge label={`Contas vencidas: ${c.contas_a_receber_vencidas} · ${money(c.contas_a_receber_valor)}`} tone={tone(c.contas_a_receber_vencidas, 3, 20)} />
          </View>
        </Card>)}
      </Section>
      <Section title="Atalhos"><View style={styles.badges}><Text accessibilityRole="link" onPress={() => router.push('/modules/admin-incidentes' as never)} style={styles.link}>Incidentes</Text><Text accessibilityRole="link" onPress={() => router.push('/modules/admin-clinicas' as never)} style={styles.link}>Ver lista de clínicas</Text></View></Section>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, top: { marginTop: 16 }, between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 },
  check: { marginBottom: 8, padding: 12 }, clinic: { marginBottom: 8, padding: 12, gap: 8 }, archived: { opacity: 0.5 }, alert: { borderColor: colors.danger },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }, fill: { flexGrow: 1, flexBasis: '60%' },
  title: { color: colors.ink, fontSize: 13, fontWeight: '700' }, muted: { color: colors.muted, fontSize: 11, lineHeight: 16 }, note: { color: colors.muted, fontSize: 10, marginTop: 4 },
  link: { color: colors.primary, fontSize: 13, fontWeight: '700', minHeight: 44, paddingVertical: 12, paddingHorizontal: 4 },
});
