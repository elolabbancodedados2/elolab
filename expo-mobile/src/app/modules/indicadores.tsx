import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Card, Segmented, StateView } from '../../components/ui';
import { must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Period = '7' | '30' | '90';
type Metric = { metric_key: string; label: string; current_value: number; previous_value: number; unit: string; scope: string };
type IconName = keyof typeof Ionicons.glyphMap;

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const formatted = (m: Metric, v: number) => (m.unit === 'BRL' ? brl.format(v) : `${num.format(v)} ${m.unit}`);
// Same comparison as IndicadoresProdutividade on the web: null means no previous base.
const change = (m: Metric) => (m.previous_value === 0 ? (m.current_value === 0 ? 0 : null) : ((m.current_value - m.previous_value) / Math.abs(m.previous_value)) * 100);
const ICONS: Record<string, IconName> = { tasks_completed: 'checkbox-outline', appointments_completed: 'calendar-outline', collections_completed: 'flask-outline', payments_received: 'card-outline', payments_value: 'cash-outline', appointments_registered: 'calendar-outline' };

export default function ProductivityScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [period, setPeriod] = useState<Period>('30');

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    return (must<Metric[]>(await client.rpc('indicadores_produtividade', { p_days: Number(period) })) ?? []).map(m => ({ ...m, current_value: Number(m.current_value), previous_value: Number(m.previous_value) }));
  }, [clinicId, period]);

  return <ModuleScreen moduleKey="indicadores" title="Indicadores de produtividade" subtitle="Acompanhe volume e evolução do trabalho sem competição entre pessoas." refreshing={refreshing} onRefresh={refresh}>
    <Segmented options={[{ value: '7', label: '7 dias' }, { value: '30', label: '30 dias' }, { value: '90', label: '90 dias' }]} value={period} onChange={setPeriod} />
    <Card style={styles.privacy}><Ionicons name="lock-closed-outline" size={18} color={colors.primary} /><Text style={styles.privacyText}>Colaboradores veem apenas seus próprios resultados. Administradores veem totais da clínica, sem nomes, ranking ou dados de pacientes.</Text></Card>
    {!clinicId ? <StateView icon="lock-closed-outline" title="Clínica não identificada" message="Entre novamente ou peça ao administrador para conferir seu vínculo com a clínica." />
      : loading ? <StateView loading title="Carregando indicadores…" />
      : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar os indicadores" message={error} onAction={reload} />
      : !data?.length ? <StateView icon="pulse-outline" title="Nenhum indicador disponível" message="Seu papel ainda não possui atividade mensurável neste período." onAction={reload} actionLabel="Atualizar" />
      : data.map(m => {
        const v = change(m);
        const tone = v === null || v === 0 ? colors.muted : v > 0 ? colors.success : colors.danger;
        const trend = v === null ? 'Sem base anterior para comparar' : `${v > 0 ? '+' : ''}${num.format(v)}% no período`;
        return <Pressable key={m.metric_key} accessibilityRole="button" accessibilityLabel={`${m.label}: ${formatted(m, m.current_value)}. ${trend}`}
          onPress={() => Alert.alert(m.label, `Últimos ${period} dias: ${formatted(m, m.current_value)}.\n${period} dias anteriores: ${formatted(m, m.previous_value)}.\n${trend}.\nAbrangência: ${m.scope}.`)} style={({ pressed }) => [styles.metric, pressed && styles.pressed]}>
          <View style={styles.head}><View style={styles.icon}><Ionicons name={ICONS[m.metric_key] ?? 'pulse-outline'} size={18} color={colors.primary} /></View><Text style={styles.label}>{m.label}</Text><Badge label={m.scope} /></View>
          <Text style={styles.value}>{formatted(m, m.current_value)}</Text>
          <View style={styles.trend}><Ionicons name={v === null || v === 0 ? 'arrow-forward' : v > 0 ? 'arrow-up' : 'arrow-down'} size={14} color={tone} /><Text style={[styles.trendText, { color: tone }]}>{trend}</Text></View>
          <Text style={styles.prev}>Comparação com os {period} dias anteriores · Período anterior: {formatted(m, m.previous_value)}</Text>
        </Pressable>;
      })}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  privacy: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 14, backgroundColor: colors.surfaceMuted }, privacyText: { flex: 1, color: colors.ink, fontSize: 12, lineHeight: 18 },
  metric: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 10 }, pressed: { opacity: 0.72 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 }, icon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, label: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '700' },
  value: { color: colors.ink, fontSize: 28, fontWeight: '800', marginTop: 12 }, trend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }, trendText: { fontSize: 12, fontWeight: '600' },
  prev: { color: colors.muted, fontSize: 11, marginTop: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
