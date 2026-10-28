import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { MobileScreen } from '../../components/MobileScreen';
import { ScreenHeading } from '../../components/ScreenHeading';
import { supabase } from '../../lib/supabase';
import { colors, radius } from '../../theme/tokens';

type Patient = {
  id: string;
  nome: string;
  nome_social: string | null;
  ativo: boolean | null;
  cpf: string | null;
  data_nascimento: string | null;
  sexo: string | null;
  telefone: string | null;
  email: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  numero_carteira: string | null;
  validade_carteira: string | null;
  convenio_id: string | null;
  convenios: { nome: string | null } | null;
  alergias: string[] | string | null;
  comorbidades: string | null;
  observacoes: string | null;
  gestante: boolean | null;
  amamentando: boolean | null;
};

type Appointment = {
  id: string;
  data: string;
  hora_inicio: string;
  status: string | null;
  tipo: string | null;
  observacoes: string | null;
  medicos: { nome: string | null; crm: string | null; especialidade: string | null } | null;
  salas: { nome: string | null } | null;
};

const clinicalRoles = ['admin', 'recepcao', 'enfermagem', 'medico'];
const financialRoles = ['financeiro'];
const appointmentPageSize = 12;
const patientStatusReasons = [
  { value: 'solicitacao_titular', label: 'Solicitação do titular' },
  { value: 'cadastro_duplicado', label: 'Cadastro duplicado' },
  { value: 'cadastro_incorreto', label: 'Cadastro incorreto' },
  { value: 'transferencia_clinica', label: 'Transferência para outra clínica' },
  { value: 'retorno_ao_atendimento', label: 'Retorno ao atendimento' },
  { value: 'correcao_cadastro', label: 'Correção cadastral concluída' },
  { value: 'outro', label: 'Outro motivo administrativo' },
];

function formatDate(value: string | null) {
  if (!value) return 'Não informado';
  const [year, month, day] = value.slice(0, 10).split('-');
  return day && month && year ? `${day}/${month}/${year}` : 'Não informado';
}

function formatStatus(value: string | null) {
  if (!value) return 'Sem status';
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function allergyList(value: Patient['alergias']) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return typeof value === 'string' ? value.split(',').map(item => item.trim()).filter(Boolean) : [];
}

export default function PatientDetailScreen() {
  const { patientId: rawPatientId } = useLocalSearchParams<{ patientId: string }>();
  const patientId = Array.isArray(rawPatientId) ? rawPatientId[0] : rawPatientId;
  const { session, profile, profileLoading } = useAuth();
  const clinicId = profile?.clinicaId;
  const canView = Boolean(profile?.roles.some(role => clinicalRoles.includes(role)));
  const canViewRecords = Boolean(profile?.roles.some(role => ['admin', 'medico'].includes(role)));
  const canEdit = Boolean(profile?.roles.some(role => ['admin', 'recepcao', 'medico'].includes(role)));
  const financialOnly = Boolean(profile?.roles.some(role => financialRoles.includes(role)) && !canView);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [statusEditorOpen, setStatusEditorOpen] = useState(false);
  const [statusReason, setStatusReason] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{ message: string; error: boolean } | null>(null);

  useFocusEffect(useCallback(() => {
    setRefreshKey(value => value + 1);
  }, []));

  useEffect(() => {
    if (profileLoading) return;
    if (!session || !clinicId || !canView || !supabase || !patientId) {
      setPatient(null);
      setAppointments([]);
      setError(financialOnly
        ? 'Este perfil pode consultar apenas resumos financeiros de pacientes.'
        : 'Não foi possível abrir este cadastro com o perfil atual.');
      setLoading(false);
      return;
    }

    let active = true;
    setPatient(null);
    setAppointments([]);
    setLoading(true);
    setError('');
    void (async () => {
      // A tela usa somente campos do cadastro básico e do histórico de agenda.
      // Prontuários exigem autorização/auditoria própria e não são lidos aqui.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [{ data: patientData, error: patientError }, { data: appointmentData, error: appointmentError }] = await Promise.all([
        db.from('pacientes')
          .select('id, nome, nome_social, ativo, cpf, data_nascimento, sexo, telefone, email, cep, logradouro, numero, complemento, bairro, cidade, estado, convenio_id, convenios(nome), numero_carteira, validade_carteira, alergias, comorbidades, observacoes, gestante, amamentando')
          .eq('id', patientId)
          .eq('clinica_id', clinicId)
          .maybeSingle(),
        db.from('agendamentos')
          .select('id, data, hora_inicio, status, tipo, observacoes, medicos(nome, crm, especialidade), salas(nome)')
          .eq('paciente_id', patientId)
          .eq('clinica_id', clinicId)
          .order('data', { ascending: false })
          .order('id', { ascending: false })
          .range(0, appointmentPageSize - 1),
      ]);
      if (patientError) throw patientError;
      if (appointmentError) throw appointmentError;
      if (!patientData) throw new Error('Paciente não encontrado nesta clínica.');
      if (active) {
        setPatient(patientData as Patient);
        const result = (appointmentData ?? []) as Appointment[];
        setAppointments(result);
        setHasMore(result.length === appointmentPageSize);
      }
    })().catch(error => {
      if (active) setError(error instanceof Error ? error.message : 'Não foi possível carregar o perfil do paciente.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [canView, clinicId, financialOnly, patientId, profileLoading, refreshKey, session]);

  async function loadMoreAppointments() {
    if (!supabase || !patientId || !clinicId || loadingMore || !hasMore) return;
    const offset = appointments.length;
    setLoadingMore(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data, error: queryError } = await db.from('agendamentos')
        .select('id, data, hora_inicio, status, tipo, observacoes, medicos(nome, crm, especialidade), salas(nome)')
        .eq('paciente_id', patientId)
        .eq('clinica_id', clinicId)
        .order('data', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + appointmentPageSize - 1);
      if (queryError) throw queryError;
      const rows = (data ?? []) as Appointment[];
      setAppointments(current => [...current, ...rows.filter(row => !current.some(item => item.id === row.id))]);
      setHasMore(rows.length === appointmentPageSize);
    } catch {
      setError('Não foi possível carregar consultas anteriores. Tente atualizar o perfil.');
    } finally {
      setLoadingMore(false);
    }
  }

  const allergies = patient ? allergyList(patient.alergias) : [];
  const address = patient ? [patient.logradouro, patient.numero, patient.complemento, patient.bairro, patient.cidade, patient.estado].filter(Boolean).join(', ') : '';
  const canManagePatientStatus = Boolean(profile?.roles.some(role => ['admin', 'recepcao'].includes(role)));

  async function changePatientStatus() {
    if (!patient || !clinicId || !supabase || !canManagePatientStatus || !statusReason || savingStatus) return;
    setSavingStatus(true);
    setStatusFeedback(null);
    try {
      // This audited SECURITY DEFINER RPC preserves the history and checks active bookings and queue state.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data, error: statusError } = await db.rpc('alterar_status_paciente', {
        p_paciente_id: patient.id,
        p_ativo: patient.ativo === false,
        p_motivo: statusReason,
      });
      if (statusError) throw statusError;
      if (!data || typeof data.ativo !== 'boolean' || typeof data.alterado !== 'boolean') {
        throw new Error('O servidor não confirmou a alteração do status.');
      }
      setPatient(current => current ? { ...current, ativo: data.ativo } : current);
      setStatusFeedback({
        message: data.ativo ? 'Paciente reativado. A ficha pode voltar a receber agendamentos e acesso ao portal.' : 'Paciente inativado. A ficha e o histórico foram preservados; novos agendamentos e acesso ao portal foram bloqueados.',
        error: false,
      });
      setStatusReason('');
      setStatusEditorOpen(false);
    } catch (reason) {
      setStatusFeedback({ message: reason instanceof Error ? reason.message : 'Não foi possível alterar o status deste paciente.', error: true });
    } finally {
      setSavingStatus(false);
    }
  }

  return <MobileScreen>
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={18} color={colors.primary} /><Text style={styles.backText}>Voltar à busca</Text></Pressable>
    <View style={styles.headingRow}><View style={{ flex: 1 }}><ScreenHeading title="Perfil do paciente" subtitle="Cadastro e histórico de consultas." /></View><Pressable accessibilityRole="button" accessibilityLabel="Atualizar perfil" onPress={() => setRefreshKey(value => value + 1)} style={styles.refresh}><Ionicons name="refresh-outline" size={18} color={colors.primary} /></Pressable></View>

    {profileLoading || loading ? <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.stateText}>Carregando cadastro…</Text></View> : null}
    {!loading && error ? <View style={styles.errorState}><Ionicons name="alert-circle-outline" size={23} color={colors.danger} /><Text style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setRefreshKey(value => value + 1)} style={styles.retry}><Text style={styles.retryText}>Tentar novamente</Text></Pressable></View> : null}
    {!loading && patient ? <>
      <View style={styles.identity}><View style={styles.avatar}><Ionicons name="person-outline" size={23} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.name}>{patient.nome_social || patient.nome}</Text>{patient.nome_social ? <Text style={styles.legalName}>Nome civil: {patient.nome}</Text> : null}<View style={styles.metaRow}><Text style={[styles.meta, patient.ativo === false && styles.metaInactive]}>{patient.ativo === false ? 'Cadastro inativo' : 'Cadastro ativo'}</Text></View></View></View>
      {canViewRecords ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/patients/[patientId]/records', params: { patientId: patient.id } })} style={styles.recordsAction}><Ionicons name="document-text-outline" size={18} color={colors.primary} /><Text style={styles.editPatientText}>Abrir prontuário</Text></Pressable> : null}
      {canEdit ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/patients/new', params: { patientId: patient.id } })} style={styles.editPatient}><Ionicons name="create-outline" size={17} color={colors.primary} /><Text style={styles.editPatientText}>Editar cadastro</Text></Pressable> : null}
      {canManagePatientStatus ? <View style={styles.statusCard}>
        <Text style={styles.sectionTitle}>Status do cadastro</Text>
        <Text style={styles.statusDescription}>{patient.ativo === false ? 'Este cadastro está inativo e não pode receber novos agendamentos.' : 'Inative somente após concluir ou cancelar consultas atuais e remover o paciente da fila.'}</Text>
        {statusEditorOpen ? <>
          <Text style={styles.statusPrompt}>{patient.ativo === false ? 'Motivo da reativação' : 'Motivo da inativação'}</Text>
          <View style={styles.statusReasons}>{patientStatusReasons.map(reason => <Pressable key={reason.value} accessibilityRole="radio" accessibilityState={{ selected: statusReason === reason.value }} disabled={savingStatus} onPress={() => setStatusReason(reason.value)} style={[styles.statusReason, statusReason === reason.value && styles.statusReasonSelected]}><Ionicons name={statusReason === reason.value ? 'radio-button-on' : 'radio-button-off'} size={16} color={statusReason === reason.value ? colors.primary : colors.muted} /><Text style={[styles.statusReasonText, statusReason === reason.value && styles.statusReasonTextSelected]}>{reason.label}</Text></Pressable>)}</View>
          <View style={styles.statusActions}><Pressable accessibilityRole="button" disabled={savingStatus} onPress={() => { setStatusEditorOpen(false); setStatusReason(''); }} style={styles.statusCancel}><Text style={styles.statusCancelText}>Voltar</Text></Pressable><Pressable accessibilityRole="button" disabled={savingStatus || !statusReason} onPress={() => void changePatientStatus()} style={[styles.statusConfirm, (savingStatus || !statusReason) && styles.statusDisabled]}>{savingStatus ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.statusConfirmText}>{patient.ativo === false ? 'Reativar cadastro' : 'Inativar cadastro'}</Text>}</Pressable></View>
        </> : <Pressable accessibilityRole="button" onPress={() => { setStatusFeedback(null); setStatusEditorOpen(true); }} style={styles.statusOpen}><Ionicons name={patient.ativo === false ? 'checkmark-circle-outline' : 'remove-circle-outline'} size={17} color={patient.ativo === false ? colors.success : colors.danger} /><Text style={[styles.statusOpenText, patient.ativo === false && styles.statusOpenActive]}>{patient.ativo === false ? 'Reativar cadastro' : 'Inativar cadastro'}</Text></Pressable>}
        {statusFeedback ? <Text accessibilityRole="alert" style={[styles.statusFeedback, statusFeedback.error && styles.statusFeedbackError]}>{statusFeedback.message}</Text> : null}
      </View> : null}

      <Section title="Dados pessoais" icon="id-card-outline">
        <Info label="Nascimento" value={formatDate(patient.data_nascimento)} />
        <Info label="Sexo" value={patient.sexo ? ({ M: 'Masculino', F: 'Feminino', O: 'Outro' }[patient.sexo] ?? patient.sexo) : 'Não informado'} />
        <Info label="CPF" value={patient.cpf || 'Não informado'} />
      </Section>
      <Section title="Contato e endereço" icon="call-outline">
        <Info label="Telefone" value={patient.telefone || 'Não informado'} />
        <Info label="E-mail" value={patient.email || 'Não informado'} />
        <Info label="Endereço" value={address || 'Não informado'} />
        {patient.cep ? <Info label="CEP" value={patient.cep} /> : null}
      </Section>
      {patient.convenio_id || patient.numero_carteira || patient.validade_carteira ? <Section title="Convênio" icon="card-outline"><Info label="Plano" value={patient.convenios?.nome || 'Não informado'} /><Info label="Carteira" value={patient.numero_carteira || 'Não informado'} /><Info label="Validade" value={formatDate(patient.validade_carteira)} /></Section> : null}
      {allergies.length || patient.comorbidades || patient.gestante || patient.amamentando ? <Section title="Alertas informados no cadastro" icon="warning-outline" warning>
        {allergies.length ? <Info label="Alergias" value={allergies.join(', ')} /> : null}
        {patient.comorbidades ? <Info label="Comorbidades" value={patient.comorbidades} /> : null}
        {patient.gestante ? <Info label="Gestação" value="Informada no cadastro" /> : null}
        {patient.amamentando ? <Info label="Amamentação" value="Informada no cadastro" /> : null}
      </Section> : null}
      {patient.observacoes ? <Section title="Observações" icon="chatbox-ellipses-outline"><Text style={styles.notes}>{patient.observacoes}</Text></Section> : null}

      <View style={styles.historyHeading}><View><Text style={styles.historyTitle}>Consultas</Text><Text style={styles.historyCaption}>Histórico mais recente primeiro.</Text></View><Text style={styles.count}>{appointments.length}{hasMore ? '+' : ''}</Text></View>
      {appointments.length === 0 ? <View style={styles.empty}><Ionicons name="calendar-outline" size={22} color={colors.muted} /><Text style={styles.emptyText}>Nenhuma consulta no histórico.</Text></View> : appointments.map(item => <View key={item.id} style={styles.appointment}><View style={styles.appointmentTop}><Text style={styles.date}>{formatDate(item.data)} · {item.hora_inicio?.slice(0, 5)}</Text><Text style={styles.status}>{formatStatus(item.status)}</Text></View><Text style={styles.appointmentType}>{item.tipo || 'Consulta'}</Text>{item.medicos?.nome ? <Text style={styles.appointmentMeta}>{item.medicos.nome}{item.medicos.especialidade ? ` · ${item.medicos.especialidade}` : ''}</Text> : null}{item.salas?.nome ? <Text style={styles.appointmentMeta}>Sala: {item.salas.nome}</Text> : null}{item.observacoes ? <Text numberOfLines={2} style={styles.appointmentMeta}>{item.observacoes}</Text> : null}</View>)}
      {hasMore ? <Pressable accessibilityRole="button" disabled={loadingMore} onPress={() => void loadMoreAppointments()} style={styles.loadMore}>{loadingMore ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="time-outline" size={16} color={colors.primary} />}<Text style={styles.loadMoreText}>{loadingMore ? 'Carregando…' : 'Carregar consultas anteriores'}</Text></Pressable> : null}
    </> : null}
  </MobileScreen>;
}

function Section({ title, icon, children, warning = false }: { title: string; icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode; warning?: boolean }) {
  return <View style={[styles.section, warning && styles.warningSection]}><View style={styles.sectionHeading}><Ionicons name={icon} size={16} color={warning ? colors.warning : colors.primary} /><Text style={styles.sectionTitle}>{title}</Text></View><View style={styles.infoList}>{children}</View></View>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <View style={styles.info}><Text style={styles.infoLabel}>{label}</Text><Text selectable style={styles.infoValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  back: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', marginBottom: 7 }, backText: { color: colors.primary, fontSize: 13, fontWeight: '700' }, headingRow: { flexDirection: 'row', alignItems: 'flex-start' }, refresh: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginTop: 3, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  state: { minHeight: 140, alignItems: 'center', justifyContent: 'center', gap: 9 }, stateText: { color: colors.muted, fontSize: 12 }, errorState: { alignItems: 'center', paddingVertical: 35, paddingHorizontal: 24, gap: 10 }, errorText: { color: colors.ink, textAlign: 'center', fontSize: 13, lineHeight: 19 }, retry: { minHeight: 39, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 11, backgroundColor: colors.primarySoft }, retryText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, marginBottom: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, avatar: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.primarySoft }, name: { color: colors.ink, fontSize: 17, fontWeight: '800' }, legalName: { color: colors.muted, fontSize: 11, marginTop: 3 }, metaRow: { flexDirection: 'row', marginTop: 7 }, meta: { color: colors.success, fontSize: 10, fontWeight: '700' }, metaInactive: { color: colors.danger }, editPatient: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 12, borderWidth: 1, borderColor: colors.primary, borderRadius: 12, backgroundColor: colors.surface }, recordsAction: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 12, borderWidth: 1, borderColor: colors.primary, borderRadius: 12, backgroundColor: colors.primarySoft }, editPatientText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  statusCard: { padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, statusDescription: { color: colors.muted, fontSize: 11, lineHeight: 17 }, statusOpen: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 8, borderRadius: 11, backgroundColor: colors.background }, statusOpenText: { color: colors.danger, fontSize: 11, fontWeight: '700' }, statusOpenActive: { color: colors.success }, statusPrompt: { color: colors.ink, fontSize: 11, fontWeight: '700', marginTop: 12, marginBottom: 7 }, statusReasons: { gap: 5 }, statusReason: { minHeight: 37, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 10 }, statusReasonSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, statusReasonText: { color: colors.ink, fontSize: 10 }, statusReasonTextSelected: { color: colors.primary, fontWeight: '700' }, statusActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 }, statusCancel: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.background }, statusCancelText: { color: colors.ink, fontSize: 11, fontWeight: '700' }, statusConfirm: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, borderRadius: 10, backgroundColor: colors.danger }, statusConfirmText: { color: '#fff', fontSize: 11, fontWeight: '700' }, statusDisabled: { opacity: 0.5 }, statusFeedback: { color: colors.success, fontSize: 11, lineHeight: 17, marginTop: 10 }, statusFeedbackError: { color: colors.danger },
  section: { padding: 14, marginBottom: 11, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, warningSection: { borderColor: '#EED7AE', backgroundColor: '#FFFCF4' }, sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 11 }, sectionTitle: { color: colors.ink, fontSize: 12, fontWeight: '700' }, infoList: { gap: 10 }, info: { gap: 3 }, infoLabel: { color: colors.muted, fontSize: 10, fontWeight: '600' }, infoValue: { color: colors.ink, fontSize: 12, lineHeight: 18 }, notes: { color: colors.ink, fontSize: 12, lineHeight: 18 },
  historyHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 10 }, historyTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' }, historyCaption: { color: colors.muted, fontSize: 11, marginTop: 3 }, count: { color: colors.primary, fontSize: 12, fontWeight: '700' }, empty: { minHeight: 90, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 13 }, emptyText: { color: colors.muted, fontSize: 12 }, appointment: { padding: 13, marginBottom: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.surface }, appointmentTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }, date: { color: colors.ink, fontSize: 12, fontWeight: '700' }, status: { color: colors.primary, fontSize: 10, fontWeight: '700', textTransform: 'capitalize' }, appointmentType: { color: colors.ink, fontSize: 12, fontWeight: '600', marginTop: 7, textTransform: 'capitalize' }, appointmentMeta: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 }, loadMore: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 3, borderRadius: 12, backgroundColor: colors.primarySoft }, loadMoreText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
});
