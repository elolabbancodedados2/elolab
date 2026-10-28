import type { PropsWithChildren, ReactNode } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useAuth } from '../auth/useAuth';
import { canOpen, findItem, WEB_BASE_URL } from '../navigation/catalog';
import { MobileScreen } from './MobileScreen';
import { ScreenHeading } from './ScreenHeading';
import { BackLink, Button, StateView } from './ui';

/**
 * Stacked module screen: back link, heading and the same role/plan guard as the
 * More menu, so deep links cannot open a module the account cannot see.
 * Backend RLS remains the real authorization.
 */
export function ModuleScreen({ moduleKey, title, subtitle, action, refreshing, onRefresh, children }: PropsWithChildren<{ moduleKey: string; title?: string; subtitle: string; action?: ReactNode; refreshing?: boolean; onRefresh?: () => void }>) {
  const { profile, profileLoading, hasFeature } = useAuth();
  const entry = findItem(moduleKey);
  const allowed = entry ? canOpen(profile, hasFeature, entry.item, entry.group) : false;
  return <MobileScreen refreshing={refreshing} onRefresh={allowed ? onRefresh : undefined}>
    <BackLink />
    <View style={styles.head}><View style={styles.fill}><ScreenHeading title={title ?? entry?.item.label ?? 'Módulo'} subtitle={subtitle} /></View>{allowed ? action : null}</View>
    {profileLoading ? <StateView loading title="Conferindo acesso…" /> : allowed ? children : <StateView icon="lock-closed-outline" title="Acesso não disponível" message="Este módulo não está liberado para o seu perfil ou plano." />}
  </MobileScreen>;
}

/** Documented hand-off to the web app for flows that need a desktop (files, wide tables, checkout). */
export function OpenOnWeb({ path, label = 'Abrir no navegador' }: { path: string; label?: string }) {
  return <Button variant="secondary" icon="open-outline" label={label} onPress={() => void Linking.openURL(`${WEB_BASE_URL}${path}`)} />;
}

const styles = StyleSheet.create({ head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, fill: { flex: 1 } });
