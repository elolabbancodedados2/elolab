import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { MobileScreen } from '../../components/MobileScreen';
import { supabase } from '../../lib/supabase';
import { colors, radius } from '../../theme/tokens';

type TodayAppointment = {
  id: string;
  hora_inicio: string | null;
  status: string | null;
  tipo: string | null;
  pacientes: { nome: string | null; nome_social: string | null } | null;
  medicos: { nome: string | null } | null;
};

function todayAtClinic() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function timeLabel(value: string | null) {
  if (!value) return '—';
  return value.includes('T') ? value.slice(11, 16) : value.slice(0, 5);
}

export default function HomeScreen() {
  const { session, profile } = useAuth();
  const [appointments, setAppointments] = useState<TodayAppointment[]>([]);
  const [loadingAgenda, setLoadingAgenda] = useState(true);
  const [agendaError, setAgendaError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  useFocusEffect(useCallback(() => { setRefreshKey(value => value + 1); }, []));
  useEffect(() => {
    if (!session || !profile?.clinicaId || !supabase) {
      setAppointments([]);
      setLoadingAgenda(false);
      return;
    }
    let active = true;
    setLoadingAgenda(true);
    setAgendaError(false);
    void (async () => {
      // The generated database type does not yet include the joined appointment response.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      let doctorId: string | null = null;
      const doctorOnly = profile.roles.includes('medico') && !profile.roles.some(role => ['admin', 'recepcao', 'enfermagem'].includes(role));
      if (doctorOnly) {
        const { data, error } = await db.rpc('buscar_medico_atual');
        if (error) throw error;
        doctorId = data?.[0]?.id ?? null;
        if (!doctorId) throw new Error('Perfil profissional não localizado.');
      }
      let query = db.from('agendamentos')
        .select('id, hora_inicio, status, tipo, pacientes(nome, nome_social), medicos(nome)')
        .eq('clinica_id', profile.clinicaId)
        .eq('data', todayAtClinic())
        .neq('status', 'cancelado')
        .order('hora_inicio', { ascending: true })
        .limit(5);
      if (doctorId) query = query.eq('medico_id', doctorId);
      const { data, error } = await query;
      if (error) throw error;
      if (active) setAppointments((data ?? []) as TodayAppointment[]);
    })().catch(() => { if (active) { setAppointments([]); setAgendaError(true); } }).finally(() => { if (active) setLoadingAgenda(false); });
    return () => { active = false; };
  }, [profile?.clinicaId, profile?.roles, refreshKey, session]);
  const firstName = profile?.nome.split(' ')[0] || session?.user.email?.split('@')[0] || 'equipe';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia,' : hour < 18 ? 'Boa tarde,' : 'Boa noite,';
  return (
    <MobileScreen>
      <View style={styles.top}>
        <View><Text style={styles.greeting}>{greeting}</Text><Text style={styles.name}>{firstName}</Text></View>
        <Pressable accessibilityLabel="Notificações" style={styles.bell}><Ionicons name="notifications-outline" size={21} color={colors.ink} /><View style={styles.dot} /></Pressable>
      </View>

      <View style={styles.welcome}>
        <View style={styles.welcomeIcon}><Ionicons name="sunny-outline" size={18} color="#FFFFFF" /></View>
        <View style={styles.welcomeText}><Text style={styles.welcomeTitle}>Sua rotina, mais leve.</Text><Text style={styles.welcomeBody}>Acompanhe o dia da clínica em um só lugar.</Text></View>
      </View>

      <Text style={styles.sectionTitle}>Acesso rápido</Text>
      <View style={styles.quickGrid}>
        <QuickAction icon="calendar" label="Ver agenda" color={colors.primary} onPress={() => router.push('/(tabs)/agenda')} />
        <QuickAction icon="person-add" label="Buscar paciente" color="#26836C" onPress={() => router.push('/(tabs)/patients')} />
        <QuickAction icon="list" label="Fila de atendimento" color="#B57818" onPress={() => router.push('/(tabs)/care')} />
        <QuickAction icon="apps" label="Todos os módulos" color={colors.deep} onPress={() => router.push('/(tabs)/more')} />
      </View>

      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Resumo de hoje</Text><Text style={styles.date}>Hoje</Text></View>
      <View style={styles.agendaCard}>
        {loadingAgenda ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.emptyBody}>Carregando agenda…</Text></View> : agendaError ? <View style={styles.loading}><Text style={styles.emptyBody}>Não foi possível carregar os atendimentos de hoje.</Text><Pressable onPress={() => setRefreshKey(value => value + 1)} style={styles.textButton}><Text style={styles.textButtonLabel}>Tentar novamente</Text><Ionicons name="refresh-outline" size={16} color={colors.primary} /></Pressable></View> : appointments.length ? <>
          {appointments.map((item, index) => <Pressable key={item.id} onPress={() => router.push({ pathname: '/appointments/[appointmentId]', params: { appointmentId: item.id } })} style={[styles.appointment, index < appointments.length - 1 && styles.appointmentBorder]}>
            <Text style={styles.appointmentTime}>{timeLabel(item.hora_inicio)}</Text><View style={styles.appointmentCopy}><Text numberOfLines={1} style={styles.appointmentPatient}>{item.pacientes?.nome_social || item.pacientes?.nome || 'Paciente'}</Text><Text numberOfLines={1} style={styles.appointmentMeta}>{item.medicos?.nome || item.tipo || 'Atendimento'} · {(item.status || 'agendado').replaceAll('_', ' ')}</Text></View><Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>)}
          <Pressable onPress={() => router.push('/(tabs)/agenda')} style={styles.textButton}><Text style={styles.textButtonLabel}>Ver agenda completa</Text><Ionicons name="arrow-forward" size={16} color={colors.primary} /></Pressable>
        </> : <>
          <View style={styles.emptyIcon}><Ionicons name="calendar-clear-outline" size={23} color={colors.primary} /></View>
          <Text style={styles.emptyTitle}>Nenhum atendimento hoje</Text>
          <Text style={styles.emptyBody}>Consulte outros dias ou confira a agenda da clínica.</Text>
          <Pressable onPress={() => router.push('/(tabs)/agenda')} style={styles.textButton}><Text style={styles.textButtonLabel}>Abrir agenda</Text><Ionicons name="arrow-forward" size={16} color={colors.primary} /></Pressable>
        </>}
      </View>

      <View style={styles.privacy}><Ionicons name="shield-checkmark-outline" size={16} color={colors.success} /><Text style={styles.privacyText}>Seus dados são protegidos pelas permissões da sua conta.</Text></View>
    </MobileScreen>
  );
}

function QuickAction({ icon, label, color, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}><View style={[styles.actionIcon, { backgroundColor: `${color}17` }]}><Ionicons name={icon} size={21} color={color} /></View><Text style={styles.actionLabel}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 23 },
  greeting: { color: colors.muted, fontSize: 13 }, name: { color: colors.ink, fontSize: 24, fontWeight: '800', textTransform: 'capitalize', marginTop: 2 },
  bell: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, dot: { position: 'absolute', right: 11, top: 10, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.surface },
  welcome: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 17, backgroundColor: colors.deep, borderRadius: radius.md, marginBottom: 26 },
  welcomeIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#FFFFFF22', alignItems: 'center', justifyContent: 'center' }, welcomeText: { flex: 1 }, welcomeTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' }, welcomeBody: { color: '#CFE3F2', fontSize: 11, marginTop: 4 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 26, marginBottom: 12 }, sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: '700', marginBottom: 12 }, date: { color: colors.primary, fontSize: 12, fontWeight: '700', marginBottom: 12 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, action: { width: '48%', flexGrow: 1, minHeight: 105, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'space-between' }, pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] }, actionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, actionLabel: { color: colors.ink, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  agendaCard: { alignItems: 'stretch', backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10, borderColor: colors.border, borderWidth: 1 }, loading: { minHeight: 130, alignItems: 'center', justifyContent: 'center', gap: 8 }, emptyIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12, alignSelf: 'center', marginTop: 12 }, emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: '700', textAlign: 'center' }, emptyBody: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 }, appointment: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10 }, appointmentBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, appointmentTime: { width: 44, color: colors.primary, fontSize: 12, fontWeight: '800' }, appointmentCopy: { flex: 1 }, appointmentPatient: { color: colors.ink, fontSize: 12, fontWeight: '700' }, appointmentMeta: { color: colors.muted, fontSize: 10, marginTop: 3, textTransform: 'capitalize' }, textButton: { flexDirection: 'row', gap: 7, alignItems: 'center', alignSelf: 'center', marginTop: 12, marginBottom: 5 }, textButtonLabel: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  privacy: { flexDirection: 'row', gap: 7, alignItems: 'center', marginTop: 18 }, privacyText: { flex: 1, color: colors.muted, fontSize: 10, lineHeight: 15 },
});
