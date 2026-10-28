import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Card, ListRow, Section, Stat, StateView } from '../../components/ui';
import { dateLabel, money } from '../../lib/format';
import { must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Report = {
  generated_at: string;
  portfolio: { ativas: number; trials: number; em_risco: number; mrr: number };
  growth: { novas_clinicas: number };
  support: { abertos: number; sla_vencido: number };
  top_clients: { clinica_id: string; clinica_nome: string; plano_nome: string | null; total_pacientes: number; dias_sem_uso: number | null }[];
};

const shortcuts = [
  { key: 'admin-crm', label: 'Clientes e clínicas', icon: 'business-outline' },
  { key: 'admin-usuarios', label: 'Contas e acessos', icon: 'people-outline' },
  { key: 'admin-cobrancas', label: 'Cobranças', icon: 'card-outline' },
  { key: 'admin-suporte', label: 'Atendimento', icon: 'headset-outline' },
  { key: 'admin-comunicacao', label: 'Comunicados', icon: 'chatbox-ellipses-outline' },
  { key: 'admin-executivo', label: 'Desempenho do negócio', icon: 'pulse-outline' },
] as const;

const go = (key: string) => router.push(`/modules/${key}` as never);

export default function AdminOverviewScreen() {
  const { profile } = useAuth();
  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    const [report, db] = await Promise.all([
      client.rpc('platform_executive_report', { p_days: 30 }),
      client.rpc('public_availability_check'),
    ]);
    return { report: must<Report>(report), dbOk: !db.error };
  }, []);
  const r = data?.report;
  const subtitle = r ? `${r.portfolio.ativas} clientes ativos · ${r.portfolio.em_risco} precisam de atenção · ${r.support.abertos} solicitações de suporte em aberto` : 'Aqui está o que precisa da sua atenção na plataforma.';

  return <ModuleScreen moduleKey="admin-visao" subtitle={subtitle} refreshing={refreshing} onRefresh={refresh}>
    {!profile?.clinicaId ? <Card style={styles.warn}><Text style={styles.warnTitle}>Acesso ao app clínico pendente</Text><Text style={styles.muted}>O perfil da conta proprietária ainda não está vinculado à clínica interna do EloLab.</Text></Card> : null}
    {loading ? <StateView loading title="Carregando indicadores…" /> : error || !r ? <StateView icon="alert-circle-outline" title="Não foi possível carregar" message={error ?? undefined} onAction={reload} /> : <>
      <View style={styles.grid}>
        <Stat label="Receita mensal recorrente" value={money(r.portfolio.mrr)} onPress={() => go('admin-cobrancas')} />
        <Stat label={`Clientes ativos · ${r.portfolio.trials} em avaliação`} value={r.portfolio.ativas} onPress={() => go('admin-crm')} />
        <Stat label="Novos clientes (30 dias)" value={r.growth.novas_clinicas} onPress={() => go('admin-onboarding')} />
        <Stat label="Clientes que precisam de atenção" value={r.portfolio.em_risco} tone={r.portfolio.em_risco ? 'warning' : 'primary'} onPress={() => go('admin-crm')} />
      </View>
      <Section title="Atendimento ao cliente">
        <View style={styles.grid}>
          <Stat label="Solicitações em aberto" value={r.support.abertos} onPress={() => go('admin-suporte')} />
          <Stat label="Fora do prazo de resposta" value={r.support.sla_vencido} tone={r.support.sla_vencido ? 'danger' : 'success'} onPress={() => go('admin-suporte')} />
        </View>
      </Section>
      <Section title="Clientes em destaque">
        {r.top_clients.length ? r.top_clients.slice(0, 5).map(c => {
          const idle = c.dias_sem_uso === null || c.dias_sem_uso >= 14;
          return <ListRow key={c.clinica_id} title={c.clinica_nome} subtitle={`${c.plano_nome || 'Sem plano'} · ${c.total_pacientes} pacientes`} meta={c.dias_sem_uso === null ? 'Sem atividade' : idle ? `${c.dias_sem_uso} dias sem uso` : `Ativa há ${c.dias_sem_uso} dias`} right={<Badge label={idle ? 'Acompanhar' : 'Ativa'} tone={idle ? 'warning' : 'success'} />} onPress={() => go('admin-crm')} />;
        }) : <Text style={styles.muted}>Ainda não há atividade suficiente para mostrar clientes.</Text>}
      </Section>
      <Section title="Versão e disponibilidade">
        <ListRow title="API e banco de dados" right={<Badge label={data.dbOk ? 'Disponível' : 'Indisponível'} tone={data.dbOk ? 'success' : 'danger'} />} onPress={() => go('admin-saude')} />
      </Section>
    </>}
    <Section title="O que você quer resolver?">
      {shortcuts.map(s => <ListRow key={s.key} title={s.label} icon={s.icon} onPress={() => go(s.key)} />)}
    </Section>
    {r?.generated_at ? <Text style={styles.note}>Dados atualizados {dateLabel(r.generated_at)}</Text> : null}
  </ModuleScreen>;
}

const styles = StyleSheet.create({ grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, warn: { borderColor: colors.warning, backgroundColor: colors.warningSoft, marginBottom: 12 }, warnTitle: { color: colors.ink, fontSize: 13, fontWeight: '700', marginBottom: 4 }, muted: { color: colors.muted, fontSize: 12, lineHeight: 18 }, note: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 16 } });
