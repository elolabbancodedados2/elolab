import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Field, ListRow, Section, Segmented, StateView, Stat } from '../../components/ui';
import { dateLabel } from '../../lib/format';
import { must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Admin = { user_id: string; email: string; nome: string; level: string; active: boolean; last_sign_in_at?: string | null; mfa_enabled: boolean };
type Action = { id: string; user_id: string | null; user_name: string | null; user_email: string | null; action: string; collection: string; record_id: string | null; record_name?: string | null; timestamp: string };
type Data = { generated_at: string; metrics: Record<string, number>; admins: Admin[]; recent_sensitive_actions: Action[] };
type AdminFilter = 'todos' | 'sem_mfa' | 'inativos';

const metricLabels: [string, string, string | null][] = [
  ['Usuários', 'users', 'admin-usuarios'], ['Usuários com MFA', 'mfa_enabled', null], ['E-mail pendente', 'unconfirmed_email', 'admin-usuarios'],
  ['Nunca / sem acesso há 90 dias', 'inactive_90d', 'admin-usuarios'], ['Sessões registradas', 'open_sessions', null], ['Administradores ativos', 'platform_admins', null], ['Acesso assistido ativo', 'assisted_access', 'admin-acesso-assistido'],
];
const actionLabels: Record<string, string> = { create: 'Criou', update: 'Atualizou', delete: 'Removeu', access: 'Acessou', sign: 'Assinou', edit_request: 'Solicitou edição' };
const collectionLabels: Record<string, string> = { platform_restore_requests: 'Solicitações de restauração', support_access: 'Acesso assistido', platform_incidents: 'Incidentes', notification_queue: 'Fila de notificações', mercadopago_webhook_logs: 'Webhooks do Mercado Pago', platform_tenant_limits: 'Limites de consumo', platform_ai_config: 'Configuração de IA', platform_announcements: 'Comunicados globais', platform_operational_state: 'Controles operacionais', platform_feature_flags: 'Feature flags', lgpd_access_request_log: 'Solicitações LGPD' };

export default function AdminSecurityScreen() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<AdminFilter>('todos');
  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => must<Data>(await client.rpc('platform_security_overview')), []);

  const metrics = data?.metrics ?? {};
  const admins = data?.admins ?? [];
  const actions = data?.recent_sensitive_actions ?? [];
  const term = search.trim().toLocaleLowerCase('pt-BR');
  const visibleActions = !term ? actions : actions.filter(a => [actionLabels[a.action] || a.action, collectionLabels[a.collection] || a.collection, a.user_name, a.user_email, a.user_id, a.record_name, a.record_id].some(v => v?.toLocaleLowerCase('pt-BR').includes(term)));
  const visibleAdmins = admins.filter(a => filter === 'sem_mfa' ? !a.mfa_enabled : filter === 'inativos' ? !a.active : true);
  const noMfa = admins.filter(a => !a.mfa_enabled).length;

  return <ModuleScreen moduleKey="admin-seguranca" title="Central de Segurança" subtitle={data ? `${metrics.users ?? 0} usuários · ${metrics.mfa_enabled ?? 0} com MFA · ${admins.length} administradores${noMfa ? ` (${noMfa} sem MFA)` : ''}` : 'Contas privilegiadas, MFA e ações sensíveis.'} refreshing={refreshing} onRefresh={refresh}>
    {loading ? <StateView loading title="Carregando segurança…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar" message={error} onAction={reload} /> : <>
      <View style={styles.stats}>{metricLabels.map(([label, key, target]) => <Stat key={key} label={label} value={metrics[key] ?? 0} onPress={target ? () => router.push(`/modules/${target}` as Href) : undefined} />)}</View>
      <Section title="Administradores da plataforma">
        <Text style={styles.note}>Contas privilegiadas devem usar MFA e ser revisadas periodicamente.</Text>
        <Segmented options={[{ value: 'todos', label: 'Todos' }, { value: 'sem_mfa', label: 'Sem MFA' }, { value: 'inativos', label: 'Inativos' }]} value={filter} onChange={setFilter} />
        {!admins.length ? <StateView icon="people-outline" title="Nenhum administrador cadastrado." /> : !visibleAdmins.length ? <StateView icon="funnel-outline" title="Nenhum administrador neste filtro." actionLabel="Limpar filtros" onAction={() => setFilter('todos')} /> : visibleAdmins.map(a =>
          <ListRow key={a.user_id} title={a.nome || a.email} subtitle={`${a.email} · ${a.level}`} meta={`Último acesso: ${a.last_sign_in_at ? dateLabel(a.last_sign_in_at) : 'nunca'}`}
            right={<View style={styles.badges}><Badge label={a.active ? 'ativo' : 'inativo'} tone={a.active ? 'success' : 'danger'} /><Badge label={a.mfa_enabled ? 'MFA ativo' : 'sem MFA'} tone={a.mfa_enabled ? 'success' : 'danger'} /></View>} />)}
      </Section>
      <Section title="Ações sensíveis recentes">
        <Text style={styles.note}>{visibleActions.length} de {actions.length} eventos exibidos. A busca cobre os até 100 eventos mais recentes em módulos administrativos e de acesso assistido.</Text>
        <Field label="Buscar" value={search} onChangeText={setSearch} placeholder="Buscar ação, módulo, pessoa ou registro" />
        {!visibleActions.length ? <StateView icon="shield-checkmark-outline" title={actions.length ? 'Nenhum evento corresponde à busca dentro dos 100 mais recentes.' : 'Nenhuma ação sensível registrada.'} actionLabel="Limpar busca" onAction={actions.length && term ? () => setSearch('') : undefined} /> : visibleActions.map(a =>
          <ListRow key={a.id} title={`${actionLabels[a.action] || a.action} · ${collectionLabels[a.collection] || a.collection}${a.record_name || a.record_id ? ` · ${a.record_name || a.record_id}` : ''}`}
            subtitle={`${a.user_name || a.user_email || a.user_id || 'Sistema'}${a.user_email && a.user_name ? ` · ${a.user_email}` : ''}`} meta={dateLabel(a.timestamp)} />)}
      </Section>
      {data?.generated_at ? <Text style={styles.foot}>Dados atualizados em {dateLabel(data.generated_at)}</Text> : null}
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({ stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }, note: { color: colors.muted, fontSize: 11, lineHeight: 16, marginBottom: 10 }, badges: { gap: 4, alignItems: 'flex-end' }, foot: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 16 } });
