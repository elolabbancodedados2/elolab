import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppRole } from '../../auth/AuthContext';
import { useAuth } from '../../auth/useAuth';
import { MobileScreen } from '../../components/MobileScreen';
import { ScreenHeading } from '../../components/ScreenHeading';
import { supabase } from '../../lib/supabase';
import { colors, radius } from '../../theme/tokens';

type AppointmentDetails = {
  id: string;
  paciente_id: string;
  data: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  status: string | null;
  tipo: string | null;
  observacoes: string | null;
  exige_triagem: boolean | null;
  updated_at: string | null;
  motivo_cancelamento: string | null;
  pacientes: { nome: string | null; nome_social: string | null } | null;
  medicos: { nome: string | null } | null;
  salas: { nome: string | null } | null;
};

const viewRoles: AppRole[] = ['admin', 'recepcao', 'enfermagem', 'medico'];
const triageRoles: AppRole[] = ['admin', 'enfermagem', 'medico'];
const triageStatuses = ['agendado', 'confirmado', 'aguardando', 'aguardando_triagem', 'pago'];
const cancellableStatuses = ['agendado', 'confirmado', 'aguardando', 'aguardando_triagem', 'em_triagem'];
const cancellationReasons = [
  { value: 'solicitacao_paciente', label: 'Solicitação do paciente' },
  { value: 'indisponibilidade_profissional', label: 'Indisponibilidade do profissional' },
  { value: 'conflito_horario', label: 'Conflito de horário' },
  { value: 'ajuste_administrativo', label: 'Ajuste administrativo' },
  { value: 'outro', label: 'Outro' },
];

function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function formatTime(value: string | null) {
  return value ? (value.includes('T') ? value.slice(11, 16) : value.slice(0, 5)) : 'Não informado';
}

export default function AppointmentDetailScreen() {
  const { appointmentId: rawId } = useLocalSearchParams<{ appointmentId: string }>();
  const appointmentId = Array.isArray(rawId) ? rawId[0] : rawId;
  const { session, profile, profileLoading } = useAuth();
  const clinicId = profile?.clinicaId;
  const allowed = Boolean(profile?.roles.some(role => viewRoles.includes(role)));
  const canTriage = Boolean(profile?.roles.some(role => triageRoles.includes(role)));
  const [appointment, setAppointment] = useState<AppointmentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [canceling, setCanceling] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState('');

  useEffect(() => {
    if (profileLoading) return;
    if (!session || !clinicId || !allowed || !supabase || !appointmentId) {
      setAppointment(null);
      setError(!allowed ? 'Esta conta não tem acesso à agenda.' : 'Não foi possível identificar a clínica ou o atendimento.');
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError('');
    void (async () => {
      // The generated DB types do not yet include the complete appointment joins.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data, error: queryError } = await db.from('agendamentos')
        .select('id, paciente_id, data, hora_inicio, hora_fim, status, tipo, observacoes, exige_triagem, updated_at, motivo_cancelamento, pacientes(nome, nome_social), medicos(nome), salas(nome)')
        .eq('id', appointmentId)
        .eq('clinica_id', clinicId)
        .maybeSingle();
      if (queryError) throw queryError;
      if (!data) throw new Error('Atendimento não encontrado nesta clínica.');
      if (active) setAppointment(data as AppointmentDetails);
    })().catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o atendimento.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [allowed, appointmentId, clinicId, profileLoading, session]);

  const patientName = appointment?.pacientes?.nome_social || appointment?.pacientes?.nome || 'Paciente';
  const showTriage = Boolean(canTriage && appointment?.exige_triagem && triageStatuses.includes(appointment.status ?? ''));
  const canManageAppointment = Boolean(profile?.roles.some(role => ['admin', 'recepcao', 'enfermagem', 'medico'].includes(role)));
  const canEdit = Boolean(canManageAppointment && appointment && ['agendado', 'confirmado', 'aguardando'].includes(appointment.status ?? ''));
  const canCancel = Boolean(canManageAppointment && appointment && cancellableStatuses.includes(appointment.status ?? ''));

  async function cancelAppointment() {
    if (!supabase || !clinicId || !appointment || !cancelReason || canceling) return;
    setCanceling(true);
    setCancelFeedback('');
    try {
      // Cancellation must go through the audited RPC; direct status writes can leave queue rows behind.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data, error: cancelError } = await db.rpc('cancelar_agendamento_com_motivo', {
        p_agendamento_id: appointment.id,
        p_clinica_id: clinicId,
        p_updated_at: appointment.updated_at ?? null,
        p_motivo_cancelamento: cancelReason,
      });
      if (cancelError) throw cancelError;
      if (!data?.atualizado) throw new Error('O atendimento mudou desde que foi aberto. Atualize a tela e confira o status.');
      const reasonLabel = cancellationReasons.find(reason => reason.value === cancelReason)?.label ?? 'Outro';
      setAppointment(current => current ? { ...current, status: 'cancelado', motivo_cancelamento: cancelReason } : current);
      setCancelFeedback(`Consulta cancelada. Motivo: ${reasonLabel}. O registro foi mantido no histórico.`);
      setCancelReason('');
    } catch (reason) {
      setCancelFeedback(reason instanceof Error ? reason.message : 'Não foi possível cancelar esta consulta.');
    } finally {
      setCanceling(false);
    }
  }

  return <MobileScreen>
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={19} color={colors.ink} /><Text style={styles.backText}>Voltar para agenda</Text></Pressable>
    <ScreenHeading title="Atendimento" subtitle="Detalhes do horário e ações disponíveis." />
    {loading || profileLoading ? <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Carregando atendimento…</Text></View> : null}
    {!loading && error ? <View style={styles.state}><Ionicons name="alert-circle-outline" size={25} color={colors.danger} /><Text style={styles.error}>{error}</Text></View> : null}
    {!loading && appointment ? <>
      <View style={styles.hero}>
        <View style={styles.heroIcon}><Ionicons name="calendar" size={22} color={colors.primary} /></View>
        <Text style={styles.heroDate}>{formatDate(appointment.data)}</Text>
        <Text style={styles.heroTime}>{formatTime(appointment.hora_inicio)}{appointment.hora_fim ? ` – ${formatTime(appointment.hora_fim)}` : ''}</Text>
        <Text style={styles.badge}>{(appointment.status || 'Sem status').replaceAll('_', ' ')}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Paciente</Text>
        <InfoRow icon="person-outline" label="Nome" value={patientName} />
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/patients/[patientId]', params: { patientId: appointment.paciente_id } })} style={styles.action}>
          <Ionicons name="folder-open-outline" size={18} color={colors.primary} /><Text style={styles.actionText}>Abrir cadastro do paciente</Text><Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Consulta</Text>
        <InfoRow icon="medical-outline" label="Profissional" value={appointment.medicos?.nome || 'Não informado'} />
        <InfoRow icon="reader-outline" label="Tipo" value={appointment.tipo || 'Consulta'} />
        <InfoRow icon="business-outline" label="Sala" value={appointment.salas?.nome || 'Não definida'} />
        {appointment.observacoes ? <View style={styles.notes}><Text style={styles.noteLabel}>Observações</Text><Text style={styles.noteText}>{appointment.observacoes}</Text></View> : null}
      </View>
      {appointment.motivo_cancelamento ? <View style={styles.card}><Text style={styles.sectionTitle}>Cancelamento</Text><InfoRow icon="close-circle-outline" label="Motivo" value={cancellationReasons.find(reason => reason.value === appointment.motivo_cancelamento)?.label || 'Outro'} /></View> : null}
      {canEdit ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/appointments/new', params: { appointmentId: appointment.id } })} style={styles.secondaryAction}><Ionicons name="create-outline" size={19} color={colors.primary} /><Text style={styles.secondaryActionText}>Editar atendimento</Text></Pressable> : null}
      {showTriage ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/triage/[appointmentId]', params: { appointmentId: appointment.id } })} style={styles.primaryAction}><Ionicons name="pulse-outline" size={19} color="#fff" /><Text style={styles.primaryActionText}>Abrir triagem</Text></Pressable> : null}
      {canCancel ? <View style={styles.cancelCard}>
        <Text style={styles.sectionTitle}>Cancelar consulta</Text>
        <Text style={styles.cancelDescription}>O atendimento sairá da fila e permanecerá no histórico. Selecione um motivo para confirmar.</Text>
        <View style={styles.reasonList}>{cancellationReasons.map(reason => <Pressable key={reason.value} accessibilityRole="radio" accessibilityState={{ selected: cancelReason === reason.value }} disabled={canceling} onPress={() => setCancelReason(reason.value)} style={[styles.reason, cancelReason === reason.value && styles.reasonSelected]}><Ionicons name={cancelReason === reason.value ? 'radio-button-on' : 'radio-button-off'} size={17} color={cancelReason === reason.value ? colors.primary : colors.muted} /><Text style={[styles.reasonText, cancelReason === reason.value && styles.reasonTextSelected]}>{reason.label}</Text></Pressable>)}</View>
        {cancelFeedback ? <Text accessibilityRole="alert" style={[styles.cancelFeedback, appointment.status !== 'cancelado' && styles.cancelError]}>{cancelFeedback}</Text> : null}
        <Pressable accessibilityRole="button" disabled={!cancelReason || canceling} onPress={() => void cancelAppointment()} style={({ pressed }) => [styles.dangerAction, pressed && styles.pressed, (!cancelReason || canceling) && styles.disabled]}>{canceling ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="close-circle-outline" size={18} color="#fff" />}<Text style={styles.dangerText}>{canceling ? 'Cancelando…' : 'Confirmar cancelamento'}</Text></Pressable>
      </View> : null}
    </> : null}
  </MobileScreen>;
}

function InfoRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return <View style={styles.infoRow}><Ionicons name={icon} size={17} color={colors.muted} /><View style={styles.infoCopy}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View></View>;
}

const styles = StyleSheet.create({
  back: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 4 }, backText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  state: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 }, muted: { color: colors.muted, fontSize: 12 }, error: { color: colors.danger, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  hero: { alignItems: 'center', padding: 22, marginBottom: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, heroIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.primarySoft, marginBottom: 12 }, heroDate: { color: colors.muted, fontSize: 13, textTransform: 'capitalize' }, heroTime: { color: colors.ink, fontSize: 27, fontWeight: '800', marginTop: 4 }, badge: { overflow: 'hidden', color: colors.primary, backgroundColor: colors.primarySoft, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 99, marginTop: 12, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  card: { padding: 16, marginBottom: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, sectionTitle: { color: colors.ink, fontSize: 14, fontWeight: '800', marginBottom: 10 }, infoRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, infoCopy: { flex: 1 }, infoLabel: { color: colors.muted, fontSize: 10, marginBottom: 3 }, infoValue: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  action: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9 }, actionText: { flex: 1, color: colors.primary, fontSize: 12, fontWeight: '700' }, notes: { paddingTop: 13 }, noteLabel: { color: colors.muted, fontSize: 10, marginBottom: 5 }, noteText: { color: colors.ink, fontSize: 12, lineHeight: 18 },
  primaryAction: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 2, marginBottom: 14, borderRadius: 14, backgroundColor: colors.primary }, primaryActionText: { color: '#fff', fontSize: 13, fontWeight: '700' }, secondaryAction: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface }, secondaryActionText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  cancelCard: { padding: 16, marginTop: 2, marginBottom: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, cancelDescription: { color: colors.muted, fontSize: 11, lineHeight: 17, marginBottom: 10 }, reasonList: { gap: 6 }, reason: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderRadius: 11, borderWidth: 1, borderColor: colors.border }, reasonSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, reasonText: { color: colors.ink, fontSize: 11 }, reasonTextSelected: { color: colors.primary, fontWeight: '700' }, dangerAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 13, borderRadius: 12, backgroundColor: colors.danger }, dangerText: { color: '#fff', fontSize: 12, fontWeight: '700' }, cancelFeedback: { color: colors.success, fontSize: 11, lineHeight: 17, marginTop: 10 }, cancelError: { color: colors.danger }, pressed: { opacity: 0.75 }, disabled: { opacity: 0.5 },
});
