import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { MobileScreen } from '../../components/MobileScreen';
import { ScreenHeading } from '../../components/ScreenHeading';
import { supabase } from '../../lib/supabase';
import { colors, radius } from '../../theme/tokens';

type Appointment = {
  id: string;
  medico_id: string | null;
  hora_inicio: string;
  hora_fim: string | null;
  tipo: string | null;
  status: string | null;
  pacientes: { nome: string | null; nome_social: string | null } | null;
  medicos: { nome: string | null } | null;
};
type Professional = { id: string; nome: string };

const allowedRoles = ['admin', 'recepcao', 'enfermagem', 'medico'];
const statusFilters = [
  { key: 'todos', label: 'Todos' },
  { key: 'marcados', label: 'Marcados' },
  { key: 'aguardando', label: 'Aguardando' },
  { key: 'concluidos', label: 'Concluídos' },
  { key: 'cancelados', label: 'Cancelados' },
] as const;
type StatusFilter = typeof statusFilters[number]['key'];

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(value: string) {
  return value.includes('T') ? value.slice(11, 16) : value.slice(0, 5);
}

function statusMatches(status: string | null, filter: StatusFilter) {
  if (filter === 'todos') return true;
  if (filter === 'marcados') return ['agendado', 'confirmado'].includes(status ?? '');
  if (filter === 'aguardando') return ['aguardando', 'aguardando_triagem', 'em_triagem', 'aguardando_pagamento'].includes(status ?? '');
  if (filter === 'concluidos') return ['finalizado', 'atendimento_finalizado', 'pago'].includes(status ?? '');
  return ['cancelado', 'faltou'].includes(status ?? '');
}

export default function AgendaScreen() {
  const { session, profile, profileLoading } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [professionalFilter, setProfessionalFilter] = useState('todos');
  const [refreshKey, setRefreshKey] = useState(0);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [checkinFeedback, setCheckinFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const dates = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() + weekOffset * 7);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = dateKey(date);
      const label = key === dateKey(new Date()) ? 'Hoje' : new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit' }).format(date).replace('.', '');
      return { date, key, label };
    });
  }, [weekOffset]);
  const selected = dates.find(item => item.key === selectedDate) ?? dates[0];
  const canViewAgenda = Boolean(profile?.roles.some(role => allowedRoles.includes(role)));
  const isMedicoOnly = Boolean(profile?.roles.includes('medico') && !profile.roles.some(role => ['admin', 'recepcao', 'enfermagem'].includes(role)));
  const filteredAppointments = appointments.filter(item => statusMatches(item.status, statusFilter)
    && (professionalFilter === 'todos' || item.medico_id === professionalFilter));

  useEffect(() => {
    if (!session || !profile?.clinicaId || !canViewAgenda || !supabase) {
      setAppointments([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError('');
    void (async () => {
      // The RPC and relationship result are newer than the generated DB types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      let medicoId: string | null = null;
      if (isMedicoOnly) {
        const { data, error: medicoError } = await db.rpc('buscar_medico_atual');
        if (medicoError) throw medicoError;
        medicoId = data?.[0]?.id ?? null;
        if (!medicoId) throw new Error('Não foi possível localizar o perfil profissional vinculado à sua conta.');
      }
      if (!isMedicoOnly) {
        const { data: professionalData, error: professionalError } = await db.from('medicos')
          .select('id, nome')
          .eq('clinica_id', profile.clinicaId)
          .order('nome', { ascending: true })
          .limit(100);
        if (professionalError) throw professionalError;
        if (active) setProfessionals((professionalData ?? []) as Professional[]);
      } else if (active) {
        setProfessionals([]);
        setProfessionalFilter('todos');
      }
      let query = db.from('agendamentos')
        .select('id, medico_id, hora_inicio, hora_fim, tipo, status, pacientes(nome, nome_social), medicos(nome)')
        .eq('clinica_id', profile.clinicaId)
        .eq('data', selected.key)
        .order('hora_inicio', { ascending: true })
        .limit(100);
      if (medicoId) query = query.eq('medico_id', medicoId);
      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      if (active) setAppointments((data ?? []) as Appointment[]);
    })().catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a agenda.');
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [session, profile?.clinicaId, canViewAgenda, isMedicoOnly, selected.key, refreshKey]);

  async function checkInAppointment(appointment: Appointment) {
    if (!supabase || !profile?.clinicaId || checkingInId) return;
    setCheckingInId(appointment.id);
    setCheckinFeedback(null);
    try {
      const { data, error: checkinError } = await supabase.rpc('realizar_checkin', {
        p_agendamento_id: appointment.id,
        p_prioridade: 'normal',
      });
      if (checkinError) throw checkinError;
      if (!data) throw new Error('O check-in não retornou confirmação.');
      const repeated = typeof data === 'object' && data !== null && !Array.isArray(data) && data.repetido === true;
      setCheckinFeedback({
        message: repeated
          ? 'Este atendimento já está na fila.'
          : 'Check-in registrado. A recepção precisa confirmar a cobrança antes do atendimento.',
        error: false,
      });
      setRefreshKey(value => value + 1);
    } catch {
      setCheckinFeedback({
        message: 'Não foi possível fazer o check-in. Confirme se o atendimento ainda está disponível e tente atualizar a agenda.',
        error: true,
      });
    } finally {
      setCheckingInId(null);
    }
  }

  function moveWeek(direction: number) {
    const nextOffset = weekOffset + direction;
    setWeekOffset(nextOffset);
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    today.setDate(today.getDate() + nextOffset * 7);
    setSelectedDate(dateKey(today));
  }

  function showToday() {
    setWeekOffset(0);
    setSelectedDate(dateKey(new Date()));
  }

  return <MobileScreen>
    <ScreenHeading title="Agenda" subtitle="Organize os atendimentos da clínica." />
    <View style={styles.week}>
      <Pressable accessibilityLabel="Semana anterior" onPress={() => moveWeek(-1)} style={styles.arrow}><Ionicons name="chevron-back" size={18} color={colors.ink} /></Pressable>
      <Pressable onPress={showToday} accessibilityRole="button"><Text style={styles.month}>{new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(selected.date)}</Text></Pressable>
      <Pressable accessibilityLabel="Semana seguinte" onPress={() => moveWeek(1)} style={styles.arrow}><Ionicons name="chevron-forward" size={18} color={colors.ink} /></Pressable>
      <Pressable accessibilityLabel="Atualizar agenda" onPress={() => setRefreshKey(value => value + 1)} style={styles.arrow}><Ionicons name="refresh-outline" size={17} color={colors.ink} /></Pressable>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
      {dates.map(item => <Pressable key={item.key} onPress={() => setSelectedDate(item.key)} style={[styles.day, selectedDate === item.key && styles.selectedDay]}><Text style={[styles.dayText, selectedDate === item.key && styles.selectedText]}>{item.label}</Text></Pressable>)}
    </ScrollView>
    {canViewAgenda ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/appointments/new', params: { date: selected.key } })} style={styles.createButton}><Ionicons name="add" size={18} color="#fff" /><Text style={styles.createButtonText}>Novo agendamento</Text></Pressable> : null}
    <View style={styles.summary}><View style={styles.summaryIcon}><Ionicons name="calendar-outline" size={18} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.summaryTitle}>Agenda da clínica</Text><Text style={styles.summaryCaption}>{filteredAppointments.length} {filteredAppointments.length === 1 ? 'atendimento' : 'atendimentos'} · {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' }).format(selected.date)}</Text></View></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
      {statusFilters.map(item => <Pressable key={item.key} onPress={() => setStatusFilter(item.key)} style={[styles.filter, statusFilter === item.key && styles.filterSelected]}><Text style={[styles.filterText, statusFilter === item.key && styles.filterTextSelected]}>{item.label}</Text></Pressable>)}
    </ScrollView>
    {!isMedicoOnly && professionals.length > 0 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
      {[{ id: 'todos', nome: 'Todos profissionais' }, ...professionals].map(item => <Pressable key={item.id} onPress={() => setProfessionalFilter(item.id)} style={[styles.filter, professionalFilter === item.id && styles.filterSelected]}><Text style={[styles.filterText, professionalFilter === item.id && styles.filterTextSelected]}>{item.nome}</Text></Pressable>)}
    </ScrollView> : null}
    {checkinFeedback ? <Text accessibilityRole={checkinFeedback.error ? 'alert' : 'status'} style={[styles.checkinFeedback, checkinFeedback.error && styles.checkinError]}>{checkinFeedback.message}</Text> : null}

    {profileLoading || loading ? <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.stateText}>Carregando agenda…</Text></View> : null}
    {!profileLoading && !canViewAgenda ? <State icon="lock-closed-outline" title="Acesso não disponível" message="A agenda não está liberada para o perfil desta conta." /> : null}
    {!profileLoading && canViewAgenda && error ? <State icon="alert-circle-outline" title="Não foi possível abrir a agenda" message={error} action={() => setRefreshKey(value => value + 1)} /> : null}
    {!profileLoading && canViewAgenda && !loading && !error && filteredAppointments.length === 0 ? <State icon="time-outline" title="Sem atendimentos neste filtro" message={appointments.length ? 'Escolha outro status para ver os atendimentos deste dia.' : 'Não há horários marcados para esta data.'} /> : null}
    {!profileLoading && filteredAppointments.map(item => <AppointmentRow key={item.id} appointment={item} showCheckin={selected.key === dateKey(new Date()) && isMedicoOnly && ['agendado', 'confirmado'].includes(item.status ?? '')} checkingIn={checkingInId === item.id} disabled={checkingInId !== null} onCheckin={() => void checkInAppointment(item)} onOpen={() => router.push({ pathname: '/appointments/[appointmentId]', params: { appointmentId: item.id } })} />)}
  </MobileScreen>;
}

function State({ icon, title, message, action }: { icon: keyof typeof Ionicons.glyphMap; title: string; message: string; action?: () => void }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name={icon} size={24} color={colors.primary} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{message}</Text>{action ? <Pressable onPress={action} style={styles.retry}><Text style={styles.retryText}>Tentar novamente</Text></Pressable> : null}</View>;
}

function AppointmentRow({ appointment, showCheckin, checkingIn, disabled, onCheckin, onOpen }: { appointment: Appointment; showCheckin: boolean; checkingIn: boolean; disabled: boolean; onCheckin: () => void; onOpen: () => void }) {
  const patient = appointment.pacientes?.nome_social || appointment.pacientes?.nome || 'Paciente';
  return <View style={styles.appointment}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Abrir atendimento de ${patient}`} onPress={onOpen} style={styles.appointmentPressable}>
      <View style={styles.time}><Text style={styles.timeText}>{formatTime(appointment.hora_inicio)}</Text>{appointment.hora_fim ? <Text style={styles.endTime}>{formatTime(appointment.hora_fim)}</Text> : null}</View>
      <View style={styles.timeline}><View style={styles.timelineDot} /><View style={styles.timelineLine} /></View>
      <View style={styles.appointmentInfo}><Text style={styles.patientName} numberOfLines={1}>{patient}</Text><Text style={styles.doctor} numberOfLines={1}>{appointment.medicos?.nome || appointment.tipo || 'Atendimento'}</Text>{appointment.status ? <Text style={styles.status}>{appointment.status.replaceAll('_', ' ')}</Text> : null}</View>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
    {showCheckin ? <Pressable accessibilityRole="button" disabled={disabled} onPress={onCheckin} style={({ pressed }) => [styles.checkinButton, pressed && styles.checkinPressed, disabled && styles.checkinDisabled]}>{checkingIn ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="checkmark-circle-outline" size={16} color={colors.primary} />}<Text style={styles.checkinText}>{checkingIn ? 'Registrando…' : 'Fazer check-in'}</Text></Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  week: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }, arrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.surface }, month: { color: colors.ink, fontSize: 14, fontWeight: '700', textTransform: 'capitalize' }, createButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: -4, marginBottom: 12, borderRadius: 13, backgroundColor: colors.primary }, createButtonText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  days: { gap: 8, paddingBottom: 18 }, day: { minWidth: 54, height: 42, paddingHorizontal: 9, justifyContent: 'center', alignItems: 'center', borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, selectedDay: { backgroundColor: colors.primary, borderColor: colors.primary }, dayText: { color: colors.muted, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' }, selectedText: { color: '#FFFFFF' },
  summary: { flexDirection: 'row', gap: 11, alignItems: 'center', padding: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 10 }, summaryIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, summaryTitle: { color: colors.ink, fontSize: 13, fontWeight: '700' }, summaryCaption: { color: colors.muted, fontSize: 11, marginTop: 3 },
  filters: { gap: 7, paddingBottom: 8 }, filter: { borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, filterSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }, filterText: { color: colors.muted, fontSize: 11, fontWeight: '600' }, filterTextSelected: { color: colors.primary }, checkinFeedback: { color: colors.success, fontSize: 11, lineHeight: 16, paddingHorizontal: 2, paddingVertical: 6 }, checkinError: { color: colors.danger },
  state: { alignItems: 'center', padding: 28, gap: 9 }, stateText: { color: colors.muted, fontSize: 12 }, empty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 45 }, emptyIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }, emptyTitle: { color: colors.ink, fontSize: 15, fontWeight: '700', textAlign: 'center' }, emptyText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7 }, retry: { paddingVertical: 10, paddingHorizontal: 14, marginTop: 10, borderRadius: 11, backgroundColor: colors.primarySoft }, retryText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  appointment: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingBottom: 8 }, appointmentPressable: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 4 }, time: { width: 43 }, timeText: { color: colors.ink, fontSize: 13, fontWeight: '700' }, endTime: { color: colors.muted, fontSize: 10, marginTop: 4 }, timeline: { width: 12, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }, timelineDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary, zIndex: 1 }, timelineLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: colors.border }, appointmentInfo: { flex: 1, paddingVertical: 12 }, patientName: { color: colors.ink, fontSize: 13, fontWeight: '700' }, doctor: { color: colors.muted, fontSize: 11, marginTop: 4 }, status: { alignSelf: 'flex-start', color: colors.success, backgroundColor: colors.successSoft, fontSize: 9, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99, marginTop: 5, textTransform: 'capitalize' }, checkinButton: { alignSelf: 'flex-start', minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, marginLeft: 58, borderRadius: 11, backgroundColor: colors.primarySoft }, checkinPressed: { opacity: 0.72 }, checkinDisabled: { opacity: 0.5 }, checkinText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
});
