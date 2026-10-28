import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Button, Card } from '../../components/ui';
import { colors } from '../../theme/tokens';

// The web "Notificações" tab (src/pages/Configuracoes.tsx) holds no settings: it points to Automações,
// where the reminders and automatic messages actually in use are configured.
export default function NotificationSettingsScreen() {
  return <ModuleScreen moduleKey="notificacoes-config" subtitle="Gerencie lembretes e mensagens automáticas da clínica">
    <Card style={styles.card}>
      <Text style={styles.title}>As regras de envio ficam em Automações</Text>
      <Text style={styles.text}>Configure e acompanhe os lembretes e mensagens que estão realmente ativos no módulo Automações.</Text>
      <Button label="Abrir Automações" icon="sparkles-outline" onPress={() => router.push('/modules/automacoes')} />
    </Card>
  </ModuleScreen>;
}

const styles = StyleSheet.create({ card: { gap: 10, marginTop: 8 }, title: { color: colors.ink, fontSize: 14, fontWeight: '700' }, text: { color: colors.muted, fontSize: 12, lineHeight: 18 } });
