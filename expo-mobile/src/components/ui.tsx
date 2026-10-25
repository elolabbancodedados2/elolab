import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, radius } from '../theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;
export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const toneColors: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.muted, bg: colors.surfaceMuted },
  primary: { fg: colors.primary, bg: colors.primarySoft },
  success: { fg: colors.success, bg: colors.successSoft },
  warning: { fg: colors.warning, bg: colors.warningSoft },
  danger: { fg: colors.danger, bg: colors.dangerSoft },
  info: { fg: colors.info, bg: colors.infoSoft },
};

/** Back link used at the top of every stacked screen. */
export function BackLink({ label = 'Voltar' }: { label?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/more'))} style={styles.back}><Ionicons name="arrow-back" size={18} color={colors.primary} /><Text style={styles.backText}>{label}</Text></Pressable>;
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Section({ title, action, children }: PropsWithChildren<{ title: string; action?: ReactNode }>) {
  return <View style={styles.section}><View style={styles.sectionHead}><Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>{action}</View>{children}</View>;
}

export function Button({ label, onPress, variant = 'primary', icon, disabled, loading }: { label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; icon?: IconName; disabled?: boolean; loading?: boolean }) {
  const fg = variant === 'primary' ? '#FFFFFF' : variant === 'danger' ? colors.danger : colors.primary;
  const off = disabled || loading;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: off, busy: loading }} disabled={off} onPress={onPress} style={({ pressed }) => [styles.button, styles[variant], pressed && styles.pressed, off && styles.disabled]}>
    {loading ? <ActivityIndicator color={fg} /> : <>{icon ? <Ionicons name={icon} size={17} color={fg} /> : null}<Text style={[styles.buttonText, { color: fg }]}>{label}</Text></>}
  </Pressable>;
}

export function Field({ label, error, hint, style, ...input }: TextInputProps & { label: string; error?: string; hint?: string }) {
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor={colors.placeholder} style={[styles.input, input.multiline && styles.multiline, error ? styles.inputError : null, style]} {...input} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
  </View>;
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const c = toneColors[tone];
  return <View style={[styles.badge, { backgroundColor: c.bg }]}><Text numberOfLines={1} style={[styles.badgeText, { color: c.fg }]}>{label}</Text></View>;
}

export function ListRow({ title, subtitle, meta, icon, tone = 'primary', onPress, right, accessibilityLabel }: { title: string; subtitle?: string | null; meta?: string | null; icon?: IconName; tone?: Tone; onPress?: () => void; right?: ReactNode; accessibilityLabel?: string }) {
  const c = toneColors[tone];
  const body = <>
    {icon ? <View style={[styles.rowIcon, { backgroundColor: c.bg }]}><Ionicons name={icon} size={18} color={c.fg} /></View> : null}
    <View style={styles.rowCopy}><Text numberOfLines={2} style={styles.rowTitle}>{title}</Text>{subtitle ? <Text numberOfLines={2} style={styles.rowSubtitle}>{subtitle}</Text> : null}{meta ? <Text numberOfLines={1} style={styles.rowMeta}>{meta}</Text> : null}</View>
    {right}{onPress ? <Ionicons name="chevron-forward" size={16} color={colors.muted} /> : null}
  </>;
  if (!onPress) return <View accessible accessibilityLabel={accessibilityLabel} style={styles.row}>{body}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>{body}</Pressable>;
}

export function StateView({ icon = 'information-circle-outline', title, message, actionLabel, onAction, loading }: { icon?: IconName; title: string; message?: string; actionLabel?: string; onAction?: () => void; loading?: boolean }) {
  return <View accessibilityLiveRegion="polite" style={styles.state}>
    {loading ? <ActivityIndicator color={colors.primary} /> : <View style={styles.stateIcon}><Ionicons name={icon} size={24} color={colors.primary} /></View>}
    <Text style={styles.stateTitle}>{title}</Text>
    {message ? <Text style={styles.stateText}>{message}</Text> : null}
    {onAction ? <Pressable accessibilityRole="button" onPress={onAction} style={styles.retry}><Text style={styles.retryText}>{actionLabel ?? 'Tentar novamente'}</Text></Pressable> : null}
  </View>;
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return <View accessibilityRole="tablist" style={styles.segmented}>{options.map(option => {
    const selected = option.value === value;
    return <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(option.value)} style={[styles.segment, selected && styles.segmentOn]}><Text numberOfLines={1} style={[styles.segmentText, selected && styles.segmentTextOn]}>{option.label}</Text></Pressable>;
  })}</View>;
}

/** Wrapping single-select chips for short option lists (filters, priority, category). */
export function Chips<T extends string>({ label, options, value, onChange }: { label?: string; options: { value: T; label: string }[]; value: T | null; onChange: (value: T) => void }) {
  return <View style={styles.field}>
    {label ? <Text style={styles.label}>{label}</Text> : null}
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.chips}>{options.map(option => {
      const selected = option.value === value;
      return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => onChange(option.value)} style={[styles.chip, selected && styles.chipOn]}><Text style={[styles.chipText, selected && styles.chipTextOn]}>{option.label}</Text></Pressable>;
    })}</View>
  </View>;
}

/** Highlighted figure; pass onPress so the number leads somewhere. */
export function Stat({ label, value, tone = 'primary', onPress }: { label: string; value: string | number; tone?: Tone; onPress?: () => void }) {
  const c = toneColors[tone];
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${label}: ${value}`} disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.stat, pressed && styles.pressed]}>
    <Text style={[styles.statValue, { color: c.fg }]}>{value}</Text><Text style={styles.statLabel}>{label}</Text>
  </Pressable>;
}

export function Feedback({ message, error }: { message: string; error?: boolean }) {
  return <View accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite" style={[styles.feedback, { backgroundColor: error ? colors.dangerSoft : colors.successSoft }]}><Ionicons name={error ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={17} color={error ? colors.danger : colors.success} /><Text style={[styles.feedbackText, { color: error ? colors.danger : colors.success }]}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, alignSelf: 'flex-start', marginBottom: 4 }, backText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16 },
  section: { marginTop: 22 }, sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  button: { minHeight: 48, borderRadius: radius.pill, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primary: { backgroundColor: colors.primary }, secondary: { backgroundColor: colors.primarySoft }, danger: { backgroundColor: colors.dangerSoft }, ghost: { backgroundColor: 'transparent' },
  buttonText: { fontSize: 13, fontWeight: '700' }, pressed: { opacity: 0.72 }, disabled: { opacity: 0.5 },
  field: { marginBottom: 14 }, label: { color: colors.ink, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 13, fontSize: 14, color: colors.ink },
  multiline: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' }, inputError: { borderColor: colors.danger }, error: { color: colors.danger, fontSize: 11, marginTop: 5 }, hint: { color: colors.muted, fontSize: 11, marginTop: 5 },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start', maxWidth: 160 }, badgeText: { fontSize: 10, fontWeight: '700' },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, rowCopy: { flex: 1 }, rowTitle: { color: colors.ink, fontSize: 13, fontWeight: '700' }, rowSubtitle: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 }, rowMeta: { color: colors.primary, fontSize: 10, fontWeight: '700', marginTop: 4 },
  state: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 23, paddingVertical: 36, gap: 4 }, stateIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  stateTitle: { color: colors.ink, fontSize: 15, fontWeight: '700', textAlign: 'center', marginTop: 6 }, stateText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 4 },
  retry: { paddingVertical: 10, paddingHorizontal: 14, marginTop: 10, borderRadius: 11, backgroundColor: colors.primarySoft }, retryText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  segmented: { flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: colors.surfaceMuted, marginBottom: 14 }, segment: { flex: 1, minHeight: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }, segmentOn: { backgroundColor: colors.surface, shadowColor: '#0B3A5E', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  segmentText: { color: colors.muted, fontSize: 12, fontWeight: '600' }, segmentTextOn: { color: colors.primary, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { minHeight: 38, paddingHorizontal: 13, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center' }, chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, chipText: { color: colors.ink, fontSize: 12, fontWeight: '600' }, chipTextOn: { color: colors.primary, fontWeight: '800' },
  stat: { flexGrow: 1, flexBasis: '45%', minHeight: 84, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'space-between' }, statValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 }, statLabel: { color: colors.muted, fontSize: 11, marginTop: 6 },
  feedback: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 13, marginVertical: 10 }, feedbackText: { flex: 1, fontSize: 12, fontWeight: '600' },
});
