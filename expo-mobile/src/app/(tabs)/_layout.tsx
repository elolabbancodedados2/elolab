import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { colors } from '../../theme/tokens';

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home-outline', agenda: 'calendar-outline', patients: 'people-outline', care: 'pulse-outline', more: 'grid-outline',
};

export default function TabLayout() {
  const { session, loading } = useAuth();
  if (loading) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View>;
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginBottom: 4 },
      tabBarStyle: { height: 64, paddingTop: 7, borderTopColor: colors.border, backgroundColor: colors.surface },
      tabBarIcon: ({ color, size }) => <Ionicons name={icons[route.name] ?? 'ellipse-outline'} size={size} color={typeof color === 'string' ? color : colors.muted} />,
    })}>
      <Tabs.Screen name="index" options={{ title: 'Início' }} />
      <Tabs.Screen name="agenda" options={{ title: 'Agenda' }} />
      <Tabs.Screen name="patients" options={{ title: 'Pacientes' }} />
      <Tabs.Screen name="care" options={{ title: 'Atendimento' }} />
      <Tabs.Screen name="more" options={{ title: 'Mais' }} />
    </Tabs>
  );
}
