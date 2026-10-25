import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../auth/useAuth';
import { colors } from '../theme/tokens';

export default function IndexRoute() {
  const { session, loading } = useAuth();
  if (loading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>;
  }
  return <Redirect href={session ? '/(tabs)' : '/(auth)/login'} />;
}
