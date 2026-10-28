import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AppRole } from '../../auth/AuthContext';
import { useAuth } from '../../auth/useAuth';
import { MobileScreen } from '../../components/MobileScreen';
import { ScreenHeading } from '../../components/ScreenHeading';
import { supabase } from '../../lib/supabase';
import { colors, radius } from '../../theme/tokens';

type PatientOption = { id: string; nome: string; nome_social: string | null; telefone: string | null };
type Professional = { id: string; nome: string; ativo: boolean | null };
type AppointmentType = { nome: string; duracao_minutos: number | null; ativo?: boolean | null };
type DayAppointment = { id: string; paciente_id: string; medico_id: string; sala_id: string | null; hora_inicio: string | null; hora_fim: string | null; status: string | null };
type Block = { dia_inteiro: boolean | null; hora_inicio: string | null; hora_fim: string | null; motivo: string | null; tipo: string | null };
type Availability = { hora_inicio: string | null; hora_fim: string | null };
type ExistingAppointment = { id: string; updated_at: string | null; status: string | null };
type ExistingAppointmentRow = ExistingAppointment & {
  paciente_id: string;
  medico_id: string;
  sala_id: string | null;
  data: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  tipo: string | null;
  observacoes: string | null;
  pacientes: PatientOption | null;
};

const roles: AppRole[] = ['admin', 'recepcao', 'enfermagem', 'medico'];
const activeReservationStatuses = ['cancelado', 'faltou'];

function todayAtClinic() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function dateToDisplay(value: string) {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : '';
}

function dateToIso(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

function toMinutes(value: string | null) {
  if (!value || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function endMinutes(start: string | null, end: string | null, defaultDuration = 30) {
  const startMinutes = toMinutes(start);
  if (startMinutes === null) return null;
  return end ? toMinutes(end) : startMinutes + defaultDuration;
}

export default function NewAppointmentScreen() {
  const { date: rawDate, appointmentId: rawAppointmentId } = useLocalSearchParams<{ date?: string; appointmentId?: string }>();
  const appointmentId = Array.isArray(rawAppointmentId) ? rawAppointmentId[0] : rawAppointmentId;
  const { session, profile, profileLoading } = useAuth();
  const clinicId = profile?.clinicaId;
  const canCreate = Boolean(profile?.roles.some(role => roles.includes(role)));
  const doctorOnly = Boolean(profile?.roles.includes('medico') && !profile.roles.some(role => ['admin', 'recepcao', 'enfermagem'].includes(role)));
  const [date, setDate] = useState(() => dateToDisplay(rawDate || todayAtClinic()));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('');
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<PatientOption[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState('');
  const [existingAppointment, setExistingAppointment] = useState<ExistingAppointment | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(Boolean(appointmentId));
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [selectedType, setSelectedType] = useState('Consulta');
  const [notes, setNotes] = useState('');
  const [rooms, setRooms] = useState<{ id: string; nome: string }[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [formUnavailable, setFormUnavailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [outsideHours, setOutsideHours] = useState('');

  const selectedTypeData = appointmentTypes.find(item => item.nome === selectedType);
  const duration = Number(selectedTypeData?.duracao_minutos) > 0 ? Number(selectedTypeData?.duracao_minutos) : 30;
  const suggestedEnd = useMemo(() => {
    const start = toMinutes(startTime);
    if (start === null) return '';
    const end = start + duration;
    if (end >= 24 * 60) return '';
    return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
  }, [duration, startTime]);

  useEffect(() => {
    if (profileLoading) return;
    setLoadingOptions(true);
    setLoadingExisting(Boolean(appointmentId));
    setExistingAppointment(null);
    setFormUnavailable(false);
    setError('');
    if (!session || !clinicId || !canCreate || !supabase) {
      setLoadingOptions(false);
      setLoadingExisting(false);
      setFormUnavailable(true);
      setError(!canCreate ? 'Esta conta não tem permissão para agendar.' : 'Não foi possível identificar a clínica ou conexão.');
      return;
    }
    let active = true;
    void (async () => {
      // The current generated types predate some scheduling relations and RPC shapes.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      let existing: ExistingAppointmentRow | null = null;
      if (appointmentId) {
        const { data: appointmentData, error: appointmentError } = await db.from('agendamentos')
          .select('id, paciente_id, medico_id, sala_id, data, hora_inicio, hora_fim, tipo, observacoes, status, updated_at, pacientes(id, nome, nome_social, telefone)')
          .eq('id', appointmentId)
          .eq('clinica_id', clinicId)
          .maybeSingle();
        if (appointmentError) throw appointmentError;
        if (!appointmentData) throw new Error('Atendimento não encontrado nesta clínica.');
        if (!['agendado', 'confirmado', 'aguardando'].includes(appointmentData.status ?? '')) {
          throw new Error('Este atendimento não pode mais ser editado pelo formulário.');
        }
        existing = appointmentData as ExistingAppointmentRow;
        if (!existing.pacientes) throw new Error('Não foi possível localizar o cadastro do paciente deste atendimento.');
      }
      let doctorId: string | null = null;
      if (doctorOnly) {
        const { data, error: doctorError } = await db.rpc('buscar_medico_atual');
        if (doctorError) throw doctorError;
        doctorId = data?.[0]?.id ?? null;
        if (!doctorId) throw new Error('Perfil profissional não vinculado a esta conta.');
      }
      const professionalsQuery = db.from('medicos')
        .select('id, nome, ativo')
        .eq('clinica_id', clinicId)
        .order('nome', { ascending: true })
        .limit(100);
      const typesQuery = db.from('tipos_consulta')
        .select('nome, duracao_minutos, ativo')
        .eq('clinica_id', clinicId)
        .order('nome', { ascending: true })
        .limit(50);
      const roomsQuery = db.from('salas').select('id, nome').eq('clinica_id', clinicId).order('nome', { ascending: true });
      const [professionalsResult, typesResult, roomsResult] = await Promise.all([professionalsQuery, typesQuery, roomsQuery]);
      if (professionalsResult.error) throw professionalsResult.error;
      if (typesResult.error) throw typesResult.error;
      const available = (professionalsResult.data ?? []) as Professional[];
      const scoped = (doctorId ? available.filter(item => item.id === doctorId) : available)
        .filter(item => item.ativo !== false || item.id === existing?.medico_id);
      if (!scoped.length) throw new Error('Nenhum profissional ativo disponível para agendamento.');
      if (active) {
        setProfessionals(scoped);
        setSelectedProfessionalId(existing?.medico_id || doctorId || scoped[0].id);
        const availableTypes = ((typesResult.data ?? []) as AppointmentType[])
          .filter(item => item.ativo !== false || item.nome === existing?.tipo);
        setAppointmentTypes(availableTypes);
        // Rooms are optional on the web form too; a failed lookup only hides the picker.
        setRooms(roomsResult.error ? [] : (roomsResult.data ?? []));
        setSelectedType(existing?.tipo || (availableTypes.some(item => item.nome === 'Consulta') ? 'Consulta' : availableTypes[0]?.nome || 'Consulta'));
        if (existing) {
          setExistingAppointment({ id: existing.id, updated_at: existing.updated_at, status: existing.status });
          setSelectedPatient(existing.pacientes);
          setDate(dateToDisplay(existing.data));
          setStartTime(existing.hora_inicio?.slice(0, 5) || '09:00');
          setEndTime(existing.hora_fim?.slice(0, 5) || '');
          setNotes(existing.observacoes || '');
          setSelectedRoomId(existing.sala_id || '');
        }
      }
    })().catch(reason => {
      if (active) {
        setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os dados para agendar.');
        setFormUnavailable(true);
      }
    }).finally(() => { if (active) { setLoadingOptions(false); setLoadingExisting(false); } });
    return () => { active = false; };
  }, [appointmentId, canCreate, clinicId, doctorOnly, profileLoading, session]);

  useEffect(() => {
    if (!session || !clinicId || !supabase || selectedPatient || patientQuery.trim().length < 2) {
      setPatientResults([]);
      setSearchingPatients(false);
      return;
    }
    let active = true;
    setSearchingPatients(true);
    const timer = setTimeout(() => {
      void (async () => {
        // This security-invoker RPC is the same clinic scoped patient search used by the web app.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabase as any;
        const { data, error: searchError } = await db.rpc('buscar_pacientes_paginado', {
          p_termo: patientQuery.trim(), p_limite: 8, p_offset: 0, p_status: 'ativos',
          p_sexo: null, p_convenio_id: null, p_somente_particular: false,
          p_nascimento_apos: null, p_nascimento_ate: null,
        });
        if (searchError) throw searchError;
        if (active) setPatientResults((data ?? []) as PatientOption[]);
      })().catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Falha ao buscar pacientes.'); })
        .finally(() => { if (active) setSearchingPatients(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [clinicId, patientQuery, selectedPatient, session]);

  async function saveAppointment(confirmOutside = false) {
    if (!supabase || !clinicId || saving) return;
    setError('');
    setOutsideHours('');
    const isoDate = dateToIso(date);
    const requestedStart = toMinutes(startTime.trim());
    const requestedEndInput = endTime.trim() ? toMinutes(endTime.trim()) : null;
    const requestedEnd = requestedEndInput ?? (requestedStart === null ? null : requestedStart + duration);
    if (!selectedPatient) { setError('Selecione um paciente para continuar.'); return; }
    if (!selectedProfessionalId) { setError('Selecione o profissional.'); return; }
    if (!isoDate || requestedStart === null) { setError('Informe uma data e um horário válidos.'); return; }
    if (endTime.trim() && requestedEndInput === null) { setError('Informe um horário de término válido.'); return; }
    if (requestedEnd === null || requestedEnd <= requestedStart || requestedEnd >= 24 * 60) { setError('O horário de término precisa ser após o início e antes da meia-noite.'); return; }
    if (['exame', 'exames'].includes(selectedType.toLocaleLowerCase('pt-BR')) && !notes.trim()) { setError('Informe qual exame será realizado nas observações.'); return; }

    setSaving(true);
    try {
      // Keep conflict validation aligned with web; never assume an errored lookup means free time.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [{ data: dayRows, error: dayError }, { data: blocks, error: blocksError }] = await Promise.all([
        db.from('agendamentos').select('id, paciente_id, medico_id, sala_id, hora_inicio, hora_fim, status').eq('clinica_id', clinicId).eq('data', isoDate),
        db.from('bloqueios_agenda').select('id, data_inicio, data_fim, hora_inicio, hora_fim, dia_inteiro, motivo, tipo').eq('medico_id', selectedProfessionalId).lte('data_inicio', isoDate).gte('data_fim', isoDate),
      ]);
      if (dayError) throw new Error('Não foi possível conferir os horários da agenda. Tente de novo antes de salvar.');
      if (blocksError) throw new Error('Não foi possível conferir os bloqueios deste profissional. Tente de novo antes de salvar.');

      const overlap = (item: DayAppointment) => {
        if (existingAppointment && item.id === existingAppointment.id) return false;
        if (activeReservationStatuses.includes(item.status ?? '')) return false;
        const existingStart = toMinutes(item.hora_inicio);
        const existingEnd = endMinutes(item.hora_inicio, item.hora_fim);
        return existingStart !== null && existingEnd !== null && existingStart < requestedEnd && existingEnd > requestedStart;
      };
      const items = (dayRows ?? []) as DayAppointment[];
      const doctorConflict = items.find(item => item.medico_id === selectedProfessionalId && overlap(item));
      if (doctorConflict) throw new Error('Este profissional já tem atendimento neste horário. Escolha outro horário.');
      const patientConflict = items.find(item => item.paciente_id === selectedPatient.id && overlap(item));
      if (patientConflict) throw new Error('Este paciente já tem outro atendimento neste horário. Escolha outro horário.');
      const roomConflict = selectedRoomId && items.find(item => item.sala_id === selectedRoomId && overlap(item));
      if (roomConflict) throw new Error('Esta sala já está reservada neste horário. Escolha outra sala ou horário.');

      const block = ((blocks ?? []) as Block[]).find(item => {
        if (item.dia_inteiro) return true;
        const blockStart = toMinutes(item.hora_inicio);
        const blockEnd = toMinutes(item.hora_fim);
        return blockStart !== null && blockEnd !== null && blockStart < requestedEnd && blockEnd > requestedStart;
      });
      if (block) throw new Error(`Horário bloqueado para este profissional: ${block.motivo || block.tipo || 'escolha outro horário.'}`);

      if (!confirmOutside) {
        const weekday = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
        const { data: shifts, error: availabilityError } = await db.from('medico_disponibilidade')
          .select('hora_inicio, hora_fim')
          .eq('medico_id', selectedProfessionalId).eq('dia_semana', weekday).eq('ativo', true);
        if (availabilityError) throw new Error('Não foi possível conferir o expediente do profissional. Tente novamente.');
        const withinShift = ((shifts ?? []) as Availability[]).some(item => {
          const shiftStart = toMinutes(item.hora_inicio);
          const shiftEnd = toMinutes(item.hora_fim);
          return shiftStart !== null && shiftEnd !== null && requestedStart >= shiftStart && requestedEnd <= shiftEnd;
        });
        if (!withinShift) {
          const summary = ((shifts ?? []) as Availability[]).map(item => `${item.hora_inicio?.slice(0, 5)}–${item.hora_fim?.slice(0, 5)}`).join(', ');
          setOutsideHours(summary ? `O expediente informado para este dia é ${summary}.` : 'Não há expediente cadastrado para este dia.');
          setSaving(false);
          return;
        }
      }

      const payload = {
        clinica_id: clinicId,
        paciente_id: selectedPatient.id,
        medico_id: selectedProfessionalId,
        data: isoDate,
        hora_inicio: `${startTime.trim()}:00`,
        hora_fim: `${String(Math.floor(requestedEnd / 60)).padStart(2, '0')}:${String(requestedEnd % 60).padStart(2, '0')}:00`,
        tipo: selectedType,
        observacoes: notes.trim() || null,
        sala_id: selectedRoomId || null,
      };
      let saveQuery = existingAppointment
        ? db.from('agendamentos').update(payload).eq('id', existingAppointment.id).eq('clinica_id', clinicId)
        : db.from('agendamentos').insert({ ...payload, status: 'agendado' });
      if (existingAppointment) {
        saveQuery = existingAppointment.updated_at
          ? saveQuery.eq('updated_at', existingAppointment.updated_at)
          : saveQuery.is('updated_at', null);
      }
      const { data, error: insertError } = existingAppointment
        ? await saveQuery.select('id').maybeSingle()
        : await saveQuery.select('id').single();
      if (insertError) throw insertError;
      if (existingAppointment && !data) throw new Error('Este atendimento foi alterado por outra pessoa. Volte e abra novamente antes de salvar.');
      router.replace({ pathname: '/appointments/[appointmentId]', params: { appointmentId: data.id } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o agendamento.');
    } finally {
      setSaving(false);
    }
  }

  return <MobileScreen>
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={19} color={colors.ink} /><Text style={styles.backText}>Voltar para agenda</Text></Pressable>
    <ScreenHeading title={appointmentId ? 'Editar agendamento' : 'Novo agendamento'} subtitle={appointmentId ? 'Atualize os dados do atendimento.' : 'Informe o paciente, profissional e horário.'} />
    {!profileLoading && !canCreate ? <Message icon="lock-closed-outline" text="Esta conta não tem permissão para agendar atendimentos." error /> : null}
    {loadingOptions || loadingExisting ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.helper}>Carregando {appointmentId ? 'atendimento' : 'opções da clínica'}…</Text></View> : null}
    {!loadingOptions && !loadingExisting && formUnavailable ? <Message icon="alert-circle-outline" text={error || 'Não foi possível carregar o formulário.'} error /> : null}
    {!loadingOptions && !loadingExisting && !formUnavailable && canCreate ? <>
      <FieldLabel label="Paciente" required />
      {selectedPatient ? <View style={styles.selectedPatient}><View style={styles.personIcon}><Ionicons name="person" size={16} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.optionTitle}>{selectedPatient.nome_social || selectedPatient.nome}</Text><Text style={styles.helper}>{selectedPatient.telefone || 'Telefone não informado'}</Text></View><Pressable accessibilityLabel="Remover paciente selecionado" onPress={() => { setSelectedPatient(null); setPatientQuery(''); }}><Ionicons name="close-circle" size={21} color={colors.muted} /></Pressable></View> : <>
        <TextInput accessibilityLabel="Buscar paciente" value={patientQuery} onChangeText={value => { setPatientQuery(value); setError(''); }} placeholder="Nome, telefone ou CPF" placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="words" />
        {searchingPatients ? <ActivityIndicator style={styles.inlineLoader} color={colors.primary} /> : null}
        {patientResults.map(patient => <Pressable key={patient.id} onPress={() => { setSelectedPatient(patient); setPatientQuery(''); setPatientResults([]); }} style={styles.patientResult}><View style={styles.personIcon}><Ionicons name="person-outline" size={16} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.optionTitle}>{patient.nome_social || patient.nome}</Text><Text style={styles.helper}>{patient.telefone || 'Paciente ativo'}</Text></View><Ionicons name="add-circle-outline" size={19} color={colors.primary} /></Pressable>)}
        {patientQuery.trim().length >= 2 && !searchingPatients && !patientResults.length && !error ? <Text style={styles.helper}>Nenhum paciente ativo encontrado.</Text> : null}
      </>}

      <FieldLabel label="Profissional" required />
      {professionals.map(item => <Choice key={item.id} label={item.nome} selected={selectedProfessionalId === item.id} onPress={() => setSelectedProfessionalId(item.id)} />)}

      {rooms.length ? <><FieldLabel label="Sala" /><Choice label="Sem sala" selected={!selectedRoomId} onPress={() => setSelectedRoomId('')} />{rooms.map(item => <Choice key={item.id} label={item.nome} selected={selectedRoomId === item.id} onPress={() => setSelectedRoomId(item.id)} />)}</> : null}
        <FieldLabel label="Tipo de atendimento" required />
      {appointmentTypes.length ? <View style={styles.choices}>{appointmentTypes.map(item => <Pressable key={item.nome} onPress={() => setSelectedType(item.nome)} style={[styles.typeChoice, selectedType === item.nome && styles.typeChoiceSelected]}><Text style={[styles.typeText, selectedType === item.nome && styles.typeTextSelected]}>{item.nome}</Text></Pressable>)}</View> : <Text style={styles.helper}>Nenhum tipo cadastrado. O atendimento será registrado como consulta.</Text>}

      <FieldLabel label="Data" required />
      <TextInput accessibilityLabel="Data do atendimento" value={date} onChangeText={setDate} placeholder="DD/MM/AAAA" placeholderTextColor={colors.muted} style={styles.input} keyboardType="numbers-and-punctuation" maxLength={10} />
      <View style={styles.fieldRow}><View style={{ flex: 1 }}><FieldLabel label="Início" required /><TextInput accessibilityLabel="Horário de início" value={startTime} onChangeText={setStartTime} placeholder="09:00" placeholderTextColor={colors.muted} style={styles.input} keyboardType="numbers-and-punctuation" maxLength={5} /></View><View style={{ flex: 1 }}><FieldLabel label="Término" /><TextInput accessibilityLabel="Horário de término" value={endTime} onChangeText={setEndTime} placeholder={suggestedEnd || 'Automático'} placeholderTextColor={colors.muted} style={styles.input} keyboardType="numbers-and-punctuation" maxLength={5} /></View></View>
      <FieldLabel label="Observações" />
      <TextInput accessibilityLabel="Observações do atendimento" value={notes} onChangeText={setNotes} placeholder="Informações para a recepção ou profissional" placeholderTextColor={colors.muted} style={[styles.input, styles.multiline]} multiline textAlignVertical="top" maxLength={2000} />
      {error ? <Message icon="alert-circle-outline" text={error} error /> : null}
      {outsideHours ? <View style={styles.warning}><Message icon="time-outline" text={outsideHours} /><Text style={styles.warningPrompt}>Deseja confirmar este encaixe fora do expediente?</Text><View style={styles.warningActions}><Pressable onPress={() => setOutsideHours('')} style={styles.cancel}><Text style={styles.cancelText}>Revisar horário</Text></Pressable><Pressable disabled={saving} onPress={() => { setOutsideHours(''); void saveAppointment(true); }} style={styles.confirm}><Text style={styles.confirmText}>Confirmar encaixe</Text></Pressable></View></View> : null}
      <Pressable accessibilityRole="button" disabled={saving || loadingOptions || !professionals.length} onPress={() => void saveAppointment()} style={({ pressed }) => [styles.save, pressed && styles.pressed, (saving || loadingOptions || !professionals.length) && styles.disabled]}>{saving ? <ActivityIndicator color="#fff" /> : <Ionicons name={appointmentId ? 'save-outline' : 'calendar-outline'} size={18} color="#fff" />}<Text style={styles.saveText}>{saving ? 'Salvando…' : appointmentId ? 'Salvar alterações' : 'Agendar atendimento'}</Text></Pressable>
    </> : null}
  </MobileScreen>;
}

function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
  return <Text style={styles.label}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text>;
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={[styles.professionalChoice, selected && styles.professionalChoiceSelected]}><Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={18} color={selected ? colors.primary : colors.muted} /><Text style={[styles.professionalName, selected && styles.professionalNameSelected]}>{label}</Text></Pressable>;
}

function Message({ icon, text, error = false }: { icon: keyof typeof Ionicons.glyphMap; text: string; error?: boolean }) {
  return <View accessibilityRole={error ? 'alert' : undefined} style={[styles.message, error && styles.messageError]}><Ionicons name={icon} size={17} color={error ? colors.danger : colors.warning} /><Text style={[styles.messageText, error && styles.messageErrorText]}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  back: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 4 }, backText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  loading: { minHeight: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, helper: { color: colors.muted, fontSize: 11, lineHeight: 16 }, label: { color: colors.ink, fontSize: 12, fontWeight: '700', marginTop: 17, marginBottom: 7 }, required: { color: colors.danger }, input: { minHeight: 46, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.ink, backgroundColor: colors.surface, fontSize: 13 }, multiline: { minHeight: 96 }, fieldRow: { flexDirection: 'row', gap: 12 },
  selectedPatient: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 13, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface }, personIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, optionTitle: { color: colors.ink, fontSize: 12, fontWeight: '700' }, patientResult: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surface }, inlineLoader: { marginVertical: 10 },
  professionalChoice: { minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 11, marginBottom: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, professionalChoiceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, professionalName: { color: colors.ink, fontSize: 12 }, professionalNameSelected: { color: colors.primary, fontWeight: '700' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, typeChoice: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, typeChoiceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, typeText: { color: colors.muted, fontSize: 11, fontWeight: '600' }, typeTextSelected: { color: colors.primary },
  message: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, marginTop: 14, borderRadius: 12, backgroundColor: colors.warningSoft }, messageText: { flex: 1, color: colors.ink, fontSize: 11, lineHeight: 17 }, messageError: { backgroundColor: '#FCEBED' }, messageErrorText: { color: colors.danger }, warning: { padding: 12, marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.warning, backgroundColor: colors.warningSoft }, warningPrompt: { color: colors.ink, fontSize: 12, fontWeight: '700', marginTop: 10 }, warningActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 12 }, cancel: { minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.surface }, cancelText: { color: colors.ink, fontSize: 11, fontWeight: '700' }, confirm: { minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.warning }, confirmText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  save: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, marginBottom: 18, borderRadius: 14, backgroundColor: colors.primary }, saveText: { color: '#fff', fontSize: 13, fontWeight: '700' }, pressed: { opacity: 0.8 }, disabled: { opacity: 0.5 },
});
