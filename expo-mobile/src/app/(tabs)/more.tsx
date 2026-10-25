import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { MobileScreen } from '../../components/MobileScreen';
import { ScreenHeading } from '../../components/ScreenHeading';
import { canOpen, catalog, type CatalogItem } from '../../navigation/catalog';
import { colors, radius } from '../../theme/tokens';

export default function MoreScreen() {
  const { profile, hasFeature, signOut } = useAuth();
  const visibleGroups = catalog
    .map(group => ({ ...group, items: group.items.filter(item => canOpen(profile, hasFeature, item, group)) }))
    .filter(group => group.items.length);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openItem = (item: CatalogItem) => router.push(item.route as any);

  return <MobileScreen>
    <ScreenHeading title="Mais" subtitle="Acesse os recursos liberados para sua conta." />
    <Pressable accessibilityRole="button" accessibilityLabel="Abrir perfil e preferências" onPress={() => router.push('/modules/perfil')} style={({ pressed }) => [styles.account, pressed && styles.rowPressed]}><View style={styles.avatar}><Ionicons name="person" size={18} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.accountName}>{profile?.nome || 'Sua conta'}</Text><Text style={styles.accountCaption}>{profile?.isPlatformAdmin ? 'Administração da plataforma' : 'Perfil e preferências'}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>
    {visibleGroups.map(group => <View key={group.title} style={styles.group}><View style={styles.groupHead}><View style={styles.groupIcon}><Ionicons name={group.icon} size={17} color={colors.primary} /></View><Text style={styles.groupTitle}>{group.title}</Text></View><View style={styles.list}>{group.items.map(item => <Pressable accessibilityRole="button" key={item.key} onPress={() => openItem(item)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}><Text style={styles.rowText}>{item.label}</Text><Ionicons name="chevron-forward" size={16} color={colors.muted} /></Pressable>)}</View></View>)}
    <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signout}><Ionicons name="log-out-outline" size={19} color={colors.danger} /><Text style={styles.signoutText}>Sair da conta</Text></Pressable>
    <Text style={styles.version}>EloLab Mobile · versão 1.0</Text>
  </MobileScreen>;
}

const styles = StyleSheet.create({ account: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 24 }, avatar: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }, accountName: { color: colors.ink, fontSize: 13, fontWeight: '700' }, accountCaption: { color: colors.muted, fontSize: 11, marginTop: 3 }, group: { marginBottom: 20 }, groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }, groupIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, groupTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' }, list: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14 }, row: { minHeight: 47, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }, rowPressed: { opacity: 0.65 }, rowText: { color: colors.ink, fontSize: 12, flexShrink: 1, marginRight: 8 }, soon: { color: colors.muted, fontSize: 9 }, signout: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, backgroundColor: '#FFF1F1', marginTop: 2 }, signoutText: { color: colors.danger, fontSize: 13, fontWeight: '700' }, version: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 18 } });
