import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppRole } from '../../auth/AuthContext';
import { useAuth } from '../../auth/useAuth';
import { MobileScreen } from '../../components/MobileScreen';
import { ScreenHeading } from '../../components/ScreenHeading';
import { colors, radius } from '../../theme/tokens';

type Item = { label: string; roles?: AppRole[]; platform?: boolean };
type Group = { title: string; icon: keyof typeof Ionicons.glyphMap; roles?: AppRole[]; platform?: boolean; items: Item[] };
const allClinicRoles: AppRole[] = ['admin', 'recepcao', 'enfermagem', 'medico', 'financeiro'];
const groups: Group[] = [
  { title: 'Início', icon: 'home-outline', items: [
    { label: 'Dashboard' }, { label: 'Tarefas', roles: allClinicRoles }, { label: 'Minha fila', roles: allClinicRoles },
  ] },
  { title: 'Atendimento', icon: 'calendar-outline', roles: allClinicRoles, items: [
    { label: 'Agenda', roles: ['admin', 'recepcao', 'enfermagem', 'medico'] }, { label: 'Recepção e caixa', roles: ['admin', 'recepcao', 'financeiro'] }, { label: 'Fila e triagem', roles: ['admin', 'recepcao', 'enfermagem', 'medico'] }, { label: 'Salas e lista de espera', roles: ['admin', 'recepcao'] }, { label: 'Retornos', roles: ['admin', 'medico', 'recepcao'] }, { label: 'Higienização de salas', roles: ['admin', 'recepcao', 'enfermagem'] }, { label: 'Patrimônio e manutenção', roles: ['admin', 'recepcao', 'enfermagem'] }, { label: 'Risco de faltas', roles: ['admin', 'recepcao'] },
  ] },
  { title: 'Pacientes', icon: 'people-outline', roles: allClinicRoles, items: [
    { label: 'Cadastro e histórico', roles: ['admin', 'recepcao', 'enfermagem', 'medico'] }, { label: 'Convênios', roles: ['admin', 'recepcao', 'financeiro'] }, { label: 'Acesso ao portal do paciente', roles: ['admin'] },
  ] },
  { title: 'Clínica', icon: 'medical-outline', roles: ['admin', 'medico', 'enfermagem'], items: [
    { label: 'Prontuários', roles: ['admin', 'medico'] }, { label: 'Prescrições e documentos', roles: ['admin', 'medico'] }, { label: 'Sinais vitais', roles: ['admin', 'medico', 'enfermagem'] }, { label: 'Exames', roles: ['admin', 'medico', 'enfermagem'] }, { label: 'Encaminhamentos', roles: ['admin', 'medico'] }, { label: 'Segurança assistencial', roles: ['admin', 'medico', 'enfermagem'] }, { label: 'Modelos clínicos', roles: ['admin', 'medico'] },
  ] },
  { title: 'Laboratório', icon: 'flask-outline', roles: ['admin', 'medico', 'enfermagem', 'recepcao'], items: [
    { label: 'Painel do laboratório', roles: ['admin', 'medico', 'enfermagem'] }, { label: 'Mapa de coleta', roles: ['admin', 'enfermagem'] }, { label: 'Laudos', roles: ['admin', 'medico', 'enfermagem'] }, { label: 'Guias externas', roles: ['admin', 'recepcao', 'enfermagem'] },
  ] },
  { title: 'Financeiro', icon: 'wallet-outline', roles: ['admin', 'financeiro'], items: [
    { label: 'Visão financeira' }, { label: 'Caixa e fluxo de caixa' }, { label: 'Contas a receber e a pagar' }, { label: 'Cobrança de inadimplentes' }, { label: 'Repasses médicos' }, { label: 'TISS e glosas' }, { label: 'Preços e serviços' },
  ] },
  { title: 'Relatórios e indicadores', icon: 'bar-chart-outline', roles: allClinicRoles, items: [
    { label: 'Indicadores de produtividade', roles: allClinicRoles }, { label: 'Relatórios', roles: ['admin', 'financeiro'] }, { label: 'Indicadores da clínica', roles: ['admin'] }, { label: 'Relatórios salvos', roles: ['admin', 'financeiro'] },
  ] },
  { title: 'Equipe', icon: 'people-circle-outline', roles: ['admin'], items: [{ label: 'Médicos e funcionários', roles: ['admin'] }, { label: 'Convites e acessos', roles: ['admin'] }] },
  { title: 'Estoque e suprimentos', icon: 'cube-outline', roles: ['admin', 'enfermagem'], items: [{ label: 'Estoque', roles: ['admin', 'enfermagem'] }, { label: 'Itens com baixo estoque', roles: ['admin', 'enfermagem'] }] },
  { title: 'Comunicação', icon: 'chatbubbles-outline', items: [{ label: 'Chat interno' }, { label: 'Mensagens e lembretes a pacientes', roles: ['admin'] }] },
  { title: 'Automação e IA', icon: 'sparkles-outline', roles: ['admin'], items: [{ label: 'Automações da clínica', roles: ['admin'] }, { label: 'Atendente de IA', roles: ['admin'] }] },
  { title: 'Configurações', icon: 'settings-outline', roles: ['admin', 'medico'], items: [
    { label: 'Dados da clínica', roles: ['admin'] }, { label: 'Horários e agenda online', roles: ['admin'] }, { label: 'Serviços e preços', roles: ['admin'] }, { label: 'Notificações', roles: ['admin'] }, { label: 'Integrações disponíveis', roles: ['admin'] }, { label: 'Interoperabilidade FHIR', roles: ['admin', 'medico'] }, { label: 'Plano e assinatura', roles: ['admin'] },
  ] },
  { title: 'Ajuda', icon: 'help-circle-outline', items: [
    { label: 'Treinamento e documentação' }, { label: 'Suporte', roles: allClinicRoles }, { label: 'Acesso assistido pelo suporte', roles: ['admin'] },
  ] },
  { title: 'Painel da plataforma', icon: 'speedometer-outline', roles: ['admin'], platform: true, items: [{ label: 'Visão geral', platform: true }, { label: 'Saúde do serviço', platform: true }, { label: 'Incidentes', platform: true }] },
  { title: 'Clientes', icon: 'business-outline', roles: ['admin'], platform: true, items: [{ label: 'Carteira de clientes', platform: true }, { label: 'Clínicas', platform: true }, { label: 'Contas e acessos', platform: true }, { label: 'Entrada de clientes', platform: true }, { label: 'Atendimento', platform: true }, { label: 'Acesso assistido', platform: true }] },
  { title: 'Receita', icon: 'card-outline', roles: ['admin'], platform: true, items: [{ label: 'Cobranças e assinaturas', platform: true }, { label: 'Resumo do negócio', platform: true }, { label: 'Histórico financeiro', platform: true }] },
  { title: 'Produto e comunicação', icon: 'megaphone-outline', roles: ['admin'], platform: true, items: [{ label: 'Comunicados aos clientes', platform: true }, { label: 'Opiniões dos clientes', platform: true }, { label: 'Documentação e ajuda', platform: true }, { label: 'Configuração da IA', platform: true }] },
  { title: 'Controles da plataforma', icon: 'shield-checkmark-outline', roles: ['admin'], platform: true, items: [{ label: 'Segurança e privacidade', platform: true }, { label: 'Solicitações de privacidade', platform: true }, { label: 'Integrações de clientes', platform: true }, { label: 'Operação do serviço', platform: true }, { label: 'Relatórios agendados', platform: true }] },
];

const implemented = new Set(['Dashboard', 'Agenda', 'Cadastro e histórico', 'Fila e triagem']);

function hasRole(roles: AppRole[], required?: AppRole[]) {
  return !required?.length || roles.includes('admin') || required.some(role => roles.includes(role));
}

export default function MoreScreen() {
  const { profile, signOut } = useAuth();
  const roles = profile?.roles ?? [];
  const visibleGroups = groups.map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (item.platform && !profile?.isPlatformAdmin) return false;
      if (!item.platform && profile?.isPlatformAdmin && !profile.clinicaId) return false;
      return hasRole(roles, item.roles);
    }),
  })).filter(group => group.items.length && hasRole(roles, group.roles) && (group.platform ? Boolean(profile?.isPlatformAdmin) : !(profile?.isPlatformAdmin && !profile.clinicaId)));

  function openItem(item: string) {
    if (item === 'Dashboard') return router.push('/(tabs)');
    if (item === 'Agenda') return router.push('/(tabs)/agenda');
    if (item === 'Cadastro e histórico') return router.push('/(tabs)/patients');
    if (item === 'Fila e triagem') return router.push('/(tabs)/care');
    Alert.alert(item, 'Esta área será migrada para a experiência mobile nativa nas próximas etapas.');
  }

  return <MobileScreen>
    <ScreenHeading title="Mais" subtitle="Acesse os recursos liberados para sua conta." />
    <View style={styles.account}><View style={styles.avatar}><Ionicons name="person" size={18} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.accountName}>{profile?.nome || 'Sua conta'}</Text><Text style={styles.accountCaption}>{profile?.isPlatformAdmin ? 'Administração da plataforma' : 'Perfil e preferências'}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted} /></View>
    {visibleGroups.map(group => <View key={group.title} style={styles.group}><View style={styles.groupHead}><View style={styles.groupIcon}><Ionicons name={group.icon} size={17} color={colors.primary} /></View><Text style={styles.groupTitle}>{group.title}</Text></View><View style={styles.list}>{group.items.map(item => <Pressable accessibilityRole="button" key={item.label} onPress={() => openItem(item.label)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}><Text style={styles.rowText}>{item.label}</Text>{implemented.has(item.label) ? <Ionicons name="chevron-forward" size={16} color={colors.muted} /> : <Text style={styles.soon}>Em migração</Text>}</Pressable>)}</View></View>)}
    <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signout}><Ionicons name="log-out-outline" size={19} color={colors.danger} /><Text style={styles.signoutText}>Sair da conta</Text></Pressable>
    <Text style={styles.version}>EloLab Mobile · versão 1.0</Text>
  </MobileScreen>;
}

const styles = StyleSheet.create({ account: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 24 }, avatar: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }, accountName: { color: colors.ink, fontSize: 13, fontWeight: '700' }, accountCaption: { color: colors.muted, fontSize: 11, marginTop: 3 }, group: { marginBottom: 20 }, groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }, groupIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, groupTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' }, list: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14 }, row: { minHeight: 47, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }, rowPressed: { opacity: 0.65 }, rowText: { color: colors.ink, fontSize: 12, flexShrink: 1, marginRight: 8 }, soon: { color: colors.muted, fontSize: 9 }, signout: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, backgroundColor: '#FFF1F1', marginTop: 2 }, signoutText: { color: colors.danger, fontSize: 13, fontWeight: '700' }, version: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 18 } });
