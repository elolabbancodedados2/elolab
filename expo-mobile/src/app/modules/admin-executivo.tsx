import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, ListRow, Section, Segmented, Stat, StateView } from '../../components/ui';
import { dateLabel, money } from '../../lib/format';
import { must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Report = {
  generated_at: string;
  portfolio: { total_clinicas: number; ativas: number; trials: number; suspensas: number; em_risco: number; mrr: number; arr: number };
  growth: { novas_clinicas: number; novos_pacientes: number; agendamentos: number };
  support: { tickets: number; abertos: number; sla_vencido: number; horas_resolucao: number };
  ai: { chamadas: number; taxa_sucesso: number; tokens: number; custo: number };
  top_clients: { clinica_id: string; clinica_nome: string; plano_nome: string | null; plano_valor: number | null; total_pacientes: number; total_agendamentos: number; dias_sem_uso: number | null }[];
};

const go = (route: string) => () => router.push(route as Href);

function Block({ title, linkLabel, route, rows }: { title: string; linkLabel: string; route: string; rows: [string, string | number, boolean?][] }) {
  return <Section title={title} action={<Button variant="ghost" label={linkLabel} onPress={go(route)} />}>
    <Card>{rows.map(([label, value, alert]) => <View key={label} style={styles.line}><Text style={styles.lineLabel}>{label}</Text><Text style={[styles.lineValue, alert && { color: colors.danger }]}>{value}</Text></View>)}</Card>
  </Section>;
}

export default function AdminExecutiveScreen() {
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const { data: d, loading, error, reload, refresh, refreshing } = useLoad(async client => must<Report>(await client.rpc('platform_executive_report', { p_days: Number(days) })), [days]);

  return <ModuleScreen moduleKey="admin-executivo" subtitle={d ? `${d.portfolio.ativas} clínicas pagas ativas · MRR ${money(d.portfolio.mrr)} · ${d.portfolio.em_risco} em risco · últimos ${days} dias` : 'Receita recorrente, crescimento, suporte, adoção e IA.'} refreshing={refreshing} onRefresh={refresh}>
    <Segmented options={[{ value: '7', label: '7 dias' }, { value: '30', label: '30 dias' }, { value: '90', label: '90 dias' }]} value={days} onChange={setDays} />
    {loading ? <StateView loading title="Carregando relatório…" /> : error || !d ? <StateView icon="alert-circle-outline" title="Não foi possível carregar" message={error ?? undefined} onAction={reload} /> : <>
      <Section title="Receita recorrente atual">
        <Text style={styles.copy}>Fotografia estimada das assinaturas válidas; não representa faturamento reconhecido nem recebimentos.</Text>
        <View style={styles.stats}>
          <Stat label={`MRR · ARR ${money(d.portfolio.arr)}`} value={money(d.portfolio.mrr)} onPress={go('/modules/admin-cobrancas')} />
          <Stat label={`Clínicas pagas ativas · ${d.portfolio.trials} em trial válido`} value={d.portfolio.ativas} tone="success" onPress={go('/modules/admin-crm')} />
          <Stat label="Clientes em risco · 14+ dias sem uso" value={d.portfolio.em_risco} tone={d.portfolio.em_risco ? 'warning' : 'neutral'} onPress={go('/modules/admin-crm')} />
          <Stat label={`Suspensas · ${d.portfolio.total_clinicas} clínicas totais`} value={d.portfolio.suspensas} tone="neutral" onPress={go('/modules/admin-clinicas')} />
        </View>
      </Section>
      <Block title={`Crescimento · ${days} dias`} linkLabel="Ver onboarding" route="/modules/admin-onboarding" rows={[['Novas clínicas', d.growth.novas_clinicas], ['Novos pacientes', d.growth.novos_pacientes], ['Agendamentos', d.growth.agendamentos]]} />
      <Block title={`Suporte · ${days} dias`} linkLabel="Abrir suporte" route="/modules/admin-suporte" rows={[['Tickets recebidos', d.support.tickets], ['Em aberto', d.support.abertos], ['SLA vencido', d.support.sla_vencido, Boolean(d.support.sla_vencido)], ['Tempo médio de resolução', `${d.support.horas_resolucao || 0}h`]]} />
      <Block title={`IA · ${days} dias`} linkLabel="Governança da IA" route="/modules/admin-ia" rows={[['Chamadas', d.ai.chamadas], ['Taxa de sucesso', `${d.ai.taxa_sucesso || 0}%`], ['Tokens', (d.ai.tokens || 0).toLocaleString('pt-BR')], ['Custo estimado', money(d.ai.custo)]]} />
      <Section title="Clientes com maior uso acumulado" action={<Button variant="ghost" label="Ver clientes" onPress={go('/modules/admin-crm')} />}>
        <Text style={styles.copy}>Ranking operacional atual, não uma série histórica do período.</Text>
        {!d.top_clients.length ? <StateView icon="business-outline" title="Ainda não há uso acumulado" message="O ranking aparece quando as clínicas começarem a cadastrar pacientes e agendamentos." actionLabel="Acompanhar onboarding" onAction={go('/modules/admin-onboarding')} /> :
          d.top_clients.map((c, i) => <ListRow key={c.clinica_id} title={`${i + 1}. ${c.clinica_nome}`} subtitle={`${c.plano_nome || 'Sem plano'} · ${money(c.plano_valor)}/mês`} meta={`${c.total_pacientes} pacientes · ${c.total_agendamentos} agendamentos`}
            right={<Badge label={c.dias_sem_uso == null ? 'Sem uso' : `${c.dias_sem_uso}d sem uso`} tone={(c.dias_sem_uso || 0) >= 14 ? 'danger' : 'neutral'} />} />)}
      </Section>
      <Section title="Exportar e agendar">
        <Text style={styles.copy}>A exportação em CSV e o agendamento de envio são feitos no navegador.</Text>
        <View style={styles.actions}><OpenOnWeb path={`/admin/relatorio-executivo?dias=${days}`} label="Exportar CSV no navegador" /><Button variant="ghost" icon="calendar-outline" label="Relatórios agendados" onPress={go('/modules/admin-relatorios-agendados')} /></View>
      </Section>
      <Text style={styles.note}>Gerado em {dateLabel(d.generated_at)}</Text>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  copy: { color: colors.muted, fontSize: 11, lineHeight: 16, marginBottom: 10 }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, lineLabel: { color: colors.ink, fontSize: 13 }, lineValue: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, note: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 16 },
});
