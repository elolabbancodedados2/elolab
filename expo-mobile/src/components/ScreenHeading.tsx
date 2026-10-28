import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/tokens';

export function ScreenHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <View style={styles.wrap}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View>;
}

const styles = StyleSheet.create({ wrap: { marginBottom: 22 }, title: { color: colors.ink, fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.5 }, subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 } });
